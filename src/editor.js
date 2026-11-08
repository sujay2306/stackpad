// Stackpad editor: TipTap setup, formatting toolbar, link popover and slash menu.
import { Editor, Extension } from '@tiptap/core';
import { EditorState, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import { icon } from './icons.js';

/* ---------- platform + small helpers ---------- */

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');

// "Mod-Shift-x" -> "⌘⇧X" on Mac, "Ctrl+Shift+X" elsewhere.
function keyHint(combo) {
  if (!combo) return '';
  const parts = combo.split('-');
  const key = parts.pop();
  const map = IS_MAC
    ? { Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃' }
    : { Mod: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Ctrl: 'Ctrl' };
  const mods = parts.map((p) => map[p] || p);
  const k = key.length === 1 ? key.toUpperCase() : key;
  return IS_MAC ? mods.join('') + k : [...mods, k].join('+');
}

function el(tag, attrs = {}, html) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}


// Returns a safe href or null. Adds https:// when no scheme is present.
export function normalizeUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) return null;
  // Strip control chars/whitespace that browsers ignore inside schemes ("java\nscript:").
  const compact = url.replace(/[\u0000- \u007f]/g, '').toLowerCase();
  if (/^(javascript|vbscript|data|file):/.test(compact)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return /^(https?|mailto|tel|ftp|sms):/i.test(url) ? url : null;
  }
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('#') || url.startsWith('/')) return url;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(url)) return 'mailto:' + url;
  if (/\s/.test(url)) return null;
  return 'https://' + url;
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const isImageFile = (f) => f && /^image\//.test(f.type);

/* ---------- block catalogue (shared by dropdown + slash menu) ---------- */

const BLOCKS = [
  { id: 'paragraph', name: 'Text', icon: 'text', keys: 'paragraph plain body p', key: 'Mod-Alt-0',
    isActive: (e) => e.isActive('paragraph') && !inAnyList(e) && !e.isActive('blockquote'),
    run: (c) => c.clearNodes().setParagraph() },
  { id: 'h1', name: 'Heading 1', icon: 'h1', keys: 'title h1 big header #', key: 'Mod-Alt-1',
    isActive: (e) => e.isActive('heading', { level: 1 }), run: (c) => c.setHeading({ level: 1 }) },
  { id: 'h2', name: 'Heading 2', icon: 'h2', keys: 'subtitle h2 header ##', key: 'Mod-Alt-2',
    isActive: (e) => e.isActive('heading', { level: 2 }), run: (c) => c.setHeading({ level: 2 }) },
  { id: 'h3', name: 'Heading 3', icon: 'h3', keys: 'h3 small header ###', key: 'Mod-Alt-3',
    isActive: (e) => e.isActive('heading', { level: 3 }), run: (c) => c.setHeading({ level: 3 }) },
  { id: 'bullet', name: 'Bulleted list', icon: 'list', keys: 'unordered ul bullet points -', key: 'Mod-Shift-8',
    isActive: (e) => e.isActive('bulletList'), run: (c, e) => (e.isActive('bulletList') ? c : c.toggleBulletList()) },
  { id: 'ordered', name: 'Numbered list', icon: 'ordered', keys: 'ordered ol numbers 1.', key: 'Mod-Shift-7',
    isActive: (e) => e.isActive('orderedList'), run: (c, e) => (e.isActive('orderedList') ? c : c.toggleOrderedList()) },
  { id: 'task', name: 'Checklist', icon: 'check', keys: 'todo task checkbox to-do []', key: 'Mod-Shift-9',
    isActive: (e) => e.isActive('taskList'), run: (c, e) => (e.isActive('taskList') ? c : c.toggleTaskList()) },
  { id: 'quote', name: 'Quote', icon: 'quote', keys: 'blockquote citation >', key: 'Mod-Shift-b',
    isActive: (e) => e.isActive('blockquote'), run: (c, e) => (e.isActive('blockquote') ? c : c.setBlockquote()) },
  { id: 'code', name: 'Code block', icon: 'codeblock', keys: 'pre snippet program ```', key: 'Mod-Alt-c',
    isActive: (e) => e.isActive('codeBlock'), run: (c) => c.setCodeBlock() },
];

function inAnyList(e) {
  return e.isActive('bulletList') || e.isActive('orderedList') || e.isActive('taskList');
}

function currentBlock(editor) {
  // Most specific first: headings/code, then lists, then quote, then text.
  const order = ['h1', 'h2', 'h3', 'code', 'task', 'bullet', 'ordered', 'quote', 'paragraph'];
  for (const id of order) {
    const b = BLOCKS.find((x) => x.id === id);
    if (b.isActive(editor)) return b;
  }
  return BLOCKS[0];
}

/* ---------- slash menu plugin ---------- */

const slashKey = new PluginKey('stackpadSlash');
const SLASH_MAX_QUERY = 24;

function fuzzyScore(query, item) {
  if (!query) return 1;
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const name = item.name.toLowerCase();
  const hay = (name + ' ' + (item.keywords || '')).toLowerCase();
  if (name.startsWith(q)) return 100 - name.length / 100;
  if (name.split(/\s+/).some((w) => w.startsWith(q))) return 80;
  if (hay.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (hay.includes(q)) return 40;
  // Subsequence match on the name (e.g. "hd2" -> "Heading 2").
  let i = 0;
  for (const ch of name) if (ch === q[i]) i++;
  if (i === q.length) return 20;
  return 0;
}

function filterItems(items, query) {
  return items
    .map((it, idx) => ({ it, idx, s: fuzzyScore(query, it) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.idx - b.idx)
    .map((x) => x.it);
}

const INACTIVE = { active: false };

// Validate an active slash range against the current state; returns new state or INACTIVE.
function revalidate(state, from, items, prev) {
  const { selection, doc } = state;
  if (!selection.empty) return INACTIVE;
  const to = selection.from;
  if (from < 0 || to <= from || to > doc.content.size) return INACTIVE;
  const $from = doc.resolve(from);
  const $to = selection.$from;
  if ($from.parent !== $to.parent || $to.parent.type.spec.code) return INACTIVE;
  let text;
  try {
    text = doc.textBetween(from, to, '\n', '￼');
  } catch {
    return INACTIVE;
  }
  if (text[0] !== '/' || /[\n￼]/.test(text)) return INACTIVE;
  const query = text.slice(1);
  if (query.length > SLASH_MAX_QUERY || /^\s/.test(query) || /\s{2,}$/.test(query)) return INACTIVE;
  const matches = filterItems(items, query);
  if (!matches.length) return INACTIVE;
  const index = prev && prev.active && prev.query === query ? Math.min(prev.index, matches.length - 1) : 0;
  return { active: true, from, to, query, matches, index };
}

function createSlashExtension(getItems, onSelect) {
  return Extension.create({
    name: 'stackpadSlash',
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          key: slashKey,
          state: {
            init: () => INACTIVE,
            apply(tr, prev, oldState, newState) {
              const meta = tr.getMeta(slashKey);
              if (meta && meta.close) return INACTIVE;
              if (meta && typeof meta.move === 'number' && prev.active) {
                const n = prev.matches.length;
                return { ...prev, index: (prev.index + meta.move + n) % n };
              }
              if (meta && typeof meta.index === 'number' && prev.active) {
                return { ...prev, index: Math.max(0, Math.min(meta.index, prev.matches.length - 1)) };
              }
              if (!editor.isEditable) return INACTIVE;

              if (prev.active) {
                if (!tr.docChanged && !tr.selectionSet) return prev;
                const from = tr.mapping.mapResult(prev.from, 1);
                if (from.deleted) return INACTIVE;
                return revalidate(newState, from.pos, getItems(), prev);
              }

              // Activation: a "/" was just typed (not undo/redo/paste of bulk content).
              if (!tr.docChanged || tr.getMeta('history$') || tr.getMeta('paste') || tr.getMeta('uiEvent') === 'drop') return INACTIVE;
              const { selection } = newState;
              if (!selection.empty) return INACTIVE;
              const $pos = selection.$from;
              if ($pos.parent.type.spec.code || !$pos.parent.isTextblock) return INACTIVE;
              if ($pos.marks().some((m) => m.type.name === 'code')) return INACTIVE;
              const off = $pos.parentOffset;
              if (off < 1) return INACTIVE;
              const before = $pos.parent.textBetween(Math.max(0, off - 2), off, '\n', '￼');
              if (before[before.length - 1] !== '/') return INACTIVE;
              if (before.length === 2 && !/\s/.test(before[0])) return INACTIVE;
              // Ensure the slash was inserted by this transaction (not merely revisited).
              const slashPos = selection.from - 1;
              let inserted = false;
              tr.mapping.maps.forEach((map, i) => {
                map.forEach((_os, _oe, ns, ne) => {
                  const rest = tr.mapping.slice(i + 1);
                  const s = rest.map(ns, -1);
                  const e = rest.map(ne, 1);
                  if (s <= slashPos && e >= slashPos + 1) inserted = true;
                });
              });
              if (!inserted) return INACTIVE;
              return revalidate(newState, slashPos, getItems(), null);
            },
          },
          props: {
            handleKeyDown(view, event) {
              const st = slashKey.getState(view.state);
              if (!st || !st.active || event.isComposing) return false;
              const dispatchMeta = (m) => view.dispatch(view.state.tr.setMeta(slashKey, m));
              switch (event.key) {
                case 'ArrowDown':
                  dispatchMeta({ move: 1 });
                  return true;
                case 'ArrowUp':
                  dispatchMeta({ move: -1 });
                  return true;
                case 'Enter':
                case 'Tab':
                  if (event.shiftKey && event.key === 'Tab') return false;
                  onSelect(st.matches[st.index], st);
                  return true;
                case 'Escape':
                  dispatchMeta({ close: true });
                  return true;
                default:
                  return false;
              }
            },
            handleDOMEvents: {
              blur(view) {
                const st = slashKey.getState(view.state);
                if (st && st.active) {
                  // Defer so a click on the menu (which prevents default) can land first.
                  setTimeout(() => {
                    if (view.isDestroyed) return;
                    if (!view.hasFocus() && slashKey.getState(view.state)?.active) {
                      view.dispatch(view.state.tr.setMeta(slashKey, { close: true }));
                    }
                  }, 0);
                }
                return false;
              },
            },
          },
          view: () => {
            const menu = new SlashMenuView(editor, onSelect);
            return {
              update: (view) => menu.render(slashKey.getState(view.state)),
              destroy: () => menu.destroy(),
            };
          },
        }),
      ];
    },
  });
}

class SlashMenuView {
  constructor(editor, onSelect) {
    this.editor = editor;
    this.onSelect = onSelect;
    this.el = el('div', { class: 'slash', role: 'listbox', 'aria-label': 'Insert block', hidden: true });
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.lastKey = '';
    this.state = INACTIVE;
    this.onScroll = () => this.state.active && this.position();
    window.addEventListener('resize', this.onScroll);
    document.addEventListener('scroll', this.onScroll, true);
    document.body.appendChild(this.el);
  }

  render(st) {
    this.state = st || INACTIVE;
    if (!this.state.active) {
      if (!this.el.hidden) {
        this.el.hidden = true;
        this.el.classList.remove('is-open');
      }
      this.lastKey = '';
      return;
    }
    const key = this.state.matches.map((m) => m.id).join(',');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.el.innerHTML = '<div class="slash-label">Blocks</div>';
      this.state.matches.forEach((item, i) => {
        const row = el(
          'div',
          { class: 'slash-item', role: 'option', id: 'slash-opt-' + item.id, 'data-index': i },
          `<span class="slash-icon">${icon(item.icon, 18)}</span>` +
            `<span class="slash-name">${escapeHtml(item.name)}</span>` +
            (item.hint ? `<span class="slash-hint">${escapeHtml(item.hint)}</span>` : '')
        );
        row.addEventListener('mousemove', () => {
          if (this.state.index !== i) {
            this.editor.view.dispatch(this.editor.state.tr.setMeta(slashKey, { index: i }));
          }
        });
        row.addEventListener('click', () => this.onSelect(item, slashKey.getState(this.editor.state)));
        this.el.appendChild(row);
      });
    }
    const rows = this.el.querySelectorAll('.slash-item');
    rows.forEach((r, i) => {
      const sel = i === this.state.index;
      r.classList.toggle('is-selected', sel);
      r.setAttribute('aria-selected', sel ? 'true' : 'false');
    });
    const wasHidden = this.el.hidden;
    this.el.hidden = false;
    this.position();
    if (wasHidden) {
      this.el.classList.remove('is-open');
      // Next frame so the transition runs.
      requestAnimationFrame(() => this.el.classList.add('is-open'));
    }
    const selRow = rows[this.state.index];
    if (selRow) {
      this.editor.view.dom.setAttribute('aria-activedescendant', selRow.id);
      const top = selRow.offsetTop;
      const bottom = top + selRow.offsetHeight;
      if (top < this.el.scrollTop + 28) this.el.scrollTop = Math.max(0, top - 28);
      else if (bottom > this.el.scrollTop + this.el.clientHeight) this.el.scrollTop = bottom - this.el.clientHeight;
    }
  }

  position() {
    let coords;
    try {
      coords = this.editor.view.coordsAtPos(this.state.from);
    } catch {
      return;
    }
    const margin = 8;
    const w = this.el.offsetWidth || 280;
    const h = this.el.offsetHeight || 340;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = Math.min(Math.max(margin, coords.left), vw - w - margin);
    let top = coords.bottom + 6;
    let flipped = false;
    if (top + h > vh - margin && coords.top - h - 6 > margin) {
      top = coords.top - h - 6;
      flipped = true;
    }
    this.el.style.left = `${Math.max(margin, left)}px`;
    this.el.style.top = `${Math.max(margin, top)}px`;
    this.el.classList.toggle('is-above', flipped);
  }

  destroy() {
    window.removeEventListener('resize', this.onScroll);
    document.removeEventListener('scroll', this.onScroll, true);
    this.el.remove();
  }
}

/* ---------- main factory ---------- */

export function createEditor({ element, toolbar, onChange, onImage } = {}) {
  const toImage = async (file) => (onImage ? onImage(file) : readAsDataURL(file));
  const pending = new Set(); // positions awaiting async image inserts (mapped through edits)
  let destroyed = false;
  let tb = null; // toolbar controller (assigned after the editor exists)

  // Hidden picker shared by toolbar + slash menu.
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, tabindex: '-1' });
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  let pickerPos = null;

  async function insertImages(files, pos) {
    const imgs = Array.from(files || []).filter(isImageFile);
    if (!imgs.length) return false;
    const marker = { pos };
    pending.add(marker);
    try {
      for (const file of imgs) {
        let src;
        try {
          src = await toImage(file);
        } catch (err) {
          console.error('[editor] image failed', err);
          continue;
        }
        if (destroyed || !src) break;
        const size = editor.state.doc.content.size;
        const at = Math.max(0, Math.min(marker.pos ?? editor.state.selection.to, size));
        const node = { type: 'image', attrs: { src, alt: file.name ? file.name.replace(/\.[^.]+$/, '') : null } };
        const ok = editor.chain().focus().insertContentAt(at, node).run();
        if (!ok) editor.chain().focus().insertContent(node).run();
        // Subsequent images go after the one just inserted.
        marker.pos = editor.state.selection.to;
      }
    } finally {
      pending.delete(marker);
    }
    return true;
  }

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    const pos = pickerPos ?? editor.state.selection.to;
    pickerPos = null;
    insertImages(files, pos);
  });

  function pickImage() {
    pickerPos = editor.state.selection.to;
    fileInput.click();
  }

  /* slash items (blocks + inserts) */
  const slashItems = [
    ...BLOCKS.map((b) => ({ id: b.id, name: b.name, icon: b.icon, keywords: b.keys, hint: b.key ? keyHint(b.key) : '', run: b.run })),
    { id: 'divider', name: 'Divider', icon: 'divider', keywords: 'hr rule line separator ---', hint: '---',
      run: (c) => c.setHorizontalRule() },
    { id: 'table', name: 'Table', icon: 'table', keywords: 'grid rows columns spreadsheet', hint: '3 x 3',
      run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
    { id: 'image', name: 'Image', icon: 'image', keywords: 'picture photo upload img', hint: 'Upload',
      run: (c) => c, after: () => pickImage() },
  ];

  function selectSlash(item, st) {
    if (!item || !st || !st.active) return;
    const to = editor.state.selection.from;
    let chain = editor.chain().focus().setMeta(slashKey, { close: true }).deleteRange({ from: st.from, to });
    chain = item.run(chain, editor) || chain;
    chain.run();
    // Ensure state is closed even if the command chain failed.
    if (slashKey.getState(editor.state)?.active) {
      editor.view.dispatch(editor.state.tr.setMeta(slashKey, { close: true }));
    }
    if (item.after) item.after();
  }

  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({ history: { depth: 200, newGroupDelay: 500 } }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ allowBase64: true, inline: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Typography,
      Placeholder.configure({
        showOnlyCurrent: true,
        includeChildren: false,
        placeholder: ({ editor: ed, node }) => {
          if (node.type.name === 'heading') return 'Heading';
          if (ed.isEmpty) return 'Start writing, or type / for blocks';
          return 'Type / for blocks';
        },
      }),
      createSlashExtension(() => slashItems, selectSlash),
    ],
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'true' },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files || []).filter(isImageFile);
        if (!files.length) return false;
        // Rich HTML that merely carries an image preview (e.g. from Word) still pastes as an image.
        event.preventDefault();
        insertImages(files, view.state.selection.to);
        return true;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files || []).filter(isImageFile);
        if (!files.length) return false;
        event.preventDefault();
        const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
        insertImages(files, hit ? hit.pos : view.state.selection.to);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (onChange) onChange(ed);
    },
    onTransaction: ({ transaction }) => {
      if (transaction.docChanged && pending.size) {
        for (const m of pending) if (typeof m.pos === 'number') m.pos = transaction.mapping.map(m.pos);
      }
      if (pickerPos != null && transaction.docChanged) pickerPos = transaction.mapping.map(pickerPos);
      tb && tb.refresh();
    },
    onSelectionUpdate: () => tb && tb.refresh(),
    onFocus: () => tb && tb.refresh(),
    onBlur: () => tb && tb.refresh(),
  });

  tb = toolbar ? buildToolbar(editor, toolbar, { pickImage }) : null;
  tb && tb.refresh();

  function resetHistory(selection) {
    const { state } = editor;
    const fresh = EditorState.create({
      doc: state.doc,
      schema: state.schema,
      plugins: state.plugins,
      selection,
    });
    editor.view.updateState(fresh);
  }

  return {
    editor,
    setContent(html, { focus } = {}) {
      if (destroyed) return;
      pending.clear();
      pickerPos = null;
      editor.commands.setContent(html || '', false);
      const doc = editor.state.doc;
      const sel = focus === 'end' ? TextSelection.atEnd(doc) : TextSelection.atStart(doc);
      resetHistory(sel);
      if (focus) editor.commands.focus(focus === true ? 'start' : focus, { scrollIntoView: false });
      tb && tb.refresh();
    },
    setEditable(on) {
      if (destroyed) return;
      editor.setEditable(!!on, false);
      if (!on && slashKey.getState(editor.state)?.active) {
        editor.view.dispatch(editor.state.tr.setMeta(slashKey, { close: true }));
      }
      if (toolbar) toolbar.classList.toggle('is-readonly', !on);
      tb && tb.refresh();
    },
    focus(pos) {
      if (destroyed) return;
      editor.commands.focus(pos ?? null);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      tb && tb.destroy();
      fileInput.remove();
      editor.destroy();
    },
  };
}

/* ---------- toolbar ---------- */

function buildToolbar(editor, root, { pickImage }) {
  root.classList.add('tb');
  root.setAttribute('role', 'toolbar');
  root.setAttribute('aria-label', 'Formatting');
  root.innerHTML = '';

  const buttons = []; // { btn, isActive?, isDisabled? }
  const cleanups = [];

  const group = () => {
    const g = el('div', { class: 'tb-group' });
    root.appendChild(g);
    return g;
  };
  const sep = () => root.appendChild(el('div', { class: 'tb-sep', 'aria-hidden': 'true' }));

  function button(parent, { name, label, key, run, isActive, isDisabled }) {
    const title = key ? `${label} (${keyHint(key)})` : label;
    const btn = el('button', { type: 'button', class: 'tb-btn', 'aria-label': label, title }, icon(name, 18));
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      if (!editor.isEditable && !/^(undo|redo)$/.test(name)) return;
      run(e, btn);
    });
    if (isActive) btn.setAttribute('aria-pressed', 'false');
    parent.appendChild(btn);
    buttons.push({ btn, isActive, isDisabled });
    return btn;
  }

  /* history */
  const gHist = group();
  button(gHist, { name: 'undo', label: 'Undo', key: 'Mod-z', run: () => editor.chain().focus().undo().run(),
    isDisabled: () => !editor.isEditable || !editor.can().undo() });
  button(gHist, { name: 'redo', label: 'Redo', key: IS_MAC ? 'Mod-Shift-z' : 'Mod-y', run: () => editor.chain().focus().redo().run(),
    isDisabled: () => !editor.isEditable || !editor.can().redo() });
  sep();

  /* block type dropdown */
  const gBlock = group();
  const blockBtn = el('button', {
    type: 'button', class: 'tb-btn tb-block', 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
    'aria-label': 'Block type', title: 'Block type',
  }, `<span class="tb-block-label">Text</span>${icon('chevronDown', 14)}`);
  blockBtn.addEventListener('mousedown', (e) => e.preventDefault());
  gBlock.appendChild(blockBtn);
  const blockLabel = blockBtn.querySelector('.tb-block-label');
  buttons.push({ btn: blockBtn, isDisabled: () => !editor.isEditable });

  const blockMenu = el('div', { class: 'tb-menu', role: 'listbox', 'aria-label': 'Block type', hidden: true });
  blockMenu.addEventListener('mousedown', (e) => e.preventDefault());
  BLOCKS.forEach((b) => {
    const item = el('button', { type: 'button', class: 'tb-menu-item', role: 'option', 'data-id': b.id },
      `<span class="tb-menu-icon">${icon(b.icon, 16)}</span><span class="tb-menu-name">${escapeHtml(b.name)}</span>` +
      `<span class="tb-menu-hint">${escapeHtml(keyHint(b.key))}</span><span class="tb-menu-tick">${icon('tick', 14)}</span>`);
    item.addEventListener('click', () => {
      closeMenus();
      (b.run(editor.chain().focus(), editor) || editor.chain().focus()).run();
    });
    blockMenu.appendChild(item);
  });
  document.body.appendChild(blockMenu);

  blockMenu.addEventListener('keydown', (e) => {
    const items = [...blockMenu.querySelectorAll('.tb-menu-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = items.length;
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMenus();
      editor.commands.focus();
    }
  });

  blockBtn.addEventListener('click', (e) => {
    if (!editor.isEditable) return;
    if (!blockMenu.hidden) return closeMenus();
    closeMenus();
    const cur = currentBlock(editor).id;
    blockMenu.querySelectorAll('.tb-menu-item').forEach((it) => {
      const on = it.dataset.id === cur;
      it.classList.toggle('is-current', on);
      it.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    openFloating(blockMenu, blockBtn);
    blockBtn.setAttribute('aria-expanded', 'true');
    // Keyboard users (Enter/Space on the button) get focus moved into the menu.
    if (e.detail === 0) blockMenu.querySelector('.is-current, .tb-menu-item')?.focus();
  });
  sep();

  /* marks */
  const gMarks = group();
  const mark = (name, label, key, cmd, active) =>
    button(gMarks, { name, label, key, run: () => editor.chain().focus()[cmd]().run(), isActive: () => editor.isActive(active) });
  mark('bold', 'Bold', 'Mod-b', 'toggleBold', 'bold');
  mark('italic', 'Italic', 'Mod-i', 'toggleItalic', 'italic');
  mark('underline', 'Underline', 'Mod-u', 'toggleUnderline', 'underline');
  mark('strike', 'Strikethrough', 'Mod-Shift-s', 'toggleStrike', 'strike');
  mark('highlight', 'Highlight', 'Mod-Shift-h', 'toggleHighlight', 'highlight');
  mark('code', 'Inline code', 'Mod-e', 'toggleCode', 'code');
  sep();

  /* lists */
  const gLists = group();
  button(gLists, { name: 'list', label: 'Bulleted list', key: 'Mod-Shift-8', run: () => editor.chain().focus().toggleBulletList().run(),
    isActive: () => editor.isActive('bulletList') });
  button(gLists, { name: 'ordered', label: 'Numbered list', key: 'Mod-Shift-7', run: () => editor.chain().focus().toggleOrderedList().run(),
    isActive: () => editor.isActive('orderedList') });
  button(gLists, { name: 'check', label: 'Checklist', key: 'Mod-Shift-9', run: () => editor.chain().focus().toggleTaskList().run(),
    isActive: () => editor.isActive('taskList') });
  sep();

  /* inserts */
  const gIns = group();
  const linkBtn = button(gIns, { name: 'link', label: 'Link', run: (_e, btn) => toggleLinkPopover(btn),
    isActive: () => editor.isActive('link') });
  button(gIns, { name: 'image', label: 'Image', run: () => pickImage() });
  button(gIns, { name: 'table', label: 'Table', run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    isDisabled: () => !editor.isEditable || editor.isActive('table') });
  button(gIns, { name: 'divider', label: 'Divider', run: () => editor.chain().focus().setHorizontalRule().run() });

  /* table contextual row */
  const tableSep = el('div', { class: 'tb-sep tb-table-sep', 'aria-hidden': 'true', hidden: true });
  root.appendChild(tableSep);
  const gTable = el('div', { class: 'tb-group tb-table', role: 'group', 'aria-label': 'Table', hidden: true });
  root.appendChild(gTable);
  const tableActions = [
    ['Row below', 'addRowAfter'],
    ['Column right', 'addColumnAfter'],
    ['Delete row', 'deleteRow', true],
    ['Delete column', 'deleteColumn', true],
    ['Delete table', 'deleteTable', true],
  ];
  const tableBtns = tableActions.map(([label, cmd, danger]) => {
    const b = el('button', { type: 'button', class: 'tb-text' + (danger ? ' is-danger' : ''), title: label }, escapeHtml(label));
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => editor.isEditable && editor.chain().focus()[cmd]().run());
    gTable.appendChild(b);
    return { b, cmd };
  });

  /* link popover */
  const pop = el('div', { class: 'link-pop', role: 'dialog', 'aria-label': 'Edit link', hidden: true });
  pop.innerHTML =
    `<form class="link-pop-form" novalidate>` +
    `<input class="link-pop-input" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste or type a link" aria-label="URL">` +
    `<button type="submit" class="link-pop-apply">Apply</button>` +
    `<button type="button" class="link-pop-remove" aria-label="Remove link" title="Remove link">${icon('x', 16)}</button>` +
    `</form><div class="link-pop-error" role="alert" hidden>That link can't be used.</div>`;
  document.body.appendChild(pop);
  const popForm = pop.querySelector('form');
  const popInput = pop.querySelector('input');
  const popRemove = pop.querySelector('.link-pop-remove');
  const popError = pop.querySelector('.link-pop-error');
  let popSel = null;

  function toggleLinkPopover(anchor) {
    if (!pop.hidden) return closeMenus(true);
    closeMenus();
    const { from, to } = editor.state.selection;
    popSel = { from, to };
    const href = editor.getAttributes('link').href || '';
    popInput.value = href;
    popRemove.hidden = !href;
    popError.hidden = true;
    openFloating(pop, anchor || linkBtn);
    popInput.focus();
    popInput.select();
  }

  popInput.addEventListener('input', () => (popError.hidden = true));
  popForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = popInput.value.trim();
    if (!raw) {
      removeLink();
      return;
    }
    const href = normalizeUrl(raw);
    if (!href) {
      popError.hidden = false;
      popInput.focus();
      return;
    }
    const chain = editor.chain().focus();
    if (popSel) chain.setTextSelection(popSel);
    const { empty } = popSel ? { empty: popSel.from === popSel.to } : editor.state.selection;
    if (editor.isActive('link') || !empty) {
      chain.extendMarkRange('link').setLink({ href }).run();
    } else {
      const text = raw.replace(/^https?:\/\//i, '');
      chain
        .insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] })
        .unsetMark('link')
        .run();
    }
    closeMenus(false);
  });
  function removeLink() {
    const chain = editor.chain().focus();
    if (popSel) chain.setTextSelection(popSel);
    chain.extendMarkRange('link').unsetLink().run();
    closeMenus(false);
  }
  popRemove.addEventListener('click', removeLink);
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenus(true);
    }
  });

  /* floating helpers */
  function openFloating(node, anchor) {
    node.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const margin = 8;
    let left = Math.min(Math.max(margin, r.left), window.innerWidth - w - margin);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - margin && r.top - h - 6 > margin) top = r.top - h - 6;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.classList.remove('is-open');
    requestAnimationFrame(() => node.classList.add('is-open'));
  }

  function closeMenus(refocus) {
    const wasOpen = !blockMenu.hidden || !pop.hidden;
    blockMenu.hidden = true;
    blockMenu.classList.remove('is-open');
    blockBtn.setAttribute('aria-expanded', 'false');
    pop.hidden = true;
    pop.classList.remove('is-open');
    popSel = null;
    if (refocus && wasOpen && !editor.isDestroyed) editor.commands.focus();
  }

  const onDocDown = (e) => {
    if (blockMenu.hidden && pop.hidden) return;
    if (blockMenu.contains(e.target) || pop.contains(e.target) || blockBtn.contains(e.target) || linkBtn.contains(e.target)) return;
    closeMenus();
  };
  const onDocKey = (e) => {
    if (e.key === 'Escape' && !blockMenu.hidden) {
      closeMenus(true);
    }
  };
  const onViewport = () => closeMenus();
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onDocKey);
  window.addEventListener('resize', onViewport);
  root.addEventListener('scroll', onViewport, { passive: true });
  cleanups.push(() => {
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onDocKey);
    window.removeEventListener('resize', onViewport);
    root.removeEventListener('scroll', onViewport);
  });

  /* scroll hint: fade the trailing edge only while there is more to scroll to */
  let ovRaf = 0;
  const updateOverflow = () => {
    ovRaf = 0;
    const more = root.scrollWidth > root.clientWidth + 1 && root.scrollLeft + root.clientWidth < root.scrollWidth - 1;
    root.classList.toggle('is-overflowing', more);
  };
  const queueOverflow = () => { if (!ovRaf) ovRaf = requestAnimationFrame(updateOverflow); };
  const ro = new ResizeObserver(queueOverflow);
  ro.observe(root);
  root.addEventListener('scroll', queueOverflow, { passive: true });
  cleanups.push(() => {
    ro.disconnect();
    cancelAnimationFrame(ovRaf);
    root.removeEventListener('scroll', queueOverflow);
    root.classList.remove('is-overflowing');
  });

  /* refresh (cheap; runs per transaction) */
  let lastSig = '';
  function refresh() {
    if (editor.isDestroyed) return;
    const editable = editor.isEditable;
    const inTable = editable && editor.isActive('table');
    const states = buttons.map(({ isActive, isDisabled }) => [
      isActive ? !!isActive() : null,
      isDisabled ? !!isDisabled() : !editable,
    ]);
    const blk = currentBlock(editor);
    const tState = inTable ? tableBtns.map(({ cmd }) => editor.can()[cmd]()) : [];
    const sig = JSON.stringify([states, blk.id, inTable, tState]);
    if (sig === lastSig) return;
    lastSig = sig;
    buttons.forEach(({ btn }, i) => {
      const [active, disabled] = states[i];
      if (active !== null) {
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      btn.disabled = disabled;
    });
    blockLabel.textContent = blk.name;
    gTable.hidden = !inTable;
    tableSep.hidden = !inTable;
    tableBtns.forEach(({ b }, i) => (b.disabled = !tState[i]));
    queueOverflow();
  }

  return {
    refresh,
    destroy() {
      cleanups.forEach((f) => f());
      blockMenu.remove();
      pop.remove();
      root.innerHTML = '';
      root.classList.remove('tb');
    },
  };
}
