// Stackpad note templates.
// Each template returns TipTap-compatible HTML. The note title is separate,
// so bodies never start with an h1.

const today = () =>
  new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const longDate = () =>
  new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const tasks = (items) =>
  `<ul data-type="taskList">${items
    .map((t) => `<li data-type="taskItem" data-checked="false"><p>${t}</p></li>`)
    .join('')}</ul>`;

const row = (cells, tag = 'td') =>
  `<tr>${cells.map((c) => `<${tag}><p>${c}</p></${tag}>`).join('')}</tr>`;

const table = (head, rows) =>
  `<table><tbody>${row(head, 'th')}${rows.map((r) => row(r)).join('')}</tbody></table>`;

export const TEMPLATES = [
  {
    id: 'meeting',
    name: 'Meeting notes',
    description: 'Agenda, decisions and action items in one place.',
    icon: 'calendar',
    title: () => `Meeting notes · ${today()}`,
    html: () =>
      `<p><strong>Date:</strong> ${longDate()}</p><p><strong>Attendees:</strong> </p>` +
      `<h2>Agenda</h2><ol><li><p>Topic one</p></li><li><p>Topic two</p></li></ol>` +
      `<h2>Notes</h2><ul><li><p></p></li></ul>` +
      `<h2>Decisions</h2><ul><li><p></p></li></ul>` +
      `<h2>Action items</h2>` +
      table(['Task', 'Owner', 'Due'], [['', '', ''], ['', '', '']]) +
      `<h2>Next steps</h2>` +
      tasks(['Share these notes with the team', 'Schedule the follow-up']),
  },
  {
    id: 'journal',
    name: 'Daily journal',
    description: 'A calm few minutes to plan and reflect on the day.',
    icon: 'book',
    title: () => `Journal · ${today()}`,
    html: () =>
      `<p><em>${longDate()}</em></p>` +
      `<h2>Grateful for</h2><ol><li><p></p></li><li><p></p></li><li><p></p></li></ol>` +
      `<h2>Today's focus</h2>` +
      tasks(['The one thing that matters most', 'Something small but useful']) +
      `<h2>What happened</h2><p></p>` +
      `<h2>Reflection</h2>` +
      `<blockquote><p>What went well, and what would I do differently?</p></blockquote><p></p>`,
  },
  {
    id: 'todo',
    name: 'To-do list',
    description: 'A clean checklist, split by priority.',
    icon: 'check',
    title: () => `To-do · ${today()}`,
    html: () =>
      `<h2>Must do</h2>` +
      tasks(['Most important task', 'Second priority']) +
      `<h2>Should do</h2>` +
      tasks(['Nice to finish today']) +
      `<h2>Later</h2>` +
      tasks(['Park it here']) +
      `<hr><p><em>Tip: type [ ] at the start of a line to add a new task.</em></p>`,
  },
  {
    id: 'project',
    name: 'Project plan',
    description: 'Goal, scope, milestones and risks on a single page.',
    icon: 'star',
    title: () => 'Project plan',
    html: () =>
      `<h2>Overview</h2>` +
      `<p><strong>Goal:</strong> What does done look like?</p>` +
      `<p><strong>Why now:</strong> </p>` +
      `<h2>Scope</h2>` +
      `<h3>In scope</h3><ul><li><p></p></li></ul>` +
      `<h3>Out of scope</h3><ul><li><p></p></li></ul>` +
      `<h2>Milestones</h2>` +
      table(
        ['Milestone', 'Target date', 'Status'],
        [
          ['Kick-off', '', 'Not started'],
          ['First version', '', 'Not started'],
          ['Launch', '', 'Not started'],
        ]
      ) +
      `<h2>Tasks</h2>` +
      tasks(['Define requirements', 'Build first version', 'Review and ship']) +
      `<h2>Risks</h2><ul><li><p>Risk and how to reduce it</p></li></ul>` +
      `<h2>Links</h2><ul><li><p></p></li></ul>`,
  },
  {
    id: 'weekly',
    name: 'Weekly review',
    description: 'Look back, clear the decks and set up next week.',
    icon: 'sparkle',
    title: () => `Weekly review · ${today()}`,
    html: () =>
      `<h2>Wins</h2><ul><li><p></p></li></ul>` +
      `<h2>What didn't go to plan</h2><ul><li><p></p></li></ul>` +
      `<h2>Lessons</h2><blockquote><p>One thing to remember from this week.</p></blockquote>` +
      `<h2>Clear the decks</h2>` +
      tasks([
        'Empty inbox and notes',
        'Review calendar for next week',
        'Update project lists',
      ]) +
      `<h2>Top 3 for next week</h2><ol><li><p></p></li><li><p></p></li><li><p></p></li></ol>` +
      `<h2>Energy check</h2>` +
      table(['Area', 'Score (1 to 5)'], [['Work', ''], ['Health', ''], ['People', '']]),
  },
  {
    id: 'reading',
    name: 'Reading notes',
    description: 'Capture key ideas, quotes and takeaways from a book or article.',
    icon: 'notes',
    title: () => 'Reading notes',
    html: () =>
      table(
        ['Title', 'Author', 'Started'],
        [['', '', today()]]
      ) +
      `<h2>Summary in three lines</h2><p></p>` +
      `<h2>Key ideas</h2><ul><li><p></p></li><li><p></p></li></ul>` +
      `<h2>Favourite quotes</h2><blockquote><p>A line worth keeping.</p></blockquote>` +
      `<h2>How I'll use this</h2>` +
      tasks(['One idea to try this week']) +
      `<h2>Rating</h2><p> / 5</p>`,
  },
  {
    id: 'bug',
    name: 'Bug report',
    description: 'Steps, expected vs actual, environment and fix notes.',
    icon: 'codeblock',
    title: () => `Bug · ${today()}`,
    html: () =>
      `<p><strong>Summary:</strong> One line describing the problem.</p>` +
      table(
        ['Field', 'Value'],
        [
          ['Severity', 'Low / Medium / High'],
          ['Environment', 'Browser, OS, version'],
          ['Reported', today()],
        ]
      ) +
      `<h2>Steps to reproduce</h2><ol><li><p>Go to</p></li><li><p>Click on</p></li><li><p>See error</p></li></ol>` +
      `<h2>Expected</h2><p></p>` +
      `<h2>Actual</h2><p></p>` +
      `<h2>Logs</h2><pre><code>Paste the stack trace or console output here</code></pre>` +
      `<h2>Root cause</h2><p></p>` +
      `<h2>Fix checklist</h2>` +
      tasks(['Reproduce locally', 'Write a failing test', 'Fix and verify', 'Close the ticket']),
  },
];
