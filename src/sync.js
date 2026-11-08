// Stackpad cloud sync: Supabase auth (Google) + local-first two-way sync.
//
// Model
// - IndexedDB stays the source of truth for the UI. Every local write lands in an
//   "outbox" (persisted), which is pushed to Supabase in the background.
// - Pulls use a server-assigned cursor (synced_at) so device clock skew can't hide rows.
// - Conflicts: last write wins by the note's own `updated` time. The server trigger
//   skips stale writes; the client skips stale pulls.
// - Deletes are pushed as tombstones (deleted = true) so other devices learn about them.
import * as store from './store.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const enabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const TABLE = { note: 'notes', notebook: 'notebooks' };
const KINDS = ['notebook', 'note']; // notebooks first so notes find their notebook
const PAGE = 500;
const MAX_BATCH_BYTES = 1_500_000;

let sb = null;
let user = null;
let state = { status: enabled ? 'signedout' : 'off', user: null, pending: 0, lastSynced: null, error: null };
let hooks = { onStatus: () => {}, onApply: () => {}, getLocal: () => null, getAll: () => ({ notes: [], notebooks: [] }), seededAt: 0 };

const outbox = new Map(); // `${kind}:${id}` -> { kind, op, id, value }
const suppress = new Set(); // writes we made ourselves while applying remote rows
let wiping = false;
let pushTimer = 0, pullTimer = 0, retryDelay = 4000;
let pushing = null, pulling = null, pullAgain = false;
let channel = null;

// ---------------------------------------------------------------------------
// status

function setState(patch) {
  state = { ...state, ...patch, pending: outbox.size };
  try { hooks.onStatus(state); } catch (err) { console.warn('[stackpad/sync] onStatus failed', err); }
}
export const getState = () => state;

// ---------------------------------------------------------------------------
// row mapping

const int = (v, fallback = Date.now()) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : fallback);

function toRow(kind, v) {
  if (kind === 'note') {
    return {
      user_id: user.id, id: v.id, notebook_id: v.notebookId ?? null,
      title: v.title || '', content: v.content || '', text: v.text || '',
      tags: Array.isArray(v.tags) ? v.tags.map(String) : [], pinned: !!v.pinned,
      created: int(v.created), updated: int(v.updated), trashed: v.trashed ? int(v.trashed) : null, deleted: false,
    };
  }
  return { user_id: user.id, id: v.id, name: v.name || 'Untitled', created: int(v.created), updated: int(v.updated), deleted: false };
}

function tombstone(kind, id, at) {
  const base = { user_id: user.id, id, created: at, updated: at, deleted: true };
  return kind === 'note'
    ? { ...base, notebook_id: null, title: '', content: '', text: '', tags: [], pinned: false, trashed: null }
    : { ...base, name: '' };
}

function fromRow(kind, r) {
  if (kind === 'note') {
    return {
      id: r.id, notebookId: r.notebook_id, title: r.title || '', content: r.content || '', text: r.text || '',
      tags: Array.isArray(r.tags) ? r.tags : [], pinned: !!r.pinned,
      created: int(r.created), updated: int(r.updated), trashed: r.trashed == null ? null : int(r.trashed),
    };
  }
  return { id: r.id, name: r.name || 'Untitled', created: int(r.created), updated: int(r.updated) };
}

// ---------------------------------------------------------------------------
// outbox

let saveOutboxTimer = 0;
function saveOutbox() {
  clearTimeout(saveOutboxTimer);
  saveOutboxTimer = setTimeout(() => store.setSetting('syncOutbox', [...outbox.values()]), 250);
}

function enqueue(entry) {
  outbox.set(`${entry.kind}:${entry.id}`, entry);
  saveOutbox();
  setState({});
  schedulePush();
}

function onLocalWrite({ kind, op, id, value }) {
  if (!TABLE[kind] || wiping) return;
  const key = `${kind}:${id}:${op === 'put' ? value?.updated : 'del'}`;
  if (suppress.delete(key)) return; // this write came from a pull
  enqueue({ kind, op, id, value: op === 'put' ? value : undefined, at: Date.now() });
}

// ---------------------------------------------------------------------------
// push

function schedulePush(delay = 1200) {
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, delay);
}

async function push() {
  if (!user || !outbox.size) return;
  if (pushing) return pushing;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setState({ status: 'offline' }); return; }
  pushing = (async () => {
    setState({ status: 'syncing' });
    try {
      const entries = [...outbox.values()];
      for (const kind of KINDS) {
        const mine = entries.filter((e) => e.kind === kind);
        let batch = [], size = 0;
        const flush = async () => {
          if (!batch.length) return;
          const rows = batch.map((e) => (e.op === 'put' ? toRow(kind, e.value) : tombstone(kind, e.id, e.at || Date.now())));
          const { error } = await sb.from(TABLE[kind]).upsert(rows, { onConflict: 'user_id,id' });
          if (error) throw error;
          for (const e of batch) {
            const key = `${e.kind}:${e.id}`;
            if (outbox.get(key) === e) outbox.delete(key); // unchanged while we were pushing
          }
          batch = []; size = 0;
        };
        for (const e of mine) {
          const bytes = e.value ? (e.value.content?.length || 0) + 512 : 256;
          if (batch.length && size + bytes > MAX_BATCH_BYTES) await flush();
          batch.push(e); size += bytes;
        }
        await flush();
      }
      saveOutbox();
      retryDelay = 4000;
      setState({ status: 'synced', lastSynced: Date.now(), error: null });
    } catch (err) {
      console.warn('[stackpad/sync] push failed', err);
      setState({ status: navigator.onLine === false ? 'offline' : 'error', error: err?.message || String(err) });
      schedulePush(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 120000);
    } finally {
      pushing = null;
    }
    if (outbox.size) schedulePush(300); // edits that arrived mid-push
  })();
  return pushing;
}

// ---------------------------------------------------------------------------
// pull

function schedulePull(delay = 400) {
  if (!user) return;
  clearTimeout(pullTimer);
  pullTimer = setTimeout(pull, delay);
}

async function applyRow(kind, r) {
  const local = hooks.getLocal(kind, r.id);
  const pending = outbox.get(`${kind}:${r.id}`);
  const remoteUpdated = int(r.updated, 0);
  if (pending && (pending.op === 'delete' || int(pending.value?.updated, 0) >= remoteUpdated)) return;
  if (r.deleted) {
    if (!local || int(local.updated, 0) > remoteUpdated) return;
    suppress.add(`${kind}:${r.id}:del`);
    await (kind === 'note' ? store.deleteNote(r.id) : store.deleteNotebook(r.id));
    hooks.onApply({ kind, op: 'delete', id: r.id });
    return;
  }
  if (local && int(local.updated, 0) >= remoteUpdated) return;
  const value = fromRow(kind, r);
  suppress.add(`${kind}:${r.id}:${value.updated}`);
  await (kind === 'note' ? store.saveNote(value) : store.saveNotebook(value));
  hooks.onApply({ kind, op: 'put', id: r.id, value });
}

async function pull() {
  if (!user) return;
  if (pulling) { pullAgain = true; return pulling; }
  if (navigator.onLine === false) { setState({ status: 'offline' }); return; }
  const uid = user.id;
  pulling = (async () => {
    setState({ status: 'syncing' });
    try {
      const key = `syncCursor:${uid}`;
      const cursor = { notebooks: '1970-01-01T00:00:00Z', notes: '1970-01-01T00:00:00Z', ...(await store.getSetting(key, {})) };
      for (const kind of KINDS) {
        const table = TABLE[kind];
        for (;;) {
          const { data, error } = await sb.from(table).select('*').gt('synced_at', cursor[table]).order('synced_at', { ascending: true }).limit(PAGE);
          if (error) throw error;
          if (!user || user.id !== uid) return; // signed out mid-pull
          for (const r of data) await applyRow(kind, r);
          if (data.length) cursor[table] = data[data.length - 1].synced_at;
          if (data.length < PAGE) break;
        }
      }
      await store.setSetting(key, cursor);
      setState({ status: outbox.size ? 'syncing' : 'synced', lastSynced: Date.now(), error: null });
    } catch (err) {
      console.warn('[stackpad/sync] pull failed', err);
      setState({ status: navigator.onLine === false ? 'offline' : 'error', error: err?.message || String(err) });
    } finally {
      pulling = null;
    }
    if (pullAgain) { pullAgain = false; schedulePull(200); }
  })();
  return pulling;
}

export async function syncNow() {
  if (!user) return;
  await push();
  await pull();
}

// ---------------------------------------------------------------------------
// session

function subscribe() {
  unsubscribe();
  const filter = `user_id=eq.${user.id}`;
  channel = sb
    .channel(`stackpad-${user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter }, () => schedulePull())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notebooks', filter }, () => schedulePull())
    .subscribe();
}
function unsubscribe() {
  if (channel) { try { sb.removeChannel(channel); } catch { /* ignore */ } channel = null; }
}

const profile = (u) => u && ({
  id: u.id,
  email: u.email || '',
  name: u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0],
  avatar: u.user_metadata?.avatar_url || u.user_metadata?.picture || '',
});

async function handleSession(session) {
  const next = session?.user || null;
  if ((next?.id || null) === (user?.id || null)) return;
  user = next;
  unsubscribe();
  if (!user) { setState({ status: 'signedout', user: null }); return; }
  setState({ status: 'syncing', user: profile(user) });

  // First time this account syncs on this device: upload what is already here.
  const last = await store.getSetting('syncUser', null);
  if (last !== user.id) {
    const { notes, notebooks } = hooks.getAll();
    const untouchedSeed = (r) => String(r.id).startsWith('seed-') && int(r.updated, 0) <= hooks.seededAt;
    for (const nb of notebooks) if (!untouchedSeed(nb)) outbox.set(`notebook:${nb.id}`, { kind: 'notebook', op: 'put', id: nb.id, value: nb });
    for (const n of notes) if (!untouchedSeed(n)) outbox.set(`note:${n.id}`, { kind: 'note', op: 'put', id: n.id, value: n });
    saveOutbox();
    await store.setSetting('syncUser', user.id);
  }
  subscribe();
  await push();
  await pull();
}

/**
 * Start sync. hooks:
 *  onStatus(state), onApply({kind, op, id, value}), getLocal(kind, id), getAll() -> {notes, notebooks}, seededAt
 */
export async function init(h) {
  hooks = { ...hooks, ...h };
  if (!enabled) { setState({ status: 'off' }); return; }
  try {
    const saved = await store.getSetting('syncOutbox', []);
    for (const e of Array.isArray(saved) ? saved : []) if (e && TABLE[e.kind] && e.id) outbox.set(`${e.kind}:${e.id}`, e);
    store.onLocalWrite(onLocalWrite);

    const { createClient } = await import('@supabase/supabase-js');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'stackpad-auth' },
    });
    sb.auth.onAuthStateChange((_event, session) => { setTimeout(() => handleSession(session), 0); });
    const { data } = await sb.auth.getSession();
    await handleSession(data?.session || null);

    addEventListener('online', () => syncNow());
    addEventListener('offline', () => setState({ status: 'offline' }));
    addEventListener('focus', () => schedulePull(100));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedulePull(100);
      else if (outbox.size) push();
    });
    setInterval(() => { if (user && document.visibilityState === 'visible') syncNow(); }, 60000);
  } catch (err) {
    console.warn('[stackpad/sync] init failed', err);
    setState({ status: 'error', error: err?.message || String(err) });
  }
}

export async function signIn() {
  if (!sb) return;
  const redirectTo = location.origin + location.pathname;
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

/** Push what we can, sign out, then wipe local data via `wipe()` without creating tombstones. */
export async function signOut(wipe) {
  if (!sb) return { unsynced: 0 };
  try { await push(); } catch { /* reported via status */ }
  const unsynced = outbox.size;
  await sb.auth.signOut().catch(() => {});
  user = null;
  unsubscribe();
  wiping = true;
  try { await wipe?.(); } finally { wiping = false; }
  outbox.clear();
  await store.setSetting('syncOutbox', []);
  await store.setSetting('syncUser', null);
  setState({ status: 'signedout', user: null, lastSynced: null, error: null });
  return { unsynced };
}

export const pendingCount = () => outbox.size;
export const isSignedIn = () => !!user;
