// Stackpad app shell: layout, navigation, notebooks, note list, search palette, menus and autosave.
import './styles/tokens.css';
import './styles/prose.css';
import './styles/editor-ui.css';
import './styles/app.css';

import * as store from './store.js';
import * as io from './io.js';
import { createEditor } from './editor.js';
import { TEMPLATES } from './templates.js';
import { seedData } from './seed.js';
import * as sync from './sync.js';
import { icon, LOGO } from './icons.js';

const APP = 'Stackpad';
const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl+';
const ALT = IS_MAC ? '⌥' : 'Alt+';

// ---------- tiny helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const isTyping = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function relTime(ts) {
  const d = Date.now() - ts;
  if (d < 45e3) return 'Just now';
  if (d < 3600e3) return `${Math.round(d / 60e3)} min ago`;
  const date = new Date(ts), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(date.toDateString())) / 864e5);
  if (days === 0) return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-IN', { weekday: 'long' });
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
const fullDate = (ts) => new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// ---------- state ----------
const S = {
  notes: new Map(),
  notebooks: new Map(),
  view: { kind: 'all' }, // all | notebook{id} | tag{tag} | trash
  currentId: null,
  sort: 'updated',
  pane: 'list', // mobile: nav | list | editor
  focus: false,
  persistent: true,
};
const pending = new Map(); // noteId -> timer
let api = null; // editor api
let suppressChange = false;
let booting = true;

// ---------- persistence ----------
function queueSave(note) {
  clearTimeout(pending.get(note.id));
  pending.set(note.id, setTimeout(() => flushNote(note.id), 350));
  setSaveState('saving');
}
async function flushNote(id) {
  clearTimeout(pending.get(id));
  pending.delete(id);
  const n = S.notes.get(id);
  if (n) await store.saveNote(n);
  if (!pending.size) setSaveState('saved');
}
const flushAll = () => Promise.all([...pending.keys()].map(flushNote));

function touch(note, { list = true } = {}) {
  note.updated = Date.now();
  queueSave(note);
  if (list) scheduleListRender();
  if (note.id === S.currentId) renderFooter();
}

function setSaveState(s) {
  const node = $('#saveState');
  if (!node) return;
  node.dataset.state = s;
  node.textContent = s === 'saving' ? 'Saving' : 'Saved';
}

// ---------- derived data ----------
const liveNotes = () => [...S.notes.values()].filter((n) => !n.trashed);
const notebookList = () => [...S.notebooks.values()].sort((a, b) => a.name.localeCompare(b.name));
function allTags() {
  const m = new Map();
  for (const n of liveNotes()) for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
function defaultNotebookId() {
  if (S.view.kind === 'notebook' && S.notebooks.has(S.view.id)) return S.view.id;
  const cur = S.notes.get(S.currentId);
  if (cur && S.notebooks.has(cur.notebookId)) return cur.notebookId;
  return notebookList()[0]?.id;
}
function notesInView(v = S.view) {
  let arr = [...S.notes.values()];
  if (v.kind === 'trash') arr = arr.filter((n) => n.trashed);
  else {
    arr = arr.filter((n) => !n.trashed);
    if (v.kind === 'notebook') arr = arr.filter((n) => n.notebookId === v.id);
    if (v.kind === 'tag') arr = arr.filter((n) => n.tags.includes(v.tag));
  }
  const by = {
    updated: (a, b) => b.updated - a.updated,
    created: (a, b) => b.created - a.created,
    title: (a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'),
  }[S.sort];
  if (v.kind === 'trash') return arr.sort((a, b) => b.trashed - a.trashed);
  return arr.sort(by);
}
function viewTitle(v = S.view) {
  if (v.kind === 'all' || v.kind === 'home') return 'Notes';
  if (v.kind === 'trash') return 'Trash';
  if (v.kind === 'notebook') return S.notebooks.get(v.id)?.name || 'Notebook';
  if (v.kind === 'tag') return `#${v.tag}`;
}
const sameView = (a, b) => a.kind === b.kind && a.id === b.id && a.tag === b.tag;
const firstImage = (html) => (html || '').match(/<img[^>]+src="([^"]+)"/)?.[1];

// ---------- shell ----------
function mountShell() {
  $('#app').innerHTML = `
  <div class="shell" id="shell">
    <aside class="sidebar" aria-label="Navigation">
      <div class="brand">${LOGO}<span>${APP}</span></div>
      <div class="new-row">
        <button class="btn-new" id="newNote" title="New note (${ALT}N)">${icon('plus', 17)}<span>New note</span></button>
        <button class="btn-new-more" id="newFromTemplate" aria-label="New from template" title="New from template">${icon('template', 17)}</button>
      </div>
      <button class="search-trigger" id="openSearch">${icon('search', 16)}<span>Search</span><kbd>${MOD}K</kbd></button>
      <nav class="nav" id="nav"></nav>
      <div class="account" id="account" hidden></div>
      <div class="side-foot">
        <button class="foot-btn" id="themeBtn" aria-label="Appearance" title="Appearance">${icon('sun', 17)}</button>
        <button class="foot-btn" id="importBtn" aria-label="Import" title="Import notes">${icon('upload', 17)}</button>
        <button class="foot-btn" id="exportBtn" aria-label="Export backup" title="Export backup">${icon('download', 17)}</button>
        <button class="foot-btn" id="keysBtn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">${icon('keyboard', 17)}</button>
      </div>
    </aside>

    <section class="list" aria-label="Notes">
      <header class="list-head">
        <button class="icon-btn only-mobile" id="toNav" aria-label="Open navigation">${icon('menu')}</button>
        <div class="list-heading"><h2 id="listTitle"></h2><span id="listCount"></span></div>
        <button class="icon-btn" id="sortBtn" aria-label="Sort" title="Sort">${icon('sort')}</button>
        <button class="icon-btn" id="listMore" aria-label="More" title="More">${icon('more')}</button>
        <button class="icon-btn only-mobile" data-m="theme" aria-label="Appearance">${icon('sun')}</button>
        <button class="icon-btn only-mobile m-acct" data-m="acct" aria-label="Account">${icon('cloud')}</button>
        <button class="icon-btn only-mobile" id="newNoteMobile" aria-label="New note">${icon('plus')}</button>
      </header>
      <div class="list-body" id="listBody" role="listbox" aria-label="Notes"></div>
    </section>

    <main class="editor-pane" id="editorPane">
      <header class="ed-head">
        <button class="icon-btn only-mobile" id="toList" aria-label="Back to notes">${icon('chevronLeft')}</button>
        <button class="crumb" id="nbPicker" title="Move to notebook">${icon('book', 15)}<span id="nbName"></span>${icon('chevronDown', 14)}</button>
        <span class="grow"></span>
        <span class="save-state" id="saveState" data-state="saved">Saved</span>
        <button class="icon-btn" id="focusBtn" aria-label="Focus mode" title="Focus mode (${MOD}${IS_MAC ? '⇧' : 'Shift+'}F)">${icon('expand')}</button>
        <button class="icon-btn" id="noteMore" aria-label="Note actions" title="Note actions">${icon('more')}</button>
      </header>
      <div class="trash-banner" id="trashBanner" hidden>
        <span>This note is in Trash.</span>
        <button class="btn-quiet" id="restoreBtn">${icon('restore', 15)} Restore</button>
        <button class="btn-quiet danger" id="purgeBtn">Delete forever</button>
      </div>
      <div class="tb-wrap" id="toolbar"></div>
      <div class="ed-scroll" id="edScroll">
        <article class="page">
          <textarea id="title" class="title" rows="1" placeholder="Untitled" aria-label="Title" spellcheck="true"></textarea>
          <div class="tags" id="tags"></div>
          <div id="editor" class="editor-host"></div>
        </article>
      </div>
      <footer class="ed-foot"><span id="wordCount"></span><span id="edited"></span></footer>
      <div class="ed-empty" id="edEmpty">
        <div class="empty-mark">${icon('notes', 28)}</div>
        <h3>Nothing open</h3>
        <p>Pick a note from the list, or start a fresh page.</p>
        <button class="btn-primary" id="emptyNew">${icon('plus', 16)} New note</button>
        <div class="empty-keys"><span><kbd>${ALT}N</kbd> new note</span><span><kbd>${MOD}K</kbd> search</span><span><kbd>/</kbd> blocks</span></div>
      </div>
    </main>
    <section class="home" id="home" aria-label="Home"></section>
  </div>
  <input type="file" id="importInput" accept=".json,.md,.markdown,.txt,.html,.htm" multiple hidden>`;

  $('#newNote').onclick = () => newNote();
  $('#newNoteMobile').onclick = () => newNote();
  $('#emptyNew').onclick = () => newNote();
  $('#newFromTemplate').onclick = (e) => templateMenu(e.currentTarget);
  $('#openSearch').onclick = openPalette;
  $('#themeBtn').onclick = (e) => themeMenu(e.currentTarget);
  $('#importBtn').onclick = () => $('#importInput').click();
  $('#importInput').onchange = (e) => { importFiles([...e.target.files]); e.target.value = ''; };
  $('#exportBtn').onclick = exportBackup;
  $('#keysBtn').onclick = showShortcuts;
  $('#sortBtn').onclick = (e) => sortMenu(e.currentTarget);
  $('#listMore').onclick = (e) => listMenu(e.currentTarget);
  $('#toNav').onclick = () => setPane('nav');
  $('#toList').onclick = () => setPane('list');
  $('#nbPicker').onclick = (e) => { const n = current(); if (n && !n.trashed) moveMenu(e.currentTarget, n); };
  $('#focusBtn').onclick = toggleFocus;
  $('#noteMore').onclick = (e) => { const n = current(); if (n) noteMenu(e.currentTarget, n); };
  $('#restoreBtn').onclick = () => { const n = current(); if (n) restoreNote(n); };
  $('#purgeBtn').onclick = () => { const n = current(); if (n) purgeNote(n); };

  // Title
  const title = $('#title');
  title.addEventListener('input', () => {
    autosize(title);
    const n = current();
    if (!n || n.trashed) return;
    n.title = title.value.replace(/\n/g, ' ');
    touch(n);
  });
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && title.selectionStart === title.value.length)) {
      e.preventDefault();
      api?.editor.view.focus(); // synchronous, so fast typing can't land in the title
      api?.focus('start');
    }
  });

  // Editor
  api = createEditor({
    element: $('#editor'),
    toolbar: $('#toolbar'),
    onChange: (editor) => {
      if (suppressChange) return;
      const n = current();
      if (!n || n.trashed) return;
      n.content = editor.getHTML();
      n.text = editor.getText({ blockSeparator: '\n' });
      touch(n);
    },
    onImage: async (file) => {
      try { return await io.compressImage(file); }
      catch (err) { toast(err?.message || 'That file could not be added.'); throw err; }
    },
  });
}

function autosize(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
const current = () => S.notes.get(S.currentId) || null;

// ---------- sidebar ----------
function renderNav() {
  const live = liveNotes();
  const trash = S.notes.size - live.length;
  const counts = new Map();
  for (const n of live) counts.set(n.notebookId, (counts.get(n.notebookId) || 0) + 1);
  const item = (v, ic, label, count, extra = '') => `
    <button class="nav-item ${sameView(v, S.view) ? 'is-active' : ''}" data-view='${esc(JSON.stringify(v))}'>
      ${icon(ic, 17)}<span class="nav-label">${esc(label)}</span>${extra}<span class="nav-count">${count || ''}</span>
    </button>`;
  const nbs = notebookList();
  const tags = allTags();
  $('#nav').innerHTML = `
    ${item({ kind: 'home' }, 'home', 'Home', '')}
    ${item({ kind: 'all' }, 'notes', 'Notes', live.length)}
    <div class="nav-section"><span>Notebooks</span><button class="mini-btn" id="addNotebook" aria-label="New notebook" title="New notebook">${icon('plus', 15)}</button></div>
    ${nbs.map((nb) => item({ kind: 'notebook', id: nb.id }, 'book', nb.name, counts.get(nb.id) || 0, `<span class="nav-more" data-nb="${esc(nb.id)}" role="button" aria-label="Notebook options">${icon('more', 15)}</span>`)).join('')}
    ${tags.length ? `<div class="nav-section"><span>Tags</span></div>${tags.map(([t, c]) => item({ kind: 'tag', tag: t }, 'tag', t, c)).join('')}` : ''}
    <div class="nav-spacer"></div>
    ${item({ kind: 'trash' }, 'trash', 'Trash', trash)}`;

  $$('.nav-item', $('#nav')).forEach((b) => {
    b.onclick = (e) => {
      const more = e.target.closest('.nav-more');
      if (more) { e.stopPropagation(); notebookMenu(more, S.notebooks.get(more.dataset.nb)); return; }
      setView(JSON.parse(b.dataset.view));
    };
    b.oncontextmenu = (e) => {
      const v = JSON.parse(b.dataset.view);
      if (v.kind !== 'notebook') return;
      e.preventDefault();
      notebookMenu(b, S.notebooks.get(v.id));
    };
  });
  $('#addNotebook').onclick = createNotebook;
}

function setView(v, { keepNote = false } = {}) {
  S.view = v;
  $('#shell').classList.toggle('is-home', v.kind === 'home');
  if (v.kind === 'home') { renderNav(); renderHome(); setPane('list'); return; }
  renderNav();
  renderList();
  setPane('list');
  if (!keepNote) {
    const list = notesInView();
    const cur = current();
    const curVisible = cur && list.includes(cur);
    if (!curVisible && !matchMedia('(max-width: 859px)').matches) openNote(list[0]?.id || null);
  }
}

// ---------- home dashboard ----------
function openTasks() {
  const out = [];
  const parser = new DOMParser();
  for (const n of liveNotes().sort((a, b) => b.updated - a.updated)) {
    if (!n.content || !n.content.includes('taskList')) continue;
    const doc = parser.parseFromString(n.content, 'text/html');
    doc.querySelectorAll('ul[data-type="taskList"] > li[data-checked="false"]').forEach((li) => {
      const t = (li.querySelector(':scope > div > p') || li).textContent.trim();
      if (t) out.push({ text: t, note: n });
    });
    if (out.length >= 40) break;
  }
  return out;
}
let scratchTimer;
function renderHome() {
  const home = $('#home');
  const h = new Date().getHours();
  const greet = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const recent = liveNotes().sort((a, b) => b.updated - a.updated).slice(0, 10);
  const tasks = openTasks();
  const nbName = (n) => esc(S.notebooks.get(n.notebookId)?.name || '');
  home.innerHTML = `
    <div class="home-inner">
      <header class="home-hero">
        <button class="icon-btn only-mobile" id="homeToNav" aria-label="Open navigation">${icon('menu')}</button>
        <div class="m-quick only-mobile">
          <button class="icon-btn" data-m="theme" aria-label="Appearance">${icon('sun')}</button>
          <button class="icon-btn m-acct" data-m="acct" aria-label="Account">${icon('cloud')}</button>
        </div>
        <div>
          <p class="home-date">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>${greet}<span id="greetName"></span></h1>
        </div>
        <span class="grow"></span>
        <button class="btn-primary home-new" id="homeNew">${icon('plus', 16)} New note</button>
      </header>

      <section class="widget widget-recent">
        <div class="widget-head"><h2>Recent notes</h2><button class="link-btn" id="homeAll">View all ${icon('chevronRight', 14)}</button></div>
        <div class="recent-row">
          ${recent.map((n) => {
            const img = firstImage(n.content);
            return `<button class="recent-card" data-id="${esc(n.id)}">
              <span class="rc-title">${esc(n.title || 'Untitled')}</span>
              ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="rc-snippet">${esc((n.text || '').replace(/\s+/g, ' ').slice(0, 140))}</span>`}
              <span class="rc-meta">${relTime(n.updated)}</span>
            </button>`;
          }).join('')}
          <button class="recent-card recent-new" id="homeNew2">${icon('plus', 22)}<span>Create new note</span></button>
        </div>
      </section>

      <div class="widget-grid">
        <section class="widget">
          <div class="widget-head"><h2>Scratch pad</h2><button class="link-btn" id="scratchSave" ${S.scratch?.trim() ? '' : 'disabled'}>Save as note</button></div>
          <textarea class="scratch" id="scratch" placeholder="Jot something down. It stays here until you save it as a note.">${esc(S.scratch || '')}</textarea>
        </section>

        <section class="widget">
          <div class="widget-head"><h2>Open tasks</h2><span class="widget-count">${tasks.length}</span></div>
          ${tasks.length ? `<ul class="task-list">${tasks.slice(0, 8).map((t) => `
            <li><button data-id="${esc(t.note.id)}"><span class="tl-box"></span><span class="tl-text">${esc(t.text)}</span><span class="tl-note">${esc(t.note.title || 'Untitled')}</span></button></li>`).join('')}</ul>`
          : `<p class="widget-empty">No open tasks. Type <kbd>[ ]</kbd> in any note to add one.</p>`}
        </section>


        <section class="widget">
          <div class="widget-head"><h2>Notebooks</h2><button class="link-btn" id="homeNb">${icon('plus', 14)} New</button></div>
          <ul class="pin-list">${notebookList().map((nb) => `
            <li><button data-nb="${esc(nb.id)}">${icon('book', 15)}<span>${esc(nb.name)}</span><span class="pl-nb">${liveNotes().filter((n) => n.notebookId === nb.id).length}</span></button></li>`).join('')}</ul>
        </section>
      </div>
    </div>`;
  const open = (id) => { openNote(id); setPane('editor'); };
  $$('[data-id]', home).forEach((b) => (b.onclick = () => open(b.dataset.id)));
  $$('[data-nb]', home).forEach((b) => (b.onclick = () => setView({ kind: 'notebook', id: b.dataset.nb })));
  $('#homeNew').onclick = $('#homeNew2').onclick = () => newNote();
  $('#homeAll').onclick = () => setView({ kind: 'all' });
  $('#homeNb').onclick = createNotebook;
  $('#homeToNav').onclick = () => setPane('nav');
  if (sync.enabled) paintMobileAccount(sync.getState());
  paintGreetName(sync.enabled ? sync.getState() : null);
  $$('[data-m="theme"]', home).forEach((b) => (b.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'moon' : 'sun')));
  const sc = $('#scratch'), save = $('#scratchSave');
  sc.oninput = () => {
    S.scratch = sc.value;
    save.disabled = !sc.value.trim();
    clearTimeout(scratchTimer);
    scratchTimer = setTimeout(() => store.setSetting('scratch', S.scratch), 300);
  };
  save.onclick = () => {
    const text = sc.value.trim();
    if (!text) return;
    const lines = text.split('\n');
    const html = lines.slice(1).map((l) => `<p>${esc(l)}</p>`).join('') || '<p></p>';
    S.scratch = '';
    store.setSetting('scratch', '');
    newNote({ title: lines[0].slice(0, 120), html });
    toast('Scratch pad saved as a note');
  };
}

// ---------- list ----------
let listTimer = 0;
function scheduleListRender() {
  if (listTimer) return;
  listTimer = requestAnimationFrame(() => { listTimer = 0; renderList(); renderNav(); if (S.view.kind === 'home') renderHome(); });
}

function renderList() {
  const list = notesInView();
  $('#listTitle').textContent = viewTitle();
  $('#listCount').textContent = plural(list.length, 'note');
  $('#sortBtn').hidden = S.view.kind === 'trash';
  const body = $('#listBody');
  if (!list.length) {
    const msg = {
      all: ['No notes yet', 'Your first page is one click away.'],
      trash: ['Trash is empty', 'Deleted notes wait here until you clear them.'],
      notebook: ['This notebook is empty', 'Add a page to get started.'],
      tag: ['Nothing tagged', 'Notes with this tag will show up here.'],
    }[S.view.kind];
    body.innerHTML = `<div class="list-empty"><h4>${msg[0]}</h4><p>${msg[1]}</p>${S.view.kind !== 'trash' ? `<button class="btn-quiet" id="listEmptyNew">${icon('plus', 15)} New note</button>` : ''}</div>`;
    $('#listEmptyNew')?.addEventListener('click', () => newNote());
    return;
  }
  const showNb = S.view.kind !== 'notebook';
  body.innerHTML = list.map((n) => {
    const img = firstImage(n.content);
    const snippet = (n.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const nb = S.notebooks.get(n.notebookId);
    return `
    <button class="card ${n.id === S.currentId ? 'is-active' : ''}" data-id="${esc(n.id)}" role="option" aria-selected="${n.id === S.currentId}">
      <div class="card-main">
        <div class="card-title">${esc(n.title || 'Untitled')}</div>
        <div class="card-snippet">${snippet ? esc(snippet) : '<span class="muted">No additional text</span>'}</div>
        <div class="card-meta"><span>${relTime(S.view.kind === 'trash' ? n.trashed : n.updated)}</span>${showNb && nb ? `<span class="dot"></span><span>${esc(nb.name)}</span>` : ''}${n.tags.slice(0, 2).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      </div>
      ${img ? `<img class="card-thumb" src="${esc(img)}" alt="" loading="lazy">` : ''}
    </button>`;
  }).join('');
  $$('.card', body).forEach((c) => {
    c.onclick = () => { openNote(c.dataset.id); setPane('editor'); };
    c.oncontextmenu = (e) => { e.preventDefault(); const n = S.notes.get(c.dataset.id); if (n) noteMenu(c, n, { x: e.clientX, y: e.clientY }); };
  });
}

// keyboard navigation in list
document.addEventListener('keydown', (e) => {
  if (!e.target.closest?.('#listBody')) return;
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const cards = $$('#listBody .card');
  const i = cards.indexOf(document.activeElement);
  const next = cards[Math.max(0, Math.min(cards.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
  if (next) { next.focus(); openNote(next.dataset.id); }
});

// ---------- editor pane ----------
function leaveHome() {
  if (S.view.kind !== 'home') return;
  S.view = { kind: 'all' };
  $('#shell').classList.remove('is-home');
  renderNav(); renderList();
}
function openNote(id, { stay = false } = {}) {
  if (id && !booting && !stay) leaveHome();
  const prev = S.currentId;
  if (prev && pending.has(prev)) flushNote(prev);
  S.currentId = id;
  const n = current();
  $('#editorPane').classList.toggle('is-empty', !n);
  $$('#listBody .card').forEach((c) => { const on = c.dataset.id === id; c.classList.toggle('is-active', on); c.setAttribute('aria-selected', on); });
  if (!n) return;
  suppressChange = true;
  api.setContent(n.content || '');
  suppressChange = false;
  api.setEditable(!n.trashed);
  const t = $('#title');
  t.value = n.title || '';
  t.readOnly = !!n.trashed;
  requestAnimationFrame(() => autosize(t));
  $('#trashBanner').hidden = !n.trashed;
  $('#editorPane').classList.toggle('is-trashed', !!n.trashed);
  $('#edScroll').scrollTop = 0;
  renderHead();
  renderTags();
  renderFooter();
  store.setSetting('lastNote', id);
}

function renderHead() {
  const n = current();
  if (!n) return;
  $('#nbName').textContent = S.notebooks.get(n.notebookId)?.name || 'No notebook';
  $('#nbPicker').disabled = !!n.trashed;
}

function renderFooter() {
  const n = current();
  if (!n) return;
  const words = (n.text || '').split(/\s+/).filter(Boolean).length;
  $('#wordCount').textContent = `${plural(words, 'word')} · ${(n.text || '').length.toLocaleString('en-IN')} characters`;
  $('#edited').textContent = `Edited ${relTime(n.updated).replace(/^Just now$/, 'just now')}`;
  $('#edited').title = `Created ${fullDate(n.created)}\nUpdated ${fullDate(n.updated)}`;
}
setInterval(() => { renderFooter(); }, 30e3);

function renderTags() {
  const n = current();
  const box = $('#tags');
  if (!n) return;
  box.innerHTML = `${n.tags.map((t) => `<span class="tag">${icon('tag', 12)}<span>${esc(t)}</span>${n.trashed ? '' : `<button aria-label="Remove tag ${esc(t)}" data-tag="${esc(t)}">${icon('x', 12)}</button>`}</span>`).join('')}
    ${n.trashed ? '' : `<input class="tag-input" id="tagInput" placeholder="${n.tags.length ? 'Add tag' : 'Add a tag'}" list="tagList" aria-label="Add tag" enterkeyhint="done"><datalist id="tagList">${allTags().filter(([t]) => !n.tags.includes(t)).map(([t]) => `<option value="${esc(t)}">`).join('')}</datalist>`}`;
  $$('button[data-tag]', box).forEach((b) => (b.onclick = () => { n.tags = n.tags.filter((x) => x !== b.dataset.tag); touch(n); renderTags(); }));
  const input = $('#tagInput');
  if (!input) return;
  const commit = () => {
    const v = input.value.trim().replace(/^#/, '').replace(/,$/, '').trim().slice(0, 40);
    input.value = '';
    if (!v || n.tags.some((t) => t.toLowerCase() === v.toLowerCase())) return;
    n.tags = [...n.tags, v];
    touch(n);
    renderTags();
    $('#tagInput')?.focus();
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    else if (e.key === 'Backspace' && !input.value && n.tags.length) { n.tags = n.tags.slice(0, -1); touch(n); renderTags(); $('#tagInput')?.focus(); }
    else if (e.key === 'Escape') { input.value = ''; input.blur(); }
  };
  input.onchange = () => { if (allTags().some(([t]) => t === input.value)) commit(); };
  input.onblur = () => { if (input.value.trim()) commit(); };
}

// ---------- note operations ----------
async function newNote({ title = '', html = '', notebookId } = {}) {
  leaveHome();
  let nbId = notebookId || defaultNotebookId();
  if (!nbId) nbId = (await makeNotebook('Personal')).id;
  const now = Date.now();
  const n = {
    id: store.uid('n'), notebookId: nbId, title, content: html, text: html ? io.htmlToText(html) : '',
    tags: S.view.kind === 'tag' ? [S.view.tag] : [], pinned: false, created: now, updated: now, trashed: null,
  };
  S.notes.set(n.id, n);
  store.saveNote(n); // fire-and-forget: UI must respond instantly so no keystrokes are lost
  if (S.view.kind === 'trash' || (S.view.kind === 'notebook' && S.view.id !== nbId)) S.view = { kind: 'notebook', id: nbId };
  renderNav();
  renderList();
  openNote(n.id);
  setPane('editor');
  if (title) { api.editor.view.focus(); api.focus('end'); } else $('#title').focus();
  return n;
}

async function duplicateNote(n) {
  const now = Date.now();
  const copy = { ...n, id: store.uid('n'), title: `${n.title || 'Untitled'} copy`, tags: [...n.tags], pinned: false, created: now, updated: now };
  S.notes.set(copy.id, copy);
  await store.saveNote(copy);
  renderNav(); renderList(); openNote(copy.id);
  toast('Note duplicated');
}

function trashNote(n) {
  n.trashed = Date.now();
  n.updated = n.trashed;
  n.pinned = false;
  flushNote(n.id);
  store.saveNote(n);
  afterRemoval(n.id);
  toast('Moved to Trash', { label: 'Undo', fn: () => restoreNote(n, { quiet: true }) });
}
function restoreNote(n, { quiet } = {}) {
  n.trashed = null;
  n.updated = Date.now();
  store.saveNote(n);
  renderNav(); renderList();
  if (S.currentId === n.id || quiet) openNote(n.id);
  if (!quiet) toast(`Restored to ${S.notebooks.get(n.notebookId)?.name || 'notebook'}`);
}
async function purgeNote(n) {
  const ok = await ask({ title: 'Delete forever?', message: `"${n.title || 'Untitled'}" will be permanently deleted. This can't be undone.`, confirm: 'Delete', danger: true });
  if (!ok) return;
  S.notes.delete(n.id);
  clearTimeout(pending.get(n.id)); pending.delete(n.id);
  await store.deleteNote(n.id);
  afterRemoval(n.id);
}
function afterRemoval(id) {
  const list = notesInView();
  renderNav(); renderList();
  if (S.currentId === id) {
    const next = list[0]?.id || null;
    openNote(next);
    if (!next || matchMedia('(max-width: 859px)').matches) setPane('list');
  }
}
async function emptyTrash() {
  const trashed = [...S.notes.values()].filter((n) => n.trashed);
  if (!trashed.length) return;
  const ok = await ask({ title: 'Empty Trash?', message: `${plural(trashed.length, 'note')} will be permanently deleted.`, confirm: 'Empty Trash', danger: true });
  if (!ok) return;
  for (const n of trashed) { S.notes.delete(n.id); await store.deleteNote(n.id); }
  renderNav(); renderList(); openNote(null);
}
function moveNote(n, nbId) {
  if (n.notebookId === nbId) return;
  n.notebookId = nbId;
  touch(n);
  renderHead(); renderNav(); renderList();
  toast(`Moved to ${S.notebooks.get(nbId)?.name}`);
}

// ---------- notebooks ----------
async function makeNotebook(name) {
  const now = Date.now();
  const nb = { id: store.uid('b'), name, created: now, updated: now };
  S.notebooks.set(nb.id, nb);
  await store.saveNotebook(nb);
  return nb;
}
async function createNotebook() {
  const name = await ask({ title: 'New notebook', input: { placeholder: 'Notebook name', value: '' }, confirm: 'Create' });
  if (!name) return null;
  const nb = await makeNotebook(name);
  setView({ kind: 'notebook', id: nb.id });
  return nb;
}
async function renameNotebook(nb) {
  const name = await ask({ title: 'Rename notebook', input: { value: nb.name, placeholder: 'Notebook name' }, confirm: 'Rename' });
  if (!name || name === nb.name) return;
  nb.name = name; nb.updated = Date.now();
  await store.saveNotebook(nb);
  renderNav(); renderList(); renderHead();
}
async function deleteNotebook(nb) {
  if (S.notebooks.size <= 1) { toast('You need at least one notebook.'); return; }
  const inside = [...S.notes.values()].filter((n) => n.notebookId === nb.id);
  const live = inside.filter((n) => !n.trashed).length;
  const ok = await ask({ title: `Delete "${nb.name}"?`, message: live ? `Its ${plural(live, 'note')} will move to Trash, where you can restore them.` : 'This notebook is empty.', confirm: 'Delete notebook', danger: true });
  if (!ok) return;
  const fallback = notebookList().find((b) => b.id !== nb.id).id;
  for (const n of inside) { n.notebookId = fallback; if (!n.trashed) n.trashed = Date.now(); n.pinned = false; n.updated = Date.now(); await store.saveNote(n); }
  S.notebooks.delete(nb.id);
  await store.deleteNotebook(nb.id);
  if (S.view.kind === 'notebook' && S.view.id === nb.id) setView({ kind: 'all' });
  else { renderNav(); renderList(); }
  if (inside.some((n) => n.id === S.currentId)) openNote(current()?.id ?? null);
}

// ---------- menus ----------
let menuEl = null;
function closeMenu() { menuEl?.remove(); menuEl = null; document.removeEventListener('pointerdown', outsideMenu, true); }
function outsideMenu(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
function openMenu(anchor, items, { at } = {}) {
  closeMenu();
  const m = el(`<div class="menu" role="menu"></div>`);
  items.filter(Boolean).forEach((it) => {
    if (it === '-') { m.append(el('<div class="menu-sep"></div>')); return; }
    if (it.header) { m.append(el(`<div class="menu-header">${esc(it.header)}</div>`)); return; }
    const b = el(`<button class="menu-item ${it.danger ? 'danger' : ''}" role="menuitem">
      <span class="menu-ic">${it.checked ? icon('tick', 15) : it.icon ? icon(it.icon, 16) : ''}</span>
      <span class="menu-label">${esc(it.label)}</span>${it.hint ? `<span class="menu-hint">${esc(it.hint)}</span>` : ''}${it.sub ? icon('chevronRight', 14) : ''}</button>`);
    if (it.disabled) b.disabled = true;
    b.onclick = (e) => { e.stopPropagation(); if (!it.sub) closeMenu(); it.onClick?.(b); };
    m.append(b);
  });
  $('#layer').append(m);
  menuEl = m;
  const r = at ? { left: at.x, right: at.x, bottom: at.y, top: at.y } : anchor.getBoundingClientRect();
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = r.left; if (x + mw > innerWidth - 8) x = Math.max(8, r.right - mw);
  let y = r.bottom + 6; if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  m.style.left = `${x}px`; m.style.top = `${y}px`;
  setTimeout(() => document.addEventListener('pointerdown', outsideMenu, true));
  m.addEventListener('keydown', (e) => {
    const btns = $$('.menu-item:not(:disabled)', m);
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); anchor?.focus?.(); }
  });
  $('.menu-item:not(:disabled)', m)?.focus({ preventScroll: true });
  return m;
}

function templateMenu(anchor) {
  openMenu(anchor, [
    { header: 'Start from a template' },
    { label: 'Blank note', icon: 'file', hint: `${ALT}N`, onClick: () => newNote() },
    '-',
    ...TEMPLATES.map((t) => ({ label: t.name, icon: t.icon, onClick: () => newNote({ title: t.title(), html: t.html() }) })),
  ]);
}
function themeMenu(anchor) {
  const cur = localStorage.getItem('stackpad-theme') || 'system';
  openMenu(anchor, [
    { header: 'Appearance' },
    ...[['system', 'Match system', 'monitor'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([v, l, ic]) => ({ label: l, icon: ic, checked: cur === v, onClick: () => setTheme(v) })),
  ]);
}
function sortMenu(anchor) {
  openMenu(anchor, [
    { header: 'Sort by' },
    ...[['updated', 'Date updated'], ['created', 'Date created'], ['title', 'Title']].map(([v, l]) => ({ label: l, checked: S.sort === v, onClick: () => { S.sort = v; store.setSetting('sort', v); renderList(); } })),
  ]);
}
function listMenu(anchor) {
  const v = S.view;
  const items = [{ label: 'New note', icon: 'plus', onClick: () => newNote() }];
  if (v.kind === 'notebook') {
    const nb = S.notebooks.get(v.id);
    items.push('-', { label: 'Rename notebook', icon: 'edit', onClick: () => renameNotebook(nb) }, { label: 'Delete notebook', icon: 'trash', danger: true, onClick: () => deleteNotebook(nb) });
  }
  if (v.kind === 'trash') items.splice(0, 1, { label: 'Empty Trash', icon: 'trash', danger: true, onClick: emptyTrash });
  items.push('-', { label: 'New notebook', icon: 'book', onClick: createNotebook });
  openMenu(anchor, items);
}
function notebookMenu(anchor, nb) {
  if (!nb) return;
  openMenu(anchor, [
    { label: 'New note here', icon: 'plus', onClick: () => { setView({ kind: 'notebook', id: nb.id }, { keepNote: true }); newNote({ notebookId: nb.id }); } },
    { label: 'Rename', icon: 'edit', onClick: () => renameNotebook(nb) },
    '-',
    { label: 'Delete notebook', icon: 'trash', danger: true, onClick: () => deleteNotebook(nb) },
  ]);
}
function moveMenu(anchor, n) {
  openMenu(anchor, [
    { header: 'Move to notebook' },
    ...notebookList().map((nb) => ({ label: nb.name, icon: 'book', checked: nb.id === n.notebookId, onClick: () => moveNote(n, nb.id) })),
    '-',
    { label: 'New notebook', icon: 'plus', onClick: async () => { const nb = await createNotebook(); if (nb) { moveNote(n, nb.id); openNote(n.id); } } },
  ]);
}
function noteMenu(anchor, n, opts) {
  if (n.trashed) {
    openMenu(anchor, [
      { label: 'Restore', icon: 'restore', onClick: () => restoreNote(n) },
      { label: 'Delete forever', icon: 'trash', danger: true, onClick: () => purgeNote(n) },
    ], opts);
    return;
  }
  openMenu(anchor, [
    { label: 'Move to', icon: 'move', sub: true, onClick: () => moveMenu(anchor, n) },
    { label: 'Duplicate', icon: 'copy', onClick: () => duplicateNote(n) },
    '-',
    { label: 'Copy as Markdown', icon: 'copy', onClick: () => copyMarkdown(n) },
    { label: 'Export as Markdown', icon: 'download', onClick: () => io.download(`${io.safeFilename(n.title)}.md`, `# ${n.title || 'Untitled'}\n\n${io.htmlToMarkdown(n.content)}`, 'text/markdown') },
    { label: 'Export as HTML', icon: 'download', onClick: () => io.download(`${io.safeFilename(n.title)}.html`, io.noteToHtmlDocument(n), 'text/html') },
    { label: 'Print', icon: 'file', hint: `${MOD}P`, onClick: () => { if (S.currentId !== n.id) openNote(n.id); setTimeout(() => print(), 50); } },
    '-',
    { label: 'Move to Trash', icon: 'trash', danger: true, onClick: () => trashNote(n) },
  ], opts);
}
async function copyMarkdown(n) {
  try { await navigator.clipboard.writeText(`# ${n.title || 'Untitled'}\n\n${io.htmlToMarkdown(n.content)}`); toast('Copied as Markdown'); }
  catch { toast('Clipboard is blocked in this browser'); }
}

// ---------- modal ----------
function ask({ title, message, input, confirm = 'OK', danger }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const wrap = el(`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
      <h3 id="mTitle">${esc(title)}</h3>
      ${message ? `<p>${esc(message)}</p>` : ''}
      ${input ? `<input class="modal-input" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" maxlength="80">` : ''}
      <div class="modal-actions"><button class="btn-quiet" data-a="cancel">Cancel</button><button class="${danger ? 'btn-danger' : 'btn-primary'}" data-a="ok">${esc(confirm)}</button></div>
    </div></div>`);
    $('#layer').append(wrap);
    const inp = $('.modal-input', wrap);
    const done = (v) => { wrap.remove(); prevFocus?.focus?.({ preventScroll: true }); resolve(v); };
    const ok = () => { if (inp) { const v = inp.value.trim(); if (!v) { inp.focus(); return; } done(v); } else done(true); };
    $('[data-a="cancel"]', wrap).onclick = () => done(null);
    $('[data-a="ok"]', wrap).onclick = ok;
    wrap.onpointerdown = (e) => { if (e.target === wrap) done(null); };
    wrap.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); }
      if (e.key === 'Tab') { // trap focus
        const f = $$('input,button', wrap); const i = f.indexOf(document.activeElement);
        e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    requestAnimationFrame(() => (inp ? (inp.focus(), inp.select()) : $('[data-a="ok"]', wrap).focus()));
  });
}

// ---------- toast ----------
let toastTimer;
function toast(msg, action) {
  $('#layer .toast')?.remove();
  clearTimeout(toastTimer);
  const t = el(`<div class="toast" role="status"><span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}</div>`);
  if (action) $('button', t).onclick = () => { t.remove(); action.fn(); };
  $('#layer').append(t);
  toastTimer = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 200); }, action ? 5000 : 2400);
}

// ---------- command palette ----------
function openPalette() {
  if ($('.palette-backdrop')) return;
  closeMenu();
  const prevFocus = document.activeElement;
  const wrap = el(`<div class="palette-backdrop"><div class="palette" role="dialog" aria-modal="true" aria-label="Search">
    <div class="palette-input">${icon('search', 18)}<input placeholder="Search notes, notebooks and actions" aria-label="Search" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div>
    <div class="palette-results" role="listbox"></div>
  </div></div>`);
  $('#layer').append(wrap);
  const input = $('input', wrap), results = $('.palette-results', wrap);
  let items = [], sel = 0;
  const close = () => { wrap.remove(); if (document.contains(prevFocus)) prevFocus?.focus?.({ preventScroll: true }); };

  const actions = [
    { label: 'New note', icon: 'plus', hint: `${ALT}N`, run: () => newNote() },
    { label: 'New notebook', icon: 'book', run: createNotebook },
    ...TEMPLATES.map((t) => ({ label: `New from template: ${t.name}`, icon: t.icon, run: () => newNote({ title: t.title(), html: t.html() }) })),
    { label: 'Toggle dark mode', icon: 'moon', run: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
    { label: 'Focus mode', icon: 'expand', hint: `${MOD}${IS_MAC ? '⇧' : 'Shift+'}F`, run: toggleFocus },
    { label: 'Export backup', icon: 'download', run: exportBackup },
    { label: 'Import notes', icon: 'upload', run: () => $('#importInput').click() },
    { label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: showShortcuts },
    { label: 'Go to Home', icon: 'home', run: () => setView({ kind: 'home' }) },
    { label: 'Go to Trash', icon: 'trash', run: () => setView({ kind: 'trash' }) },
  ];

  const snippetAround = (text, terms) => {
    const lower = text.toLowerCase();
    let at = -1;
    for (const t of terms) { at = lower.indexOf(t); if (at >= 0) break; }
    const start = Math.max(0, at - 40);
    const raw = (start ? '…' : '') + text.slice(start, start + 140).replace(/\s+/g, ' ');
    return highlight(raw, terms);
  };
  const highlight = (s, terms) => {
    let out = esc(s);
    for (const t of terms) if (t) out = out.replace(new RegExp(`(${esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
    return out;
  };

  function search() {
    const q = input.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    items = [];
    if (!terms.length) {
      const recent = liveNotes().sort((a, b) => b.updated - a.updated).slice(0, 6);
      if (recent.length) items.push({ section: 'Recent' }, ...recent.map((n) => ({ note: n, html: esc(n.title || 'Untitled'), sub: S.notebooks.get(n.notebookId)?.name })));
      items.push({ section: 'Actions' }, ...actions.slice(0, 2).concat(actions.slice(-5)).map((a) => ({ action: a })));
    } else {
      const scored = [];
      for (const n of liveNotes()) {
        const title = (n.title || 'Untitled').toLowerCase(), text = (n.text || '').toLowerCase(), tags = n.tags.join(' ').toLowerCase();
        let score = 0, ok = true;
        for (const t of terms) {
          if (title.startsWith(t)) score += 6;
          else if (title.includes(t)) score += 4;
          else if (tags.includes(t)) score += 3;
          else if (text.includes(t)) score += 1;
          else { ok = false; break; }
        }
        if (ok) scored.push({ n, score: score + n.updated / 1e14 });
      }
      scored.sort((a, b) => b.score - a.score);
      const notes = scored.slice(0, 30).map(({ n }) => ({ note: n, html: highlight(n.title || 'Untitled', terms), snippet: snippetAround(n.text || '', terms), sub: S.notebooks.get(n.notebookId)?.name }));
      const nbs = notebookList().filter((nb) => terms.every((t) => nb.name.toLowerCase().includes(t))).map((nb) => ({ action: { label: `Open notebook: ${nb.name}`, icon: 'book', run: () => setView({ kind: 'notebook', id: nb.id }) } }));
      const tags = allTags().filter(([t]) => terms.every((x) => t.toLowerCase().includes(x))).slice(0, 4).map(([t]) => ({ action: { label: `Open tag: ${t}`, icon: 'tag', run: () => setView({ kind: 'tag', tag: t }) } }));
      const acts = actions.filter((a) => terms.every((t) => a.label.toLowerCase().includes(t))).map((a) => ({ action: a }));
      if (notes.length) items.push({ section: `Notes · ${scored.length}` }, ...notes);
      if (nbs.length || tags.length) items.push({ section: 'Go to' }, ...nbs, ...tags);
      if (acts.length) items.push({ section: 'Actions' }, ...acts);
      if (!notes.length) items.push({ section: 'Create' }, { action: { label: `New note "${input.value.trim()}"`, icon: 'plus', run: () => newNote({ title: input.value.trim() }) } });
    }
    sel = items.findIndex((i) => !i.section);
    draw();
  }
  function draw() {
    results.innerHTML = items.map((it, i) => {
      if (it.section) return `<div class="pal-section">${esc(it.section)}</div>`;
      if (it.note) return `<button class="pal-item ${i === sel ? 'is-sel' : ''}" data-i="${i}" role="option">
        <span class="pal-ic">${icon('notes', 16)}</span>
        <span class="pal-text"><span class="pal-title">${it.html}</span>${it.snippet ? `<span class="pal-snippet">${it.snippet}</span>` : ''}</span>
        <span class="pal-hint">${esc(it.sub || '')}</span></button>`;
      return `<button class="pal-item ${i === sel ? 'is-sel' : ''}" data-i="${i}" role="option">
        <span class="pal-ic">${icon(it.action.icon, 16)}</span><span class="pal-text"><span class="pal-title">${esc(it.action.label)}</span></span>
        <span class="pal-hint">${esc(it.action.hint || '')}</span></button>`;
    }).join('') || `<div class="pal-empty">No results</div>`;
    $('.is-sel', results)?.scrollIntoView({ block: 'nearest' });
    $$('.pal-item', results).forEach((b) => {
      b.onclick = () => choose(+b.dataset.i);
      b.onmousemove = () => { if (sel !== +b.dataset.i) { sel = +b.dataset.i; $$('.pal-item', results).forEach((x) => x.classList.toggle('is-sel', x === b)); } };
    });
  }
  function choose(i) {
    const it = items[i];
    if (!it || it.section) return;
    close();
    if (it.note) {
      if (!notesInView().includes(it.note)) setView({ kind: 'all' }, { keepNote: true });
      openNote(it.note.id);
      setPane('editor');
    } else it.action.run();
  }
  const move = (d) => {
    if (!items.some((x) => !x.section)) return;
    do { sel = (sel + d + items.length) % items.length; } while (items[sel].section);
    draw();
  };
  input.oninput = search;
  wrap.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); choose(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  wrap.onpointerdown = (e) => { if (e.target === wrap) close(); };
  search();
  input.focus();
}

function showShortcuts() {
  const rows = [
    ['Search everything', `${MOD}K`], ['New note', `${ALT}N`], ['Focus mode', `${MOD}${IS_MAC ? '⇧' : 'Shift+'}F`], ['Insert a block', '/'],
    ['Bold / Italic / Underline', `${MOD}B  ${MOD}I  ${MOD}U`], ['Highlight', `${MOD}${IS_MAC ? '⇧' : 'Shift+'}H`],
    ['Heading 1 / 2 / 3', `${MOD}${ALT}1  2  3`], ['Checklist', `[ ] then space`], ['Bulleted / Numbered list', '-  or  1.'],
    ['Quote / Code block', '>   or   ```'], ['Undo / Redo', `${MOD}Z  ${MOD}${IS_MAC ? '⇧' : 'Shift+'}Z`], ['Show this panel', '?'],
  ];
  const wrap = el(`<div class="modal-backdrop"><div class="modal modal-wide" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
    <h3>Keyboard shortcuts</h3>
    <div class="keys">${rows.map(([a, b]) => `<div class="key-row"><span>${esc(a)}</span><kbd>${esc(b)}</kbd></div>`).join('')}</div>
    <div class="modal-actions"><button class="btn-primary" data-a="ok">Done</button></div></div></div>`);
  $('#layer').append(wrap);
  const close = () => wrap.remove();
  $('[data-a="ok"]', wrap).onclick = close;
  wrap.onpointerdown = (e) => { if (e.target === wrap) close(); };
  wrap.onkeydown = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); } };
  $('[data-a="ok"]', wrap).focus();
}

// ---------- theme, focus, panes ----------
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const pref = localStorage.getItem('stackpad-theme') || 'system';
  const t = pref === 'system' ? (darkMQ.matches ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = t;
  $('#themeBtn') && ($('#themeBtn').innerHTML = icon(t === 'dark' ? 'moon' : 'sun', 17));
  $$('[data-m="theme"]').forEach((b) => (b.innerHTML = icon(t === 'dark' ? 'moon' : 'sun')));
}
function setTheme(v) { try { localStorage.setItem('stackpad-theme', v); } catch {} applyTheme(); }
darkMQ.addEventListener?.('change', applyTheme);

function toggleFocus() {
  S.focus = !S.focus;
  document.body.classList.toggle('focus-mode', S.focus);
  $('#focusBtn').innerHTML = icon(S.focus ? 'shrink' : 'expand');
  $('#focusBtn').classList.toggle('is-active', S.focus);
  if (S.focus) toast(`Focus mode. Press Esc to exit.`);
}
function setPane(p) {
  S.pane = p;
  document.body.dataset.pane = p;
}

// ---------- import / export ----------
function exportBackup() {
  const d = new Date().toISOString().slice(0, 10);
  io.download(`stackpad-backup-${d}.json`, io.makeBackup({ notes: [...S.notes.values()], notebooks: [...S.notebooks.values()] }), 'application/json');
  toast(`Backup downloaded · ${plural(S.notes.size, 'note')}`);
}

async function importFiles(files) {
  let added = 0, updated = 0;
  try {
    for (const f of files) {
      const text = await io.readFileText(f);
      if (/\.json$/i.test(f.name)) {
        const data = io.parseBackup(text);
        for (const nb of data.notebooks) if (!S.notebooks.has(nb.id)) { S.notebooks.set(nb.id, nb); }
        const nbFallback = defaultNotebookId() || (await makeNotebook('Imported')).id;
        for (const n of data.notes) {
          if (!S.notebooks.has(n.notebookId)) n.notebookId = nbFallback;
          const ex = S.notes.get(n.id);
          if (!ex) { S.notes.set(n.id, n); added++; }
          else if (n.updated > ex.updated) { S.notes.set(n.id, n); updated++; }
        }
        await store.bulkPut({ notes: [...S.notes.values()], notebooks: [...S.notebooks.values()] });
      } else {
        const isHtml = /\.html?$/i.test(f.name);
        let html = isHtml ? text : io.markdownToHtml(text);
        let title = f.name.replace(/\.[^.]+$/, '');
        const h1 = html.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (h1) { title = io.htmlToText(h1[1]).trim() || title; html = html.slice(h1[0].length); }
        if (isHtml) { const doc = new DOMParser().parseFromString(html, 'text/html'); doc.querySelectorAll('script,style,iframe,object,embed').forEach((x) => x.remove()); html = doc.body.innerHTML; }
        const nbId = defaultNotebookId() || (await makeNotebook('Imported')).id;
        const now = Date.now();
        const n = { id: store.uid('n'), notebookId: nbId, title, content: html, text: io.htmlToText(html), tags: [], pinned: false, created: now, updated: now, trashed: null };
        S.notes.set(n.id, n);
        await store.saveNote(n);
        added++;
      }
    }
    renderNav(); renderList();
    toast(`Imported ${plural(added, 'note')}${updated ? `, updated ${updated}` : ''}`);
  } catch (err) {
    console.error(err);
    toast(err?.message || 'Import failed');
  }
}

// drag & drop files onto the list to import
document.addEventListener('dragover', (e) => { if (e.target.closest?.('.list') && e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if (!e.target.closest?.('.list')) return;
  const files = [...(e.dataTransfer?.files || [])].filter((f) => /\.(json|md|markdown|txt|html?)$/i.test(f.name));
  if (files.length) { e.preventDefault(); importFiles(files); }
});

// ---------- global keys ----------
document.addEventListener('keydown', (e) => {
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); $('.palette-backdrop') ? null : openPalette(); return; }
  if (e.altKey && !mod && e.code === 'KeyN') { e.preventDefault(); newNote(); return; }
  if (mod && e.shiftKey && e.code === 'KeyF') { e.preventDefault(); toggleFocus(); return; }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); flushAll().then(() => toast('All changes saved')); return; }
  if (e.key === 'Escape' && S.focus && !$('.modal-backdrop,.palette-backdrop,.menu')) { toggleFocus(); return; }
  if (e.key === 'Escape' && menuEl) { closeMenu(); return; }
  if (e.key === '?' && !isTyping(e.target) && !$('.modal-backdrop')) { e.preventDefault(); showShortcuts(); }
});

// ---------- lifecycle ----------
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
addEventListener('pagehide', () => flushAll());
addEventListener('beforeunload', (e) => { if (pending.size) { flushAll(); e.preventDefault(); } });

function applyRemote({ kind, op, id, value }) {
  if (kind === 'note') {
    if (pending.has(id)) return; // local edits win
    if (op === 'delete') S.notes.delete(id); else if (value) S.notes.set(id, value);
    if (id === S.currentId) {
      if (op === 'delete' || !value) openNote(null, { stay: true });
      else if (!$('#editor').contains(document.activeElement) && document.activeElement !== $('#title')) openNote(id, { stay: true });
      else renderHead();
    }
  } else if (kind === 'notebook') {
    if (op === 'delete') S.notebooks.delete(id); else if (value) S.notebooks.set(id, value);
  }
  scheduleListRender();
}

async function boot() {
  applyTheme();
  mountShell();
  applyTheme();
  setPane('list');
  const data = await store.init();
  S.persistent = data.persistent;
  for (const nb of data.notebooks) S.notebooks.set(nb.id, nb);
  for (const n of data.notes) S.notes.set(n.id, n);
  if (!S.notes.size && !S.notebooks.size && !(await store.getSetting('seeded', false))) {
    let seedN = 0;
    const seed = seedData((prefix) => `seed-${prefix}-${++seedN}`); // same ids on every device, so sync never duplicates them
    await store.setSetting('seededAt', Date.now());
    seed.notebooks.forEach((nb) => S.notebooks.set(nb.id, nb));
    seed.notes.forEach((n) => S.notes.set(n.id, n));
    await store.bulkPut(seed);
    await store.setSetting('seeded', true);
  }
  S.sort = (await store.getSetting('sort', 'updated')) || 'updated';
  renderNav();
  renderList();
  const last = await store.getSetting('lastNote', null);
  const start = S.notes.get(last) && !S.notes.get(last).trashed ? last : notesInView()[0]?.id || null;
  openNote(start);
  booting = false;
  S.scratch = (await store.getSetting('scratch', '')) || '';
  setView({ kind: 'home' }, { keepNote: true });
  store.onRemoteChange(applyRemote);
  store.requestPersistence();
  if (!S.persistent) toast('Private browsing: notes will not be kept after this tab closes. Export a backup to keep them.');
  document.body.classList.add('ready');
  startSync();
}

// ---------- cloud sync (Supabase) ----------
async function startSync() {
  if (!sync.enabled) return;
  $('#account').hidden = false;
  renderAccount(sync.getState());
  await sync.init({
    onStatus: renderAccount,
    onApply: applyRemote,
    getLocal: (kind, id) => (kind === 'note' ? S.notes.get(id) : S.notebooks.get(id)) || null,
    getAll: () => ({ notes: [...S.notes.values()], notebooks: [...S.notebooks.values()] }),
    seededAt: (await store.getSetting('seededAt', 0)) || 0,
  });
}

// Mobile quick controls: theme + account, reachable without opening the drawer.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  if (b.dataset.m === 'theme') themeMenu(b);
  else accountMenu(b);
});
function accountMenu(anchor) {
  const st = sync.enabled ? sync.getState() : null;
  if (!st?.user) {
    openMenu(anchor, [
      { header: 'Your notes on every device' },
      { label: 'Sign in to sync', icon: 'cloud', onClick: async () => {
        try { await sync.signIn(); } catch (err) { toast(err?.message || 'Sign-in failed. Try again.'); }
      } },
    ]);
    return;
  }
  openMenu(anchor, [
    { header: st.user.email },
    { label: 'Sync now', icon: 'restore', onClick: () => sync.syncNow() },
    '-',
    { label: 'Sign out', icon: 'x', onClick: signOutFlow },
  ]);
}
function paintGreetName(st) {
  const g = $('#greetName');
  const first = (st?.user?.name || '').trim().split(/\s+/)[0];
  if (g) g.textContent = first ? `, ${first}` : '';
}
function paintMobileAccount(st) {
  const initial = esc((st?.user?.name || st?.user?.email || '?').trim()[0]?.toUpperCase() || '?');
  $$('.m-acct').forEach((b) => {
    b.classList.toggle('icon-btn', !!st?.user);
    b.classList.toggle('m-signin', !st?.user);
    b.innerHTML = !st?.user ? 'Sign in'
      : st.user.avatar ? `<img class="m-avatar" src="${esc(st.user.avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar m-avatar">${initial}</span>`;
    b.setAttribute('aria-label', st?.user ? 'Account' : 'Sign in to sync');
  });
}

function renderAccount(st) {
  if (sync.enabled) { paintMobileAccount(st); paintGreetName(st); }
  const box = $('#account');
  if (!box || st.status === 'off') return;
  if (!st.user) {
    box.innerHTML = `<button class="signin-btn" id="signInBtn">${icon('cloud', 17)}<span><b>Sign in to sync</b><small>Your notes on every device</small></span></button>`;
    $('#signInBtn').onclick = async () => {
      try { await sync.signIn(); } catch (err) { toast(err?.message || 'Sign-in failed. Try again.'); }
    };
    return;
  }
  const label = {
    syncing: 'Syncing',
    synced: st.lastSynced ? `Synced ${relTime(st.lastSynced).toLowerCase()}` : 'Synced',
    offline: st.pending ? `Offline · ${plural(st.pending, 'change')} waiting` : 'Offline',
    error: 'Sync paused · retrying',
    signedout: '',
  }[st.status] || '';
  const initial = esc((st.user.name || st.user.email || '?').trim()[0]?.toUpperCase() || '?');
  box.innerHTML = `<button class="account-btn" id="accountBtn" title="${esc(st.user.email)}">
      ${st.user.avatar ? `<img src="${esc(st.user.avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${initial}</span>`}
      <span class="acc-text"><b>${esc(st.user.name)}</b><small class="sync-${st.status}"><i></i>${esc(label)}</small></span>
    </button>`;
  $('#accountBtn').onclick = (e) => openMenu(e.currentTarget, [
    { header: st.user.email },
    { label: 'Sync now', icon: 'restore', onClick: () => sync.syncNow() },
    '-',
    { label: 'Sign out', icon: 'x', onClick: signOutFlow },
  ]);
}
setInterval(() => { if (sync.enabled && sync.isSignedIn()) renderAccount(sync.getState()); }, 30e3);

async function signOutFlow() {
  await sync.syncNow().catch(() => {});
  const left = sync.pendingCount();
  const ok = await ask({
    title: 'Sign out?',
    message: left
      ? `${plural(left, 'change')} could not be synced yet and will be lost. Notes already synced stay safe in your account.`
      : 'Your notes are safe in your account and will come back when you sign in. They will be removed from this device.',
    confirm: 'Sign out',
    danger: left > 0,
  });
  if (!ok) return;
  await flushAll();
  await sync.signOut(async () => {
    for (const id of [...S.notes.keys()]) await store.deleteNote(id);
    for (const id of [...S.notebooks.keys()]) await store.deleteNotebook(id);
    S.notes.clear(); S.notebooks.clear();
    await store.setSetting('lastNote', null);
  });
  openNote(null, { stay: true });
  setView({ kind: 'home' }, { keepNote: true });
  toast('Signed out');
}

boot();
