// Notewell persistence layer.
//
// IndexedDB ('notewell' v1) with three object stores:
//   notes      keyPath 'id'
//   notebooks  keyPath 'id'
//   settings   out-of-line keys
//
// Design rules:
// - No exported function ever throws or rejects. Failures are console.warn'ed
//   and the operation degrades to an in-memory Map store so the session keeps
//   working (data written there is lost on reload; init() reports
//   persistent:false when we start in that mode).
// - Last write wins for rapid autosaves of the same id. IndexedDB guarantees
//   that readwrite transactions with overlapping scopes run in the order they
//   were *created*. Every write creates its transaction synchronously after a
//   single `await getDb()`; awaiting the same already-settled promise resumes
//   continuations in FIFO order, so transactions are created in call order and
//   commit in call order. We additionally keep a per-key write chain so the
//   fallback path (memory write after an IDB failure) and the broadcast also
//   happen in call order. Because the chain defers the actual put(), records
//   are snapshotted synchronously at call time: an autosave that mutates the
//   same note object after calling saveNote() cannot alter a queued write.
// - Cross-tab sync: one BroadcastChannel instance per tab is used both for
//   sending and receiving. A BroadcastChannel never delivers a message to the
//   instance that posted it, so listeners only see changes from OTHER tabs.

import { openDB } from 'idb';

const DB_NAME = 'notewell';
const DB_VERSION = 1;
const OPEN_TIMEOUT_MS = 5000; // Safari has shipped versions where open() never settles.

// ---------------------------------------------------------------------------
// ids

let lastTime = 0;
let seq = 0;

/** Time-sortable id: prefix + base36 ms timestamp (fixed width) + counter + random. */
export const uid = (prefix = '') => {
  const now = Date.now();
  if (now === lastTime) seq++;
  else { lastTime = now; seq = 0; }
  const time = now.toString(36).padStart(9, '0');
  const counter = seq.toString(36).padStart(2, '0');
  let rand = '';
  try {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) rand += (b % 36).toString(36);
  } catch {
    rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  }
  return prefix + time + counter + rand;
};

// ---------------------------------------------------------------------------
// state

/** In-memory store: full store when IDB is unavailable, overlay for failed writes otherwise. */
const mem = {
  notes: new Map(),
  notebooks: new Map(),
  settings: new Map(),
};

let db = null;          // open IDBPDatabase, or null
let dbPromise = null;   // in-flight / settled open attempt
let memoryOnly = false; // true once we've decided IDB is unusable for this session

const warn = (...args) => console.warn('[notewell/store]', ...args);

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`IndexedDB open timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function openDatabase() {
  if (typeof indexedDB === 'undefined' || !indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  const opening = openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('notes')) database.createObjectStore('notes', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('notebooks')) database.createObjectStore('notebooks', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings');
    },
    blocked() {
      warn('Database upgrade blocked by another tab; waiting.');
    },
    blocking() {
      // A newer version is being opened elsewhere (e.g. after an app update).
      // Close so it can proceed; subsequent operations will try to reopen.
      warn('Another tab needs a newer database version; closing this connection.');
      try { db && db.close(); } catch { /* ignore */ }
      db = null;
      dbPromise = null;
    },
    terminated() {
      warn('Database connection was terminated by the browser; will reopen on next use.');
      db = null;
      dbPromise = null;
    },
  });
  // If the timeout wins but the open later succeeds, don't leak the connection.
  return withTimeout(opening, OPEN_TIMEOUT_MS).catch((err) => {
    opening.then((late) => { if (late !== db) late.close(); }, () => {});
    throw err;
  });
}

/** Resolves to an open DB, or null when we're in memory mode. Never rejects. */
function getDb() {
  if (memoryOnly) return Promise.resolve(null);
  if (db) return Promise.resolve(db);
  if (!dbPromise) {
    dbPromise = openDatabase().then(
      (opened) => { db = opened; return opened; },
      (err) => {
        warn('Falling back to in-memory storage:', err && err.message ? err.message : err);
        memoryOnly = true;
        return null;
      },
    );
  }
  return dbPromise;
}

// Per-key promise chains: keeps write → fallback → broadcast in call order.
const chains = new Map();
function serialize(key, task) {
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(task, task);
  const tail = next.catch(() => {});
  chains.set(key, tail);
  tail.then(() => { if (chains.get(key) === tail) chains.delete(key); });
  return next;
}

// ---------------------------------------------------------------------------
// broadcast

let channel = null;
const listeners = new Set();

function getChannel() {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    channel = new BroadcastChannel('notewell');
    channel.onmessage = (event) => {
      const msg = event && event.data;
      if (!msg || (msg.kind !== 'note' && msg.kind !== 'notebook') || typeof msg.id !== 'string') return;
      // Keep the memory mirror coherent if this tab is running memory-only.
      if (memoryOnly) {
        const map = msg.kind === 'note' ? mem.notes : mem.notebooks;
        if (msg.op === 'put' && msg.value) map.set(msg.id, msg.value);
        else if (msg.op === 'delete') map.delete(msg.id);
      }
      for (const cb of listeners) {
        try { cb(msg); } catch (err) { warn('onRemoteChange listener threw:', err); }
      }
    };
  } catch (err) {
    warn('BroadcastChannel unavailable:', err);
    channel = null;
  }
  return channel;
}

function broadcast(kind, op, id, value) {
  const ch = getChannel();
  if (!ch) return;
  const msg = { kind, op, id };
  if (op === 'put' && value !== undefined) msg.value = value;
  try {
    ch.postMessage(msg);
  } catch (err) {
    // e.g. DataCloneError on an unclonable value: still announce the change.
    try { ch.postMessage({ kind, op, id }); } catch { warn('Broadcast failed:', err); }
  }
}

// ---------------------------------------------------------------------------
// public API

/** Opens the DB and loads everything. Returns { notes, notebooks, persistent }. */
export async function init() {
  getChannel();
  const database = await getDb();
  if (database) {
    try {
      const tx = database.transaction(['notes', 'notebooks'], 'readonly');
      const [notes, notebooks] = await Promise.all([
        tx.objectStore('notes').getAll(),
        tx.objectStore('notebooks').getAll(),
        tx.done,
      ]);
      return { notes, notebooks, persistent: true };
    } catch (err) {
      // An open-but-unreadable DB is not safe to write into blindly; run this
      // session from memory so we don't mix new data with data we can't see.
      warn('Reading IndexedDB failed; using in-memory storage for this session:', err);
      memoryOnly = true;
    }
  }
  return { notes: [...mem.notes.values()], notebooks: [...mem.notebooks.values()], persistent: false };
}

/** Synchronous deep copy so later caller mutations can't leak into a queued write. */
function snapshot(value) {
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch { /* fall through */ }
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

async function putRecord(storeName, kind, input) {
  if (!input || typeof input.id !== 'string' || !input.id) {
    warn(`save${kind === 'note' ? 'Note' : 'Notebook'}: record without a string id ignored`, input);
    return;
  }
  // Snapshot NOW: the write itself may run a few microtasks later (see chain).
  const record = snapshot(input);
  const { id } = record;
  await serialize(`${storeName}:${id}`, async () => {
    const database = await getDb();
    let stored = false;
    if (database) {
      try {
        await database.put(storeName, record);
        stored = true;
        mem[storeName].delete(id); // drop stale overlay entry, IDB is authoritative again
      } catch (err) {
        warn(`Writing ${kind} ${id} to IndexedDB failed; kept in memory:`, err);
      }
    }
    if (!stored) mem[storeName].set(id, record);
    broadcast(kind, 'put', id, record);
  }).catch((err) => warn(`save ${kind} failed:`, err));
}

async function deleteRecord(storeName, kind, id) {
  if (typeof id !== 'string' || !id) return;
  await serialize(`${storeName}:${id}`, async () => {
    mem[storeName].delete(id);
    const database = await getDb();
    if (database) {
      try { await database.delete(storeName, id); } catch (err) { warn(`Deleting ${kind} ${id} failed:`, err); }
    }
    broadcast(kind, 'delete', id);
  }).catch((err) => warn(`delete ${kind} failed:`, err));
}

export async function saveNote(note) { return putRecord('notes', 'note', note); }
export async function deleteNote(id) { return deleteRecord('notes', 'note', id); }
export async function saveNotebook(nb) { return putRecord('notebooks', 'notebook', nb); }
export async function deleteNotebook(id) { return deleteRecord('notebooks', 'notebook', id); }

/** Writes many records in ONE transaction (seed / import). All-or-nothing in IDB. */
export async function bulkPut({ notes = [], notebooks = [] } = {}) {
  try {
    const valid = (list) => (Array.isArray(list) ? list : []).filter((n) => n && typeof n.id === 'string' && n.id);
    const validNotes = snapshot(valid(notes));
    const validNbs = snapshot(valid(notebooks));
    if (!validNotes.length && !validNbs.length) return;

    // Let any in-flight single-record writes for these ids land first, so the
    // bulk values win (they were requested later).
    const pending = [
      ...validNotes.map((n) => chains.get(`notes:${n.id}`)),
      ...validNbs.map((n) => chains.get(`notebooks:${n.id}`)),
    ].filter(Boolean);
    if (pending.length) await Promise.all(pending);

    const database = await getDb();
    let stored = false;
    if (database) {
      try {
        const tx = database.transaction(['notes', 'notebooks'], 'readwrite');
        const noteStore = tx.objectStore('notes');
        const nbStore = tx.objectStore('notebooks');
        for (const nb of validNbs) nbStore.put(nb);
        for (const n of validNotes) noteStore.put(n);
        await tx.done;
        stored = true;
        for (const nb of validNbs) mem.notebooks.delete(nb.id);
        for (const n of validNotes) mem.notes.delete(n.id);
      } catch (err) {
        warn('Bulk write to IndexedDB failed; kept in memory:', err);
      }
    }
    if (!stored) {
      for (const nb of validNbs) mem.notebooks.set(nb.id, nb);
      for (const n of validNotes) mem.notes.set(n.id, n);
    }
    for (const nb of validNbs) broadcast('notebook', 'put', nb.id, nb);
    for (const n of validNotes) broadcast('note', 'put', n.id, n);
  } catch (err) {
    warn('bulkPut failed:', err);
  }
}

export async function getSetting(key, fallback) {
  try {
    if (mem.settings.has(key)) return mem.settings.get(key);
    const database = await getDb();
    if (!database) return fallback;
    const value = await database.get('settings', key);
    return value === undefined ? fallback : value;
  } catch (err) {
    warn(`getSetting(${key}) failed:`, err);
    return fallback;
  }
}

export async function setSetting(key, value) {
  try {
    await serialize(`settings:${key}`, async () => {
      const database = await getDb();
      if (database) {
        try {
          await database.put('settings', value, key);
          mem.settings.delete(key);
          return;
        } catch (err) {
          warn(`setSetting(${key}) failed; kept in memory:`, err);
        }
      }
      mem.settings.set(key, value);
    });
  } catch (err) {
    warn(`setSetting(${key}) failed:`, err);
  }
}

/** Subscribe to changes made in other tabs. Returns an unsubscribe function. */
export function onRemoteChange(cb) {
  if (typeof cb !== 'function') return () => {};
  getChannel();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Ask the browser not to evict our storage under pressure. Resolves to a boolean. */
export function requestPersistence() {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage || typeof storage.persist !== 'function') return Promise.resolve(false);
    return storage.persist().then((granted) => !!granted, () => false);
  } catch {
    return Promise.resolve(false);
  }
}
