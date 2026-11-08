# Stackpad

**Notes, stacked and searchable.** A calm, fast notebook for the web: notebooks, rich pages, checklists, tags and instant search. Free, private and offline-first, with no sign-up.

## Features

- **Notebooks and pages:** organise notes into notebooks, star them into Shortcuts, and group them across notebooks with tags.
- **Rich editor (TipTap):** headings, lists, checklists, quotes, code blocks, tables, highlights, links and images (paste or drop).
- **Slash menu:** type `/` on any line to insert a block. Markdown shortcuts (`#`, `- [ ]`, `>`, ```` ``` ````, `==hl==`) work as you type.
- **Search everything:** ⌘K / Ctrl K finds notes, notebooks, tags and actions.
- **Templates:** meeting notes, daily journal, to-do list, project plan, weekly review, reading notes and bug report.
- **Trash with undo**, focus mode, dark mode and a one-pane-at-a-time layout on phones.
- **Local-first:** notes are stored in IndexedDB, keep working offline, and sync live across open tabs.
- **Import and export:** Markdown, HTML and full JSON backup.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

The output in `dist/` is a static site, so any static host works (Vercel, Netlify, Cloudflare Pages).

## Structure

| File | Role |
|---|---|
| `src/main.js` | App shell: layout, navigation, list, palette, menus, autosave |
| `src/editor.js` | TipTap editor, toolbar, slash menu, link popover |
| `src/store.js` | IndexedDB persistence, memory fallback, cross-tab sync |
| `src/io.js` | Markdown/HTML conversion, backups, image compression |
| `src/templates.js`, `src/seed.js` | Templates and first-run content |
| `src/styles/` | Design tokens, page typography, editor UI, app shell |
| `docs/PRD.md`, `docs/DESIGN.md` | Product requirements and design system |

## Roadmap

Cloud sync with magic-link sign-in, public read-only share links, version history, a web clipper and reminders. See `docs/PRD.md`.
