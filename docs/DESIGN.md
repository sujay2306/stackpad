# Stackpad design system

"Notes, stacked and searchable." Warm paper, dark ink, one amber accent. Tokens: `src/styles/tokens.css`; note typography: `src/styles/prose.css`.

## Principles
1. **Writing first.** The page is the product. Chrome recedes; the note gets the space.
2. **Quiet surfaces.** Solid, opaque fills only. No glass, no blur cards, no decorative gradients, no emojis (use SVG icons, 1.5px stroke).
3. **One accent.** Amber marks focus, selection and "done", and nothing else. Text on amber is always dark (`--accent-ink`).
4. **Whitespace is fine.** Don't fill empty states with filler blocks; one line of text and one action is enough.
5. **Calm motion.** Springs on shape and position only; text and colour never bounce.

## Colour tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #FDFCFA | #161513 | Editor page |
| `--bg-2` | #F6F5F1 | #1C1B18 | Sidebar, table headers |
| `--surface` | #FFFFFF | #201F1C | Note list, popovers, modals |
| `--surface-2` | #F1EFEA | #282723 | Hover |
| `--surface-3` | #E9E6DF | #312F2A | Active / pressed |
| `--line` / `--line-2` | #ECE9E3 / #DCD8CF | #2A2925 / #3A3833 | Hairlines / inputs |
| `--text` | #1D1C1A | #ECEAE5 | Primary (16.6 / 15.2:1) |
| `--text-2` | #5E5B55 | #A8A49C | Secondary (6.6 / 7.4:1) |
| `--text-3` | #8C887F | #7D7970 | Meta, placeholders (3.4 / 4.2:1) |
| `--accent` | #E3A33B | #E8AC48 | Fills, checkbox, focus bars |
| `--accent-ink` | #1F1606 | #1F1606 | Text on accent (8.1 / 8.9:1) |
| `--accent-soft` | #FBF0DC | #3A2E17 | Selected rows, chips |
| `--accent-text` | #946000 | #EDB65A | Links, active icons (5.2 / 9.9:1) |
| `--ink` | #1D1C1A | #ECEAE5 | Logo tile, primary button (`--ink-text` on top) |
| `--danger` / `--danger-soft` | #C2412D / #FBEAE6 | #F07A66 / #3A1F1A | Destructive actions |
| `--ok` | #2F7D4F | #6CC28E | Saved, synced |
| `--hl` | #FCE7A6 | #5C4615 | `<mark>` highlight |

Contrast ratios are against `--bg`. Theme is set as `data-theme="light|dark"` on `<html>`; "system" is resolved in JS.

## Type
UI uses `--font-sans` at 14px/1.5. Notes use `--font-sans` at 16.5px/1.7 (17px on mobile); `--font-serif` for blockquotes and an optional serif note style; `--font-mono` for code.
| Role | Size / weight / tracking |
|---|---|
| Note title | 30px / 700 / -0.022em |
| H1 · H2 · H3 | 1.85em · 1.42em · 1.15em, 650–700, -0.022 → -0.01em |
| Body | 16.5px / 400, measure 680–720px (set by the parent) |
| UI label | 13–14px / 500 |
| Meta / caption | 12px / 400, `--text-3` |
| Code | 13.5px mono |

## Spacing, radii, elevation
- 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 (`--s-1` … `--s-16`).
- Radii: `--radius-sm` 6px (buttons, inputs, menu items), `--radius` 10px (cards, code, images), `--radius-lg` 14px (modals, large popovers).
- Shadows: `--shadow-sm` for raised controls, `--shadow-md` for popovers and menus, `--shadow-lg` for modals. Elevation always sits on a solid surface with a `--line` border.

## Motion
`--ease` cubic-bezier(0.22, 1, 0.36, 1). Hover/press 120ms, popovers 200ms (fade + 4px rise), modals and pane transitions 320ms. `prefers-reduced-motion` turns them all off.

## Components
- **Sidebar** (`--bg-2`, 248px): logo, search, notebooks, tags. Rows are 30px tall with a 6px radius. Hover uses `--surface-2`. The active row uses `--surface-3` with `--text`, plus an `--accent-text` icon.
- **Note list** (`--surface`, 320px): cards separated by `--line` hairlines rather than boxed. Each card shows the title (14px/600), a 2-line snippet in `--text-2` and a date in `--text-3`. The selected card gets `--accent-soft`.
- **Editor toolbar**: one quiet row of 32px icon buttons in `--text-2`. Active ones show `--accent-text` on `--accent-soft`. It sticks to the top with a `--line` divider on scroll and never floats as a glass bar.
- **Slash menu**: `--surface`, `--shadow-md`, `--radius`, 280px wide. Items have an icon tile, a label and an optional `--text-3` shortcut. Keyboard focus = `--surface-2`.
- **Popovers / bubble menu**: solid `--surface`, 1px `--line`, `--shadow-md`, 8px padding.
- **Modal**: `--surface`, `--radius-lg`, `--shadow-lg`, max 480px wide. The scrim is rgba(0,0,0,.32), with no blur. The primary button uses `--ink`, a destructive one uses `--danger`.
- **Toasts**: bottom-center, `--ink` fill with `--ink-text`, `--radius`, auto-dismiss after 3s, with one optional text action in `--accent`.
- **Checkbox**: 18px, 5px radius. When checked it fills with `--accent` and shows a dark tick. A checked task's text turns `--text-3` and gets struck through.

## Mobile (< 860px)
Only one pane shows at a time: Sidebar, then List, then Editor. Each pane slides in at 320ms with `--ease`. A back chevron at the top-left returns to the previous pane. Tap targets are at least 44px, and the toolbar scrolls horizontally above the keyboard. Note body is 17px and side padding is 20px.
