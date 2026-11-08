# Stackpad — Product Requirements (v1)

**Tagline:** Notes, stacked and searchable.
**Status:** v1 shipped (local-first web app) · **Host:** getsudo.in
**Last updated:** 8 Nov 2026

## 1. Vision

A calm, fast notebook that opens instantly, works offline and never asks you to sign up before you can write. Stackpad should feel premium and quiet: Apple-minimal surfaces, crisp type, no clutter. You capture first and organise later, and nothing is ever lost.

## 2. Problem

- Popular note apps have grown heavy: slow load, sign-up walls, upsell banners, sync limits on free plans.
- Students and developers want one place for lecture notes, code snippets, bug logs and plans. Today that work is spread across chat-to-self, plain text files and several apps.
- Many users in India are on mid-range phones and patchy networks. The app has to stay usable offline and on small screens.

## 3. Target users

| Segment | Need | What wins them |
|---|---|---|
| Developers | Snippets, bug notes, meeting notes | Code blocks, markdown shortcuts, ⌘K search |
| Students | Lecture notes, revision lists, journals | Notebooks, tags, templates, offline use |
| General users | Lists, plans, ideas | Zero sign-up, checklists, clean mobile layout |

## 4. Principles

1. **Write in under a second.** No account, no onboarding wall.
2. **Local-first.** Your data lives on your device; the network is optional.
3. **Quiet by default.** Solid surfaces, generous whitespace, no emojis, no filler.
4. **Keyboard and touch both first-class.**

## 5. v1 scope (shipped)

| Area | What ships |
|---|---|
| Notebooks | Create, rename, delete; move notes between notebooks |
| Rich pages | Headings, lists, task lists, quotes, code blocks, tables, highlights, links, images, dividers; slash menu |
| Markdown shortcuts | `#`, `-`, `1.`, `[ ]`, `>`, ```` ``` ````, `---`, `**`, `*`, `~~`, `` ` ``, `==` |
| Tags | Add or remove tags per note; filter by tag in the sidebar |
| Shortcuts / pins | Pin notes to a Shortcuts section at the top of the sidebar |
| Search palette | ⌘K / Ctrl K searches titles and full text across all notes, plus quick actions |
| Templates | 7 starters: meeting, journal, to-do, project plan, weekly review, reading notes, bug report |
| Trash | Soft delete, restore, delete forever, empty trash |
| Export / import | Single note to Markdown; full JSON backup and restore |
| Focus mode | Hides sidebar and list; page only |
| Dark mode | System default with manual override |
| Mobile layout | Single-column stacked navigation for phones; touch-friendly targets |
| Offline / local-first | All data in browser storage; works without network after first load |
| Cross-tab sync | Edits in one tab appear in other open tabs of the same browser |
| First launch | Seeded "Getting started" and "Personal" notebooks with a guided welcome note |

## 6. Out of scope for v1

- Accounts, sign-in and cloud sync across devices
- Sharing, collaboration and comments
- Web clipper and browser extension
- Reminders and notifications
- Version history beyond undo
- File attachments other than images; PDF or audio notes
- Native mobile or desktop apps
- AI features (summaries, auto-tagging)
- Paid plans

## 7. v2 roadmap

| Priority | Feature | Notes |
|---|---|---|
| P0 | **Cloud sync** | Supabase free tier (Postgres + Row Level Security). Local-first stays the source of truth; sync is a background merge using last-write-wins per note, with conflicts kept as copies. |
| P0 | **Magic-link sign-in** | Email link only, no passwords. Optional: the app keeps working fully without it. |
| P1 | **Public read-only links** | Publish a note to a short URL on getsudo.in; revoke at any time. |
| P1 | **Version history** | Snapshot on meaningful edits; view and restore the last 30 days. |
| P2 | **Web clipper** | Save a page, selection or link into a chosen notebook. |
| P2 | **Reminders** | Date on a note or task; browser notification and a Due view. |

Sequencing: sync and sign-in ship together. Sharing depends on sync. Clipper and reminders follow once retention data justifies them.

## 8. Success metrics

**North star:** weekly active writers (users who create or edit at least one note in a week).

| Metric | v1 target (first 90 days) |
|---|---|
| Time to first keystroke on first visit | under 2 s on a mid-range phone, 4G |
| Day-7 retention (returned and edited) | 25% or more |
| Notes created per weekly active writer | 5 or more |
| Users who try search palette in week one | 40% or more |
| Notes started from a template | 15% or more of new notes |
| Backups exported (proxy for trust) | 10% or more of users by day 30 |
| Data-loss reports | zero |

Measurement uses privacy-respecting, cookie-free page analytics plus anonymous, opt-out event counts. No note content ever leaves the device in v1.

## 9. Risks

- **Browser storage can be cleared.** Mitigate with backup reminders and, in v2, cloud sync.
- **Storage limits with many images.** Compress images on insert; warn near quota.
- **Feature creep.** Every addition must pass the "quiet by default" principle.
