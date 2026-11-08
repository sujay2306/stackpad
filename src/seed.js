// First-launch content for Stackpad.

const MIN = 60 * 1000;

/** Strip HTML to searchable plain text. */
function toText(html) {
  return html
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/tr|\/blockquote|\/pre|hr)[^>]*>/gi, ' ')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const task = (text, checked = false) =>
  `<li data-type="taskItem" data-checked="${checked}"><p>${text}</p></li>`;

const tr = (cells, tag = 'td') =>
  `<tr>${cells.map((c) => `<${tag}><p>${c}</p></${tag}>`).join('')}</tr>`;

const WELCOME = `
<p>Stackpad is a quiet place for everything on your mind. Notes, plans, code snippets and half-formed ideas, all <mark>kept in one calm space</mark>.</p>
<p>Start writing right away, no account needed. Notes save instantly in this browser and work offline. <strong>Sign in with Google</strong> (bottom left) to sync them across your laptop and phone.</p>
<h2>Things to try</h2>
<ul data-type="taskList">
${task('Type <code>/</code> on an empty line to insert any block')}
${task('Press <code>⌘K</code> or <code>Ctrl K</code> to search every note')}
${task('Use markdown shortcuts like <code># </code> for a heading or <code>- [ ] </code> for a task')}
${task('Drag and drop, or paste, an image straight into a note')}
${task('Pin a note to keep it in your shortcuts')}
${task('Add tags to group notes across notebooks')}
${task('Start a new note from a template')}
${task('Turn on focus mode to hide everything but the page')}
${task('Export any note to Markdown')}
${task('Switch to dark mode for late-night writing')}
</ul>
<h2>Keyboard shortcuts</h2>
<table><tbody>
${tr(['Action', 'Mac', 'Windows / Linux'], 'th')}
${tr(['Search everything', '⌘ K', 'Ctrl K'])}
${tr(['Bold', '⌘ B', 'Ctrl B'])}
${tr(['Italic', '⌘ I', 'Ctrl I'])}
${tr(['Underline', '⌘ U', 'Ctrl U'])}
${tr(['Highlight', '⌘ Shift H', 'Ctrl Shift H'])}
${tr(['Insert block', '/', '/'])}
</tbody></table>
<h2>Write the way you think</h2>
<blockquote><p>The palest ink is better than the best memory.</p></blockquote>
<p>Text can be <strong>bold</strong>, <em>italic</em>, <u>underlined</u>, <s>struck through</s>, or <mark>highlighted</mark>. Lists nest neatly:</p>
<ul>
<li><p>Capture first</p></li>
<li><p>Organise later</p>
<ol><li><p>Notebooks for big areas</p></li><li><p>Tags for everything in between</p></li></ol>
</li>
</ul>
<h2>Made for code, too</h2>
<p>Type three backticks to start a code block:</p>
<pre><code>function greet(name) {
  return \`Hello, \${name}. Welcome to Stackpad.\`;
}</code></pre>
<hr>
<p><em>Ready? Create your first note with the New note button, or press</em> <code>/</code> <em>right here and start writing.</em></p>
`;

const MARKDOWN = `
<p>Type these at the start of a line and Stackpad formats as you go. Inline styles apply when you close the marks.</p>
<h2>Blocks</h2>
<table><tbody>
${tr(['Type', 'You get'], 'th')}
${tr(['<code># </code>', 'Heading 1'])}
${tr(['<code>## </code>', 'Heading 2'])}
${tr(['<code>### </code>', 'Heading 3'])}
${tr(['<code>- </code> or <code>* </code>', 'Bulleted list'])}
${tr(['<code>1. </code>', 'Numbered list'])}
${tr(['<code>[ ] </code>', 'Task list'])}
${tr(['<code>&gt; </code>', 'Quote'])}
${tr(['<code>\`\`\`</code>', 'Code block'])}
${tr(['<code>---</code>', 'Divider'])}
</tbody></table>
<h2>Inline</h2>
<table><tbody>
${tr(['Type', 'You get'], 'th')}
${tr(['<code>**bold**</code>', '<strong>bold</strong>'])}
${tr(['<code>*italic*</code>', '<em>italic</em>'])}
${tr(['<code>~~strike~~</code>', '<s>strike</s>'])}
${tr(['<code>\`code\`</code>', '<code>code</code>'])}
${tr(['<code>==highlight==</code>', '<mark>highlight</mark>'])}
</tbody></table>
<p><em>Prefer the mouse? Type</em> <code>/</code> <em>for the full block menu.</em></p>
`;

const WEEKEND = `
<p>Keep it light. Two things done already.</p>
<ul data-type="taskList">
${task('Book tickets for Saturday evening', true)}
${task('Call home', true)}
${task('Groceries for the week')}
${task('Finish two chapters of the current book')}
${task('Long walk on Sunday morning')}
${task('Clean up the desktop and downloads folder')}
</ul>
`;

const IDEAS = `
<p>Small sparks worth keeping. Revisit on Sundays.</p>
<ul>
<li><p>A tiny CLI that turns git commits into a weekly changelog</p></li>
<li><p>Weekend photo walk through old city lanes</p></li>
<li><p>Learn one new keyboard shortcut every day</p></li>
<li><p>Write a short post on what I learned shipping my first side project</p></li>
<li><p>Cook one new regional dish each month</p></li>
</ul>
`;

export function seedData(uid) {
  const now = Date.now();

  const personal = { id: uid('nb'), name: 'Personal', created: now - 40 * MIN, updated: now - 12 * MIN };
  const gettingStarted = { id: uid('nb'), name: 'Getting started', created: now - 40 * MIN, updated: now };

  const note = (notebookId, title, html, tags, minsAgo, pinned = false) => {
    const content = html.trim().replace(/>\s*\n\s*</g, '><');
    return {
      id: uid('note'),
      notebookId,
      title,
      content,
      text: toText(content),
      tags,
      pinned,
      created: now - (minsAgo + 5) * MIN,
      updated: now - minsAgo * MIN,
      trashed: null,
    };
  };

  // Keep first launch clean: one notebook, one welcome note.
  const notes = [note(personal.id, 'Welcome to Stackpad', WELCOME, [], 0, true)];
  void gettingStarted; void MARKDOWN; void WEEKEND; void IDEAS;
  return { notebooks: [personal], notes };
}
