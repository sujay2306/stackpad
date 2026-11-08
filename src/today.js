// Today: one page per day in the Journal notebook.
//
// - A day page is a normal note with the deterministic id `day-YYYY-MM-DD` (local date),
//   so two devices writing on the same day converge on one note instead of duplicating it.
// - Nothing is stored until the first keystroke: until then the editor shows a virtual,
//   empty dated page. Skipped days leave no empty notes behind.
// - Open tasks from the most recent earlier page can be brought over with one tap. Never automatic.
import './styles/today.css';
import { TEMPLATES, tasks } from './templates.js';
import { htmlToText } from './io.js';
import { icon } from './icons.js';

export const JOURNAL_ID = 'journal';
const DAY_RE = /^day-(\d{4}-\d{2}-\d{2})$/;
const LOOKBACK_DAYS = 14;

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const shift = (k, n) => { const d = keyDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const dayId = (k) => `day-${k}`;
export const isDayId = (id) => DAY_RE.test(id || '');
const keyOf = (id) => (id || '').match(DAY_RE)?.[1] || null;
const fmt = (k, opts) => keyDate(k).toLocaleDateString('en-IN', opts);
const thisYear = (k) => k.slice(0, 4) === String(new Date().getFullYear());
const heading = (k) => fmt(k, { weekday: 'long', day: 'numeric', month: 'long', year: thisYear(k) ? undefined : 'numeric' });
const noteTitle = (k) => fmt(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function fromLabel(from, to) {
  const gap = Math.round((keyDate(to) - keyDate(from)) / 864e5);
  if (gap === 1) return 'yesterday';
  if (gap < 7) return fmt(from, { weekday: 'long' });
  return fmt(from, { day: 'numeric', month: 'short' });
}

/** Unchecked task items (with text) in a note's HTML. Same rule as the Home "Open tasks" widget. */
function openItems(doc) {
  return [...doc.querySelectorAll('ul[data-type="taskList"] > li[data-checked="false"]')]
    .map((li) => ({ li, p: li.querySelector(':scope > div > p') }))
    .filter(({ li, p }) => (p || li).textContent.trim());
}
const parse = (html) => new DOMParser().parseFromString(html || '', 'text/html');

/**
 * ctx: { S, api(), openNote(id, opts), touch(note), saveNote(n), saveNotebook(nb),
 *        renderNav(), renderList(), renderHead(), renderTags(), renderFooter(), setPane(p), flushNote(id), pending, toast(msg) }
 */
export function createToday(ctx) {
  const { S } = ctx;
  const $ = (s) => document.querySelector(s);
  let virtual = null; // date key of the unsaved page on screen, or null
  let shown = null;   // date key of the day page on screen (virtual or saved), or null

  // Header + quiet actions, mounted once above the title.
  const head = document.createElement('div');
  head.className = 'day-head';
  head.innerHTML = `
    <h1 class="day-title"></h1>
    <div class="day-nav">
      <button class="icon-btn" data-day="prev" aria-label="Previous day" title="Previous day">${icon('chevronLeft', 18)}</button>
      <button class="day-today" data-day="today">Today</button>
      <button class="icon-btn" data-day="next" aria-label="Next day" title="Next day">${icon('chevronRight', 18)}</button>
    </div>`;
  const actions = document.createElement('div');
  actions.className = 'day-actions';
  const title = $('#title');
  title.before(head);
  $('#tags').after(actions);
  head.onclick = (e) => {
    const b = e.target.closest('[data-day]');
    if (!b || !shown) return;
    open(b.dataset.day === 'today' ? dayKey() : shift(shown, b.dataset.day === 'prev' ? -1 : 1));
  };
  actions.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (b?.dataset.act === 'carry') carry();
    else if (b?.dataset.act === 'template') useTemplate();
  };

  function journalId() {
    if (S.notebooks.has(JOURNAL_ID)) return JOURNAL_ID;
    return [...S.notebooks.values()].find((b) => b.name.trim().toLowerCase() === 'journal')?.id || JOURNAL_ID;
  }
  function ensureJournal() {
    const id = journalId();
    if (S.notebooks.has(id)) return id;
    const now = Date.now();
    const nb = { id: JOURNAL_ID, name: 'Journal', created: now, updated: now };
    S.notebooks.set(nb.id, nb);
    ctx.saveNotebook(nb);
    return nb.id;
  }

  /** The most recent earlier page (within two weeks), if it still has open tasks. */
  function findCarry(key) {
    for (let i = 1; i <= LOOKBACK_DAYS; i++) {
      const k = shift(key, -i);
      const n = S.notes.get(dayId(k));
      if (!n || n.trashed) continue;
      if (!n.content?.includes('taskList')) return null;
      const count = openItems(parse(n.content)).length;
      return count ? { from: k, note: n, count } : null;
    }
    return null;
  }

  function isEmptyPage() {
    const n = S.notes.get(S.currentId);
    if (virtual) return true;
    return !!n && !n.trashed && ctx.api().editor.isEmpty;
  }

  /** Sync the day header with what the editor shows. Called from openNote and after edits. */
  function paint() {
    const n = S.notes.get(S.currentId);
    shown = virtual || keyOf(n?.id);
    $('#editorPane').classList.toggle('is-day', !!shown);
    if (!shown) { actions.innerHTML = ''; return; }
    if (S.view.kind === 'today') S.view.date = shown;
    head.querySelector('.day-title').textContent = heading(shown);
    head.querySelector('[data-day="today"]').hidden = shown === dayKey();
    const c = shown === dayKey() && !n?.trashed ? findCarry(shown) : null;
    actions.innerHTML =
      (c ? `<button class="day-link" data-act="carry">${icon('check', 16)}<span>Bring over ${plural(c.count, 'open task')} from ${fromLabel(c.from, shown)}</span></button>` : '') +
      (isEmptyPage() ? `<button class="day-link is-subtle" data-act="template">${icon('book', 16)}<span>Use journal template</span></button>` : '');
  }

  /** Show the page for `key` (default: today). Creates nothing. */
  function open(key = dayKey()) {
    S.view = { kind: 'today', date: key };
    $('#shell').classList.remove('is-home');
    const id = dayId(key);
    if (S.notes.has(id)) {
      virtual = null;
      ctx.openNote(id, { stay: true });
    } else {
      const prev = S.currentId;
      if (prev && ctx.pending.has(prev)) ctx.flushNote(prev);
      S.currentId = null;
      virtual = key;
      paint(); // before setContent so the placeholder reads the day state
      const pane = $('#editorPane');
      pane.classList.remove('is-empty', 'is-trashed');
      $('#trashBanner').hidden = true;
      ctx.api().setContent('');
      ctx.api().setEditable(true);
      $('#tags').innerHTML = '';
      $('#wordCount').textContent = '';
      $('#edited').textContent = '';
      $('#nbName').textContent = S.notebooks.get(journalId())?.name || 'Journal';
      $('#nbPicker').disabled = true;
      $('#edScroll').scrollTop = 0;
    }
    ctx.renderNav();
    ctx.renderList();
    ctx.setPane('editor');
    const n = S.notes.get(S.currentId);
    if (!n?.trashed && matchMedia('(pointer: fine)').matches) requestAnimationFrame(() => ctx.api().focus('end'));
  }

  /** First keystroke on a virtual page: create the note. Returns it, or null when nothing is virtual. */
  function materialize() {
    if (!virtual) return null;
    const key = virtual;
    virtual = null;
    const id = dayId(key);
    let n = S.notes.get(id);
    if (!n) {
      const now = Date.now();
      n = { id, notebookId: ensureJournal(), title: noteTitle(key), content: '', text: '', tags: [], pinned: false, created: now, updated: now, trashed: null };
      S.notes.set(id, n);
      ctx.saveNote(n);
    }
    S.currentId = id;
    ctx.renderHead();
    ctx.renderTags();
    ctx.renderNav();
    return n;
  }

  /** After an edit to a day page: keep the quiet actions in step with the content. */
  function changed(n) {
    if (n && keyOf(n.id) === shown) {
      const hasTemplate = !!actions.querySelector('[data-act="template"]');
      if (hasTemplate !== isEmptyPage()) paint();
    }
  }

  function insert(html, { replace = false } = {}) {
    const n = materialize() || S.notes.get(S.currentId);
    if (!n) return null;
    const empty = ctx.api().editor.isEmpty;
    n.content = replace || empty ? html : `${n.content || ''}${html}`;
    n.text = htmlToText(n.content);
    ctx.api().setContent(n.content, { focus: 'end' });
    ctx.touch(n);
    ctx.renderFooter();
    return n;
  }

  function carry() {
    if (!shown) return;
    const c = findCarry(shown);
    if (!c) { paint(); return; }
    const doc = parse(c.note.content);
    const items = openItems(doc);
    const mark = fmt(shown, { day: 'numeric', month: 'short' });
    const html = items.map(({ li, p }) => {
      const inner = p ? p.innerHTML.trim() : li.textContent.trim().replace(/[&<>]/g, (ch) => `&#${ch.charCodeAt(0)};`);
      li.setAttribute('data-checked', 'true');
      li.querySelector('input[type="checkbox"]')?.setAttribute('checked', 'checked');
      if (p) p.insertAdjacentHTML('beforeend', ` <em>carried to ${mark}</em>`);
      return inner;
    });
    c.note.content = doc.body.innerHTML;
    c.note.text = htmlToText(c.note.content);
    ctx.touch(c.note);
    insert(tasks(html));
    paint();
    ctx.toast(`Brought over ${plural(html.length, 'task')}`);
  }

  function useTemplate() {
    const t = TEMPLATES.find((x) => x.id === 'journal');
    if (!t) return;
    insert(t.html().replace(/^<p><em>[^<]*<\/em><\/p>/, ''), { replace: true });
    paint();
  }

  /** A synced note arrived. If it is the page we are showing virtually and nothing was typed, show it. */
  function onRemote(id) {
    if (virtual && id === dayId(virtual) && S.notes.has(id) && ctx.api().editor.isEmpty) {
      virtual = null;
      ctx.openNote(id, { stay: true });
    }
  }

  return {
    open,
    paint,
    materialize,
    changed,
    onRemote,
    clearVirtual: () => { virtual = null; },
    journalId,
    placeholder: () => (shown ? (shown === dayKey() ? "What's on your mind today?" : "What's on your mind?") : null),
  };
}
