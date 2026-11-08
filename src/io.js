// Stackpad import/export helpers: Markdown <-> TipTap HTML, standalone HTML
// export, downloads, image compression and JSON backups.

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Marked } from 'marked';
import { uid } from './store.js';

// ---------------------------------------------------------------------------
// HTML -> Markdown

let turndown = null;

function cleanCell(content) {
  return content
    .trim()
    .replace(/\n+/g, '<br>')   // GFM cells are single-line
    .replace(/\|/g, '\\|');
}

function tableOf(node) {
  let el = node;
  while (el && el.nodeName !== 'TABLE') el = el.parentNode;
  return el;
}

/** Rows that belong to this table (not to nested tables). */
function ownRows(table) {
  const rows = [];
  for (const section of table.childNodes) {
    if (section.nodeName === 'TR') rows.push(section);
    else if (/^(THEAD|TBODY|TFOOT)$/.test(section.nodeName)) {
      for (const tr of section.childNodes) if (tr.nodeName === 'TR') rows.push(tr);
    }
  }
  return rows;
}

const cellsOf = (tr) => Array.from(tr.childNodes).filter((c) => c.nodeName === 'TH' || c.nodeName === 'TD');

function columnCount(table) {
  let max = 0;
  for (const tr of ownRows(table)) {
    const n = cellsOf(tr).reduce((sum, c) => sum + (parseInt(c.getAttribute('colspan'), 10) || 1), 0);
    if (n > max) max = n;
  }
  return max;
}

function isTaskItem(node) {
  // TipTap 2.27 renders task items as <li data-checked> inside ul[data-type=taskList] (no data-type on the li).
  if (node.nodeName !== 'LI') return false;
  if (node.getAttribute('data-type') === 'taskItem') return true;
  const parent = node.parentNode;
  return !!parent && parent.nodeName === 'UL' && parent.getAttribute('data-type') === 'taskList' && node.hasAttribute('data-checked');
}

function getTurndown() {
  if (turndown) return turndown;
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '---',
  });
  td.use(gfm);

  // Rules added after the plugin take precedence (turndown unshifts rules).

  td.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: (content) => (content.trim() ? `~~${content}~~` : content),
  });

  td.addRule('mark', {
    filter: 'mark',
    replacement: (content) => (content.trim() ? `==${content}==` : content),
  });

  td.addRule('underline', {
    filter: 'u',
    replacement: (content) => content,
  });

  // Tables: TipTap emits the header row as <th> cells inside <tbody>, which the
  // gfm plugin doesn't treat as a heading row. The first row always becomes the
  // GFM header (GFM requires one); rows are padded to the widest row.
  td.addRule('tableCell', {
    filter: ['th', 'td'],
    replacement: (content, node) => {
      const span = Math.max(1, parseInt(node.getAttribute('colspan'), 10) || 1);
      let out = `| ${cleanCell(content)} `;
      for (let i = 1; i < span; i++) out += '|  ';
      return out;
    },
  });

  td.addRule('tableRow', {
    filter: 'tr',
    replacement: (content, node) => {
      const table = tableOf(node);
      const cols = table ? columnCount(table) : 0;
      const have = cellsOf(node).reduce((s, c) => s + (parseInt(c.getAttribute('colspan'), 10) || 1), 0);
      let row = content + '|  '.repeat(Math.max(0, cols - have)) + '|';
      if (table && ownRows(table)[0] === node) {
        row += '\n|' + ' --- |'.repeat(Math.max(cols, 1));
      }
      return '\n' + row + '\n';
    },
  });

  td.addRule('tableSection', {
    filter: ['thead', 'tbody', 'tfoot'],
    replacement: (content) => content,
  });

  td.addRule('table', {
    filter: 'table',
    replacement: (content) => '\n\n' + content.replace(/\n+/g, '\n').trim() + '\n\n',
  });

  // TipTap colgroup carries widths only.
  td.remove(['colgroup', 'col']);

  // TipTap task lists. The <label><input></label> holds the checkbox; the
  // state lives on li[data-checked]. Content sits in a <div>.
  td.addRule('taskCheckboxLabel', {
    filter: (node) => node.nodeName === 'LABEL' && node.parentNode && isTaskItem(node.parentNode),
    replacement: () => '',
  });

  // List items (task and regular). Turndown's default uses "-   " (3 spaces);
  // we use "- " with continuation lines indented to the content column, which
  // is what CommonMark/marked expect for nesting.
  td.addRule('listItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode;
      let prefix;
      if (isTaskItem(node)) {
        prefix = `${options.bulletListMarker} [${node.getAttribute('data-checked') === 'true' ? 'x' : ' '}] `;
      } else if (parent && parent.nodeName === 'OL') {
        const start = parseInt(parent.getAttribute('start'), 10);
        const index = Array.prototype.indexOf.call(
          Array.from(parent.childNodes).filter((c) => c.nodeName === 'LI'), node,
        );
        prefix = `${(Number.isFinite(start) ? start : 1) + index}. `;
      } else {
        prefix = `${options.bulletListMarker} `;
      }
      content = content.replace(/^\n+/, '').replace(/\n+$/, '\n');
      // TipTap wraps every item in <p>. If an item is just one paragraph (plus
      // nested lists) keep the list tight instead of emitting blank lines.
      const blocks = [];
      for (const child of node.childNodes) {
        if (child.nodeName === 'DIV' && isTaskItem(node)) blocks.push(...child.childNodes);
        else blocks.push(child);
      }
      const hasPre = blocks.some((k) => k.nodeName === 'PRE');
      if (!hasPre && blocks.filter((k) => k.nodeName === 'P' || k.nodeName === 'BLOCKQUOTE').length <= 1) {
        content = content.replace(/\n{2,}/g, '\n');
      }
      const indent = ' '.repeat(isTaskItem(node) ? 2 : prefix.length);
      content = content.replace(/\n(?=.)/g, '\n' + indent);
      let next = node.nextSibling;
      while (next && next.nodeName !== 'LI') next = next.nextSibling;
      return prefix + content.replace(/\n$/, '') + (next ? '\n' : '');
    },
  });

  // Nested lists inside a task item's <div> (or a regular li) must not be
  // padded with blank lines.
  td.addRule('list', {
    filter: ['ul', 'ol'],
    replacement: (content, node) => {
      const parent = node.parentNode;
      const nested = parent && (parent.nodeName === 'LI' || (parent.nodeName === 'DIV' && parent.parentNode && isTaskItem(parent.parentNode)));
      if (nested) return '\n' + content.replace(/^\n+|\n+$/g, '') + '\n';
      return '\n\n' + content.replace(/^\n+|\n+$/g, '') + '\n\n';
    },
  });

  // Images: keep data: URLs verbatim (turndown's default does, but be explicit
  // and avoid emitting an empty title).
  td.addRule('image', {
    filter: 'img',
    replacement: (content, node) => {
      const src = node.getAttribute('src') || '';
      if (!src) return '';
      const alt = (node.getAttribute('alt') || '').replace(/[\[\]]/g, '\\$&');
      const title = node.getAttribute('title');
      const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : '';
      return `![${alt}](${src.replace(/[()\s]/g, (c) => encodeURIComponent(c))}${titlePart})`;
    },
  });

  turndown = td;
  return td;
}

export function htmlToMarkdown(html) {
  if (!html || typeof html !== 'string') return '';
  try {
    return getTurndown().turndown(html).replace(/\n{3,}/g, '\n\n').trim() + '\n';
  } catch (err) {
    console.warn('[stackpad/io] htmlToMarkdown failed:', err);
    return htmlToText(html) + '\n';
  }
}

// ---------------------------------------------------------------------------
// Markdown -> HTML

let marked = null;

function getMarked() {
  if (marked) return marked;
  marked = new Marked({ gfm: true, breaks: false, async: false });
  // ==highlight== as an inline token, so code spans/blocks are naturally excluded.
  marked.use({
    extensions: [{
      name: 'mark',
      level: 'inline',
      start(src) {
        const i = src.indexOf('==');
        return i < 0 ? undefined : i;
      },
      tokenizer(src) {
        const m = /^==(?=[^\s=])([\s\S]*?[^\s=])==(?!=)/.exec(src);
        if (!m) return undefined;
        return { type: 'mark', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(token) {
        return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
      },
    }],
  });
  return marked;
}

const DANGEROUS_TAGS = 'script, style, iframe, frame, frameset, object, embed, link, meta, base, form, noscript, template';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset', 'poster', 'background'];

function isUnsafeUrl(name, value) {
  // Browsers ignore whitespace/control chars inside the scheme ("java\nscript:").
  const v = String(value).replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return true;
  // data: is fine for images, not for navigation (data:text/html phishing).
  if (v.startsWith('data:') && !(name === 'src' && v.startsWith('data:image/'))) return true;
  return false;
}

/** Strips scripts, event handlers and script URLs from a parsed body in place. */
function sanitizeTree(root) {
  root.querySelectorAll(DANGEROUS_TAGS).forEach((el) => el.remove());
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      } else if (URL_ATTRS.includes(name) && isUnsafeUrl(name, attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
}

const INLINE_TAGS = new Set(['A', 'ABBR', 'B', 'BR', 'CODE', 'DEL', 'EM', 'I', 'IMG', 'MARK', 'S', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U', 'KBD', 'SMALL', 'STRIKE', 'Q', 'CITE']);
const isInline = (n) => n.nodeType === 3 || (n.nodeType === 1 && INLINE_TAGS.has(n.nodeName));

function checkboxOf(li) {
  const first = Array.from(li.childNodes).find((c) => !(c.nodeType === 3 && !c.data.trim()));
  if (!first || first.nodeType !== 1) return null;
  if (first.nodeName === 'INPUT' && (first.getAttribute('type') || '').toLowerCase() === 'checkbox') return first;
  if (first.nodeName === 'P') {
    const inner = Array.from(first.childNodes).find((c) => !(c.nodeType === 3 && !c.data.trim()));
    if (inner && inner.nodeName === 'INPUT' && (inner.getAttribute('type') || '').toLowerCase() === 'checkbox') return inner;
  }
  return null;
}

/** Wrap runs of inline nodes directly inside `el` in <p>. */
function wrapInlineRuns(doc, el) {
  let run = [];
  const flush = (before) => {
    if (run.some((n) => n.nodeType !== 3 || n.data.trim())) {
      const p = doc.createElement('p');
      el.insertBefore(p, before);
      run.forEach((n) => p.appendChild(n));
      // Trim surrounding whitespace text.
      if (p.firstChild && p.firstChild.nodeType === 3) p.firstChild.data = p.firstChild.data.replace(/^\s+/, '');
      if (p.lastChild && p.lastChild.nodeType === 3) p.lastChild.data = p.lastChild.data.replace(/\s+$/, '');
    } else {
      run.forEach((n) => n.remove());
    }
    run = [];
  };
  for (const child of Array.from(el.childNodes)) {
    if (isInline(child)) run.push(child);
    else flush(child);
  }
  flush(null);
  if (!el.firstChild) el.appendChild(doc.createElement('p'));
}

function convertTaskLists(doc) {
  // Process innermost-first is unnecessary: each li is handled independently.
  const lists = Array.from(doc.body.querySelectorAll('ul, ol'));
  for (const list of lists) {
    const items = Array.from(list.children).filter((c) => c.nodeName === 'LI');
    if (!items.some((li) => checkboxOf(li))) continue;
    let target = list;
    if (list.nodeName === 'OL') {
      // TipTap task lists are <ul>; replace the element, keep children.
      target = doc.createElement('ul');
      while (list.firstChild) target.appendChild(list.firstChild);
      list.replaceWith(target);
    }
    target.setAttribute('data-type', 'taskList');
    for (const li of items) {
      const box = checkboxOf(li);
      const checked = !!box && (box.hasAttribute('checked') || box.checked === true);
      if (box) {
        const next = box.nextSibling;
        if (next && next.nodeType === 3) next.data = next.data.replace(/^\s+/, '');
        box.remove();
      }
      li.setAttribute('data-type', 'taskItem');
      li.setAttribute('data-checked', checked ? 'true' : 'false');
      wrapInlineRuns(doc, li);
    }
  }
}

export function markdownToHtml(md) {
  if (md == null) return '';
  let html;
  try {
    html = getMarked().parse(String(md));
  } catch (err) {
    console.warn('[stackpad/io] markdown parse failed:', err);
    return `<p>${escapeHtml(String(md))}</p>`;
  }
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  sanitizeTree(doc.body);
  convertTaskLists(doc);
  return doc.body.innerHTML.trim();
}

// ---------------------------------------------------------------------------
// Plain text

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'UL', 'BODY',
]);

export function htmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/?(p|div|li|h[1-6]|br|tr|pre|blockquote)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  }
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) { parts.push(node.data); return; }
    if (node.nodeType !== 1) return;
    const tag = node.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') return;
    if (tag === 'BR') { parts.push('\n'); return; }
    if (tag === 'IMG') { const alt = node.getAttribute('alt'); if (alt) parts.push(` ${alt} `); return; }
    const block = BLOCK_TAGS.has(tag);
    const cell = tag === 'TD' || tag === 'TH';
    if (block) parts.push('\n');
    for (const child of node.childNodes) walk(child);
    if (block) parts.push('\n');
    else if (cell) parts.push(' ');
  };
  walk(doc.body);
  return parts.join('')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Standalone HTML export

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const EXPORT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: #1d1d1f; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
main { max-width: 720px; margin: 0 auto; padding: 56px 24px 96px; }
h1.title { font-size: 2.1em; line-height: 1.2; margin: 0 0 .3em; letter-spacing: -0.01em; }
.meta { color: #6e6e73; font-size: .85em; margin: 0 0 2.2em; }
.meta span + span::before { content: "·"; margin: 0 .5em; }
h1, h2, h3, h4 { line-height: 1.3; margin: 1.6em 0 .5em; }
p { margin: 0 0 .9em; }
a { color: #0066cc; }
img { max-width: 100%; height: auto; border-radius: 6px; }
blockquote { margin: 1em 0; padding: 0 0 0 1em; border-left: 3px solid #d2d2d7; color: #424245; }
code { font: .9em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #f5f5f7; padding: .1em .35em; border-radius: 4px; }
pre { background: #f5f5f7; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
hr { border: 0; border-top: 1px solid #d2d2d7; margin: 2em 0; }
mark { background: #fff3a3; color: inherit; padding: 0 .1em; border-radius: 2px; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .95em; }
th, td { border: 1px solid #d2d2d7; padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: #f5f5f7; font-weight: 600; }
th p, td p { margin: 0; }
ul[data-type="taskList"] { list-style: none; padding-left: .2em; }
ul[data-type="taskList"] li { display: flex; gap: .55em; align-items: flex-start; }
ul[data-type="taskList"] li > label { flex: none; margin-top: .2em; }
ul[data-type="taskList"] li > div { flex: 1; min-width: 0; }
ul[data-type="taskList"] li[data-checked="true"] > div { color: #86868b; text-decoration: line-through; }
ul[data-type="taskList"] p { margin: 0; }
@media print {
  main { padding: 0; max-width: none; }
  a { color: inherit; }
  pre, blockquote, table, img { break-inside: avoid; }
  h1, h2, h3 { break-after: avoid; }
}
`.trim();

function formatDate(ts) {
  if (!Number.isFinite(ts)) return '';
  try { return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return new Date(ts).toISOString(); }
}

export function noteToHtmlDocument(note) {
  const n = note || {};
  const title = (typeof n.title === 'string' && n.title.trim()) || 'Untitled';
  let body = typeof n.content === 'string' ? n.content : '';
  if (typeof DOMParser !== 'undefined' && body) {
    const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${body}</body></html>`, 'text/html');
    sanitizeTree(doc.body);
    // Exported checkboxes are read-only.
    doc.body.querySelectorAll('input[type="checkbox"]').forEach((i) => i.setAttribute('disabled', ''));
    body = doc.body.innerHTML;
  }
  const meta = [];
  if (n.updated) meta.push(`<span>Updated ${escapeHtml(formatDate(n.updated))}</span>`);
  if (Array.isArray(n.tags) && n.tags.length) meta.push(`<span>${n.tags.map((t) => '#' + escapeHtml(t)).join(' ')}</span>`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Stackpad">
<title>${escapeHtml(title)}</title>
<style>
${EXPORT_CSS}
</style>
</head>
<body>
<main>
<h1 class="title">${escapeHtml(title)}</h1>
${meta.length ? `<p class="meta">${meta.join('')}</p>\n` : ''}<article>
${body}
</article>
</main>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Files

export function download(filename, content, mime = 'text/plain') {
  try {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Revoking synchronously can cancel the download in some browsers.
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  } catch (err) {
    console.warn('[stackpad/io] download failed:', err);
  }
}

const RESERVED_WIN = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export function safeFilename(title) {
  let name = String(title == null ? '' : title)
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (name.length > 80) name = Array.from(name).slice(0, 80).join('').trim().replace(/[.\s]+$/, '');
  if (!name) return 'Untitled';
  if (RESERVED_WIN.test(name)) name = `_${name}`;
  return name;
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; }));
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const PASSTHROUGH_TYPES = new Set(['image/gif', 'image/svg+xml']);
const BIG_FILE_BYTES = 1.5 * 1024 * 1024;

/**
 * Downscale an image File to fit maxDim and return a data URL.
 * - GIF/SVG: original data URL (animation/vector preserved).
 * - PNG: stays PNG (transparency). JPEG/WebP/other raster: JPEG at `quality`.
 * - Small images that need no resize are returned as-is unless they are large
 *   lossy files that re-encoding will meaningfully shrink.
 */
export async function compressImage(file, maxDim = 1800, quality = 0.85) {
  if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }
  const type = file.type.toLowerCase();
  if (PASSTHROUGH_TYPES.has(type)) return readAsDataURL(file);

  let source;
  try {
    source = await decodeImage(file);
  } catch {
    throw new Error("This image format isn't supported by your browser.");
  }
  try {
    const w = source.width || source.naturalWidth;
    const h = source.height || source.naturalHeight;
    if (!w || !h) throw new Error("This image couldn't be read.");
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const isPng = type === 'image/png';
    const outType = isPng ? 'image/png' : 'image/jpeg';
    const needsResize = scale < 1;
    const worthReencoding = !isPng && file.size > BIG_FILE_BYTES;
    if (!needsResize && !worthReencoding && (isPng || type === 'image/jpeg' || type === 'image/webp')) {
      return readAsDataURL(file);
    }

    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return readAsDataURL(file);
    if (outType === 'image/jpeg') {
      // JPEG has no alpha: flatten transparent pixels onto white, not black.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, tw, th);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, tw, th);
    const dataUrl = canvas.toDataURL(outType, outType === 'image/jpeg' ? quality : undefined);
    // Re-encoding without resizing sometimes grows the file; keep the smaller.
    if (!needsResize && dataUrl.length * 0.75 >= file.size) return readAsDataURL(file);
    return dataUrl;
  } finally {
    if (source && typeof source.close === 'function') source.close();
  }
}

export async function readFileText(file) {
  if (file && typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

// ---------------------------------------------------------------------------
// Backups

export function makeBackup({ notes = [], notebooks = [] } = {}) {
  return JSON.stringify({
    app: 'stackpad',
    version: 1,
    exportedAt: new Date().toISOString(),
    notebooks,
    notes,
  });
}

function toTime(v, fallback) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v);
  if (typeof v === 'string' && v.trim()) {
    const num = Number(v);
    if (Number.isFinite(num) && num > 0) return Math.round(num);
    const parsed = Date.parse(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

const str = (v, fallback = '') => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function normalizeTags(v) {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const seen = new Set();
  const out = [];
  for (const t of list) {
    if (typeof t !== 'string' && typeof t !== 'number') continue;
    const tag = String(t).trim().replace(/^#/, '').replace(/\s+/g, ' ');
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag.slice(0, 64));
  }
  return out;
}

/**
 * Validate and normalise a backup file. Throws Error with a user-facing
 * message if the file is unusable. Returns { notes, notebooks }.
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(typeof text === 'string' ? text.replace(/^﻿/, '') : text);
  } catch {
    throw new Error("This file isn't a valid Stackpad backup (it isn't JSON).");
  }
  if (!isObj(data)) throw new Error("This file isn't an Stackpad backup.");
  if (data.app != null && data.app !== 'stackpad') {
    throw new Error(`This backup was made by a different app (“${str(data.app).slice(0, 40)}”).`);
  }
  const version = Number(data.version ?? 1);
  if (Number.isFinite(version) && version > 1) {
    throw new Error('This backup was made by a newer version of Stackpad. Please update and try again.');
  }
  if (!Array.isArray(data.notes) && !Array.isArray(data.notebooks)) {
    throw new Error("This file doesn't contain any Stackpad notes or notebooks.");
  }

  const now = Date.now();

  const notebookMap = new Map();
  for (const raw of Array.isArray(data.notebooks) ? data.notebooks : []) {
    if (!isObj(raw)) continue;
    const id = str(raw.id).trim() || uid('b');
    const created = toTime(raw.created, now);
    notebookMap.set(id, {
      id,
      name: str(raw.name).trim().slice(0, 200) || 'Untitled notebook',
      created,
      updated: toTime(raw.updated, created),
    });
  }

  const noteMap = new Map();
  let orphanBook = null;
  for (const raw of Array.isArray(data.notes) ? data.notes : []) {
    if (!isObj(raw)) continue;
    const id = str(raw.id).trim() || uid('n');
    let notebookId = str(raw.notebookId).trim();
    if (!notebookMap.has(notebookId)) {
      // Attach orphans to the first notebook, or create one for them.
      const first = notebookMap.keys().next();
      if (!first.done) notebookId = first.value;
      else {
        if (!orphanBook) {
          orphanBook = { id: uid('b'), name: 'Imported', created: now, updated: now };
          notebookMap.set(orphanBook.id, orphanBook);
        }
        notebookId = orphanBook.id;
      }
    }
    const content = str(raw.content);
    const created = toTime(raw.created, now);
    let trashed = null;
    if (raw.trashed === true) trashed = now;
    else if (raw.trashed != null && raw.trashed !== false) trashed = toTime(raw.trashed, null);
    noteMap.set(id, {
      id,
      notebookId,
      title: str(raw.title).slice(0, 500),
      content,
      text: typeof raw.text === 'string' ? raw.text : htmlToText(content),
      tags: normalizeTags(raw.tags),
      pinned: raw.pinned === true || raw.pinned === 'true' || raw.pinned === 1,
      created,
      updated: toTime(raw.updated, created),
      trashed,
    });
  }

  if (!notebookMap.size && !noteMap.size) {
    throw new Error('This backup is empty — it has no notes or notebooks to import.');
  }
  return { notes: [...noteMap.values()], notebooks: [...notebookMap.values()] };
}
