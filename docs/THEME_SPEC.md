# Stackpad theme spec: "Aloe"

Status: design spec, ready to implement. Replaces the "warm paper + amber / green" look described in `docs/DESIGN.md`. When this ships, update DESIGN.md to match.

---

## 1. Concept

**Aloe** is Stackpad redone in the Pixel / Material 3 Expressive style. It takes its tonal colour from Stackpad's own green, so the brand carries over. It should feel like a calm Pixel app, something like Recorder or Keep on a Pixel 10:

- **Tonal, not grey.** Every neutral has a faint green tint, so surfaces read as one family. Hierarchy comes from tone steps (container-low, container, container-high) rather than borders and shadows.
- **Big soft shapes.** Buttons are pills, cards are 20–28px, and the active nav item is a full pill. Shapes **morph** on press and selection: a pill squares off slightly when pressed, and a list card rounds out when selected.
- **Confident type.** Google Sans Flex with big, tight display sizes for the greeting and note titles, and quiet 14px UI text everywhere else.
- **Springy, but only in space.** Things that move or change shape (pills, cards, FAB, checkbox) use a spring. Text and opacity never bounce.
- **Restraint.** Solid surfaces only, no gradients, no glass, no emojis and no decorative blocks. Accent green appears **only on things you can tap** (plus selection and focus states of tappable things).

Gen Z elegant here comes from the shapes and type: big radii, oversized display type, a mint pill on the active item. It does not come from more colour.

### Directions considered

| Direction | Why rejected |
|---|---|
| **Iris** (periwinkle/lilac seed, the stock Material You look) | The most "Pixel default" option. It throws away Stackpad's established green (favicon, brand), and lilac UI next to yellow highlights looks generic. |
| **Obsidian + Lemongrass** (dark-first, near-black chrome with an electric lime accent, Pixel 10 Pro style) | Very trendy, but lime fails AA as text on light surfaces. It would need two different accents per theme and reads loud rather than elegant in a writing app. |
| **Aloe** (chosen) | Keeps the brand green as the tonal seed. Mint containers give the Pixel signature, and the deep jade text passes AA comfortably in both themes. |

---

## 2. Tokens

Drop-in replacement for the two theme blocks in `src/styles/tokens.css`. Every existing variable name is kept. New tokens are marked **NEW**.

### 2.1 Light

```css
:root,
:root[data-theme="light"] {
  color-scheme: light;

  /* surfaces: tonal steps, green-tinted neutrals */
  --bg:          #F8FAF6;  /* surface: editor page, app background */
  --bg-2:        #EEF3EC;  /* surface-container-low: sidebar, home canvas, table headers */
  --surface:     #FFFFFF;  /* surface-container-lowest: note list, cards, menus, dialogs */
  --surface-2:   #E7EDE5;  /* surface-container-high: hover, search pill, inputs */
  --surface-3:   #DCE5DA;  /* surface-container-highest: pressed */
  --line:        #E1E6DE;  /* hairline dividers (decorative) */
  --line-2:      #C3CCC1;  /* outline-variant: chip borders, table borders, scrollbar */
  --outline:     #727970;  /* NEW: borders of interactive inputs/checkboxes (>=3:1) */

  --text:        #191C1A;  /* on-surface */
  --text-2:      #414942;  /* on-surface-variant */
  --text-3:      #5F675F;  /* meta, placeholders: now AA (5.6:1), was 3.4:1 */

  --accent:      #146C43;  /* primary: filled buttons, checkbox fill, focus ring, carets */
  --accent-ink:  #FFFFFF;  /* on-primary */
  --accent-soft: #DDF3E3;  /* subtle primary tint: selected list card, ::selection, focus glow */
  --accent-text: #0E6A40;  /* links, active icons, text buttons */
  --accent-container:    #B9F0CD;  /* NEW primary-container: FAB/"New note", active nav pill, tonal buttons */
  --on-accent-container: #00522F;  /* NEW text/icons on --accent-container */

  --ink:         #191C1A;  /* inverse-surface: toasts, tooltips */
  --ink-text:    #F8FAF6;  /* inverse-on-surface */
  --ink-accent:  #8FD9AC;  /* NEW inverse-primary: action text inside toasts */

  --danger:      #BA1A1A;
  --danger-ink:  #FFFFFF;  /* NEW text on --danger fills (replaces hard-coded #fff) */
  --danger-soft: #FFDAD6;
  --ok:          #1E7A4C;  /* saved / synced dot */
  --star:        #9A6700;  /* NEW pin/star glyph + "saving" dot (replaces hard-coded #E3A33B) */

  --hl:          #FFE38A;  /* <mark> highlight, search match */

  --scrim:       rgba(25, 28, 26, 0.32);  /* NEW modal backdrop, solid, never blurred */

  /* elevation: only for things that float above content */
  --shadow-sm: 0 1px 2px rgba(25, 28, 26, 0.06);
  --shadow-md: 0 2px 6px rgba(25, 28, 26, 0.06), 0 8px 24px -6px rgba(25, 28, 26, 0.12);
  --shadow-lg: 0 4px 12px rgba(25, 28, 26, 0.06), 0 24px 56px -12px rgba(25, 28, 26, 0.20);
}
```

### 2.2 Dark

```css
:root[data-theme="dark"] {
  color-scheme: dark;

  --bg:          #101411;
  --bg-2:        #171C18;
  --surface:     #1C211D;
  --surface-2:   #252B26;
  --surface-3:   #2F3630;
  --line:        #262C27;
  --line-2:      #3F4740;
  --outline:     #8A938A;

  --text:        #E1E4DF;
  --text-2:      #BEC8BE;
  --text-3:      #97A198;

  --accent:      #8FD9AC;  /* tone 80: dark text on it */
  --accent-ink:  #00391F;
  --accent-soft: #18392A;
  --accent-text: #8FD9AC;
  --accent-container:    #0F5132;
  --on-accent-container: #B9F0CD;

  --ink:         #E1E4DF;
  --ink-text:    #101411;
  --ink-accent:  #146C43;

  --danger:      #FFB4AB;
  --danger-ink:  #690005;
  --danger-soft: #4A1712;
  --ok:          #7DD8A0;
  --star:        #F2C14E;

  --hl:          #5A4A06;

  --scrim:       rgba(0, 0, 0, 0.56);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.40);
  --shadow-md: 0 0 0 1px rgba(255, 255, 255, 0.04), 0 8px 24px -6px rgba(0, 0, 0, 0.60);
  --shadow-lg: 0 0 0 1px rgba(255, 255, 255, 0.05), 0 28px 64px -12px rgba(0, 0, 0, 0.72);
}
```

In dark mode, elevation comes from tone (surface-2 and surface-3 sit "higher"). Shadows only separate floating layers.

### 2.3 Theme-independent tokens (`:root`)

```css
:root {
  /* shape */
  --radius-xs:   6px;    /* NEW inline code, <mark>, kbd, checkbox */
  --radius-sm:   12px;   /* was 6: menu items, inputs inside popovers, toolbar block button, thumbnails */
  --radius:      20px;   /* was 10: list cards, code blocks, images, popovers, menus, recent cards */
  --radius-lg:   28px;   /* was 14: dialogs, home widgets, palette, sheet */
  --radius-full: 999px;  /* NEW pills: buttons, nav pill, search, chips, icon buttons, FAB */
  --radius-press: 12px;  /* NEW the radius a pill morphs to while pressed */

  /* type */
  --font-sans:  "Google Sans Flex", "Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-serif: "New York", "Iowan Old Style", Charter, Georgia, serif;  /* unchanged, optional note style only */
  --font-mono:  "Google Sans Code", ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  /* motion: standard curves */
  --ease:       cubic-bezier(0.2, 0, 0, 1);       /* M3 emphasized: default for everything (replaces soft ease-out) */
  --ease-io:    cubic-bezier(0.65, 0, 0.35, 1);   /* unchanged */
  --ease-in:    cubic-bezier(0.3, 0, 0.8, 0.15);  /* NEW exits (menus closing, toasts out) */
  --ease-out:   cubic-bezier(0.05, 0.7, 0.1, 1);  /* NEW entrances (menus opening, dialogs) */

  /* motion: springs (CSS linear(), generated from a damped spring) */
  /* fast spatial: damping 0.8, ~1.5% overshoot, settles ~330ms. Default for spatial moves */
  --spring: linear(0, 0.039, 0.132, 0.252, 0.38, 0.504, 0.615, 0.712, 0.792, 0.857, 0.907, 0.944, 0.971, 0.99, 1.003, 1.01, 1.014, 1.015, 1.015, 1.014, 1.012, 1.01, 1.008, 1.006, 1.005, 1.003, 1.002, 1.002, 1);
  /* expressive: damping 0.6, ~9.5% overshoot, settles ~510ms. Only for FAB, checkbox tick, nav pill */
  --spring-bouncy: linear(0, 0.057, 0.194, 0.367, 0.547, 0.711, 0.847, 0.952, 1.025, 1.069, 1.09, 1.095, 1.087, 1.073, 1.057, 1.04, 1.025, 1.012, 1.003, 0.997, 0.993, 0.991, 0.991, 0.992, 0.993, 0.995, 0.997, 0.998, 1);

  --dur-1: 120ms;   /* colour / hover */
  --dur-2: 220ms;   /* popovers, fades */
  --dur-3: 340ms;   /* --spring moves, pane transitions */
  --dur-4: 500ms;   /* NEW --spring-bouncy moves */

  /* spacing: unchanged 4px scale */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px; --s-12: 48px; --s-16: 64px;
}

@supports not (transition-timing-function: linear(0, 1)) {
  :root { --spring: var(--ease); --spring-bouncy: var(--ease); }
}
```

### 2.4 Removing hard-coded colours

These literals in `app.css` must become tokens, or the theme leaks:

| Where | Now | Becomes |
|---|---|---|
| `.save-state[data-state='saving']::before`, `#pinBtn.is-active svg`, `.card-pin` | `#E3A33B` | `var(--star)` |
| `.acc-text small.sync-synced i` | `#3DDC84` | `var(--ok)` |
| `.acc-text small.sync-syncing i` | `#E3A33B` | `var(--star)` |
| `.acc-text small.sync-error i` | `#F07A66` | `var(--danger)` |
| `.btn-danger` | `color:#fff` | `color: var(--danger-ink)` |
| `.home-hero` | green `linear-gradient` | removed (see 7.6) |
| `.sidebar .brand` | `color:#fff` | `var(--text)` |
| `.modal-backdrop, .palette-backdrop` | `rgba(15,13,10,.38)` | `var(--scrim)` |
| `index.html` `theme-color` | `#FDFCFA` / `#161513` | `#F8FAF6` / `#101411` |
| `public/favicon.svg` | `#13874A` tile | `#146C43` tile, `rx="10"` (rounder squircle) |
| `.prose` checkbox tick SVG | stroke `%23FFFFFF` | keep for light; add a dark-theme override with stroke `%2300391F` (tick sits on mint in dark) |

**Delete** the whole `/* ===== Stackpad: dark sidebar (Evernote-style chrome) ===== */` block. Its useful lines (`.btn-primary` using accent, the tags rule) are folded into the component rules below. Aloe uses a tonal light sidebar, the Pixel nav-drawer pattern. See 7.1 for the optional "keep dark sidebar" variant.

---

## 3. Contrast (WCAG 2.x, computed)

AA needs 4.5:1 for body text and 3:1 for large text, UI component boundaries and meaningful icons.

| Pair | Light | Dark | Use |
|---|---|---|---|
| `--text` on `--bg` | 16.36 | 14.48 | Note body |
| `--text` on `--surface` | 17.18 | 12.74 | List, menus |
| `--text` on `--bg-2` | 15.27 | 13.46 | Sidebar |
| `--text-2` on `--bg` / `--surface` | 8.86 / 9.31 | 10.79 / 9.49 | Snippets, secondary |
| `--text-3` on `--bg` | 5.57 | 6.96 | Meta, placeholders |
| `--text-3` on `--bg-2` | 5.20 | 6.47 | Sidebar counts |
| `--text-3` on `--surface-2` | 4.91 | 5.42 | Meta on hover rows |
| `--text-3` on `--surface-3` | 4.53 | 4.65 | Meta on pressed rows |
| `--text-3` on `--accent-soft` | 5.01 | 4.75 | Meta in selected card |
| `--text` on `--accent-soft` | 14.73 | 9.87 | Selected card title |
| `--accent-text` on `--bg` | 6.34 | 11.23 | Links |
| `--accent-text` on `--surface` | 6.66 | 9.88 | Text buttons in widgets |
| `--accent-text` on `--accent-soft` | 5.71 | 7.66 | Active toolbar button icon |
| `--accent-ink` on `--accent` | 6.45 | 7.91 | Primary button label |
| `--on-accent-container` on `--accent-container` | 7.30 | 7.31 | FAB, active nav pill |
| `--ink-text` on `--ink` | 16.36 | 14.48 | Toast |
| `--ink-accent` on `--ink` | 10.38 | 5.03 | Toast action |
| `--text` on `--hl` | 13.59 | 6.77 | Highlighted text |
| `--danger` on `--surface` | 6.46 | 9.63 | Destructive menu item |
| `--danger-ink` on `--danger` | 6.46 | 7.72 | Delete button |
| `--text` on `--danger-soft` | 13.30 | 11.50 | Trash banner |
| `--outline` on `--bg` / `--surface-2` | 4.27 / 3.77 | 5.86 | Checkbox and input borders (non-text, needs 3:1) |
| `--star` on `--surface` | 4.87 | 9.74 | Pin glyph (non-text, needs 3:1) |
| `--star` on `--accent-soft` | 4.17 | 7.55 | Pin on selected card |

`--line` and `--line-2` are decorative dividers (1.3–1.9:1). They never form the only boundary of an interactive control. Inputs use a tonal fill plus `--outline`, or a fill alone with a focus ring.

---

## 4. Typography

**Font: Google Sans Flex** (on Google Fonts, OFL; verified it serves `wght 400..800`, `opsz 6..144` and `ROND 0..100`). It is the actual Pixel / Material 3 Expressive typeface, so it is the most direct link to the brief. Its optical-size axis lets one family cover 12px meta through 44px display without looking blunt, and the `ROND` (roundness) axis lets display type pick up the soft Pixel character. **Fallback: Figtree**, the closest free geometric grotesque with similar warmth and x-height. Code uses **Google Sans Code** (same family).

Add to `<head>` in `index.html`, before the theme script:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:wght@400..600&family=Google+Sans+Flex:opsz,wght,ROND@6..144,400..800,0..100&display=swap">
```

Base: `body { font: 400 14px/1.5 var(--font-sans); font-optical-sizing: auto; }`. Drop the `-apple-system`-first ordering.

| Role | Size / line | Weight | Tracking | Extras | Where |
|---|---|---|---|---|---|
| Display | 44 / 48px (mobile 34/40) | 700 | -0.03em | `font-variation-settings: "ROND" 100` | Home greeting |
| Headline | 36 / 1.15 (mobile 30) | 700 | -0.028em | `"ROND" 60` | Note title (`.title`) |
| Title L | 22 / 28px (mobile 26) | 650 | -0.015em | | List heading `h2` |
| Title M | 20 / 26px | 650 | -0.01em | | Dialog `h3`, palette empty |
| Title S | 15 / 20px | 600 | -0.005em | | List card title, recent card title |
| Body L | 17 / 1.7 | 400 | -0.003em | | `.prose` (was 16.5) |
| Body M | 14 / 20px | 400 | 0 | | UI default, menu items, snippets 13.5 |
| Label L | 14 / 20px | 600 | 0.005em | | Buttons, nav active |
| Label M | 13 / 18px | 600 | 0.005em | **sentence case** | Section headers (`.nav-section`, `.widget-head h2`, `.pal-section`, `.slash-label`, `.menu-header`) |
| Meta | 12 / 16px | 500 | 0.01em | `tabular-nums` | Dates, counts, footer |

Rule: **no more ALL-CAPS tracked labels.** Pixel uses sentence-case labels at weight 600 in `--text-2`. Remove `text-transform: uppercase` and `letter-spacing: .04–.06em` everywhere.

Prose headings: h1 1.9em/700/-0.025em, h2 1.45em/650/-0.018em, h3 1.18em/650/-0.01em, all with `"ROND" 40`. Strong = 650.

---

## 5. Shape

| Element | Radius |
|---|---|
| Buttons (primary, quiet, danger, link-btn, new note, toast actions) | `--radius-full` |
| Icon buttons, toolbar buttons, mini/foot buttons | `--radius-full` (circles) |
| Nav item | `--radius-full` |
| Search trigger, tag chips, `.chip`, modal input | `--radius-full` |
| Menu item, slash item, palette item, toolbar block dropdown | `--radius-sm` (12) |
| Menus, popovers, slash menu, link popover | `--radius` (20) |
| List cards (grouped, see 7.2) | outer 20 / inner 6, selected 20 |
| Recent cards, code blocks, images, trash banner | `--radius` (20; images 16 inside prose via `calc(var(--radius) - 4px)`) |
| Dialogs, palette, home widgets | `--radius-lg` (28) |
| Checkbox, kbd, inline code, mark | `--radius-xs` (6; mark 4) |

**Shape morph on press** (the M3 Expressive signature). Pill buttons and the FAB animate `border-radius` from `--radius-full` to `--radius-press` on `:active`, spring back on release, and scale to 0.97:

```css
.btn-primary, .btn-quiet, .btn-danger, .btn-new, .home-new {
  transition: border-radius var(--dur-3) var(--spring), transform var(--dur-3) var(--spring),
              background-color var(--dur-1) var(--ease);
}
.btn-primary:active, .btn-quiet:active, .btn-danger:active, .btn-new:active, .home-new:active {
  border-radius: var(--radius-press); transform: scale(.97);
}
```

(`999px` to `12px` interpolates badly because the visible change only starts below half the height. Use `border-radius: calc(var(--h) / 2)` with `--h` set per button, e.g. 40px gives 20px, or set the rest radius to `20px` on 40px buttons. Either way it reads as a full pill.)

Remove `border-radius` from the global `:focus-visible` rule. The outline follows the element's own radius in all modern browsers, and the current rule squares off pills on focus.

---

## 6. Elevation and motion

### Elevation
- **Level 0 (flat, tonal):** sidebar, list, editor, home widgets, list cards, recent cards. No shadow and no border. Separation comes from `--bg-2`, `--bg` and `--surface` tone steps.
- **Level 2 (floating):** menus, popovers, slash menu: `--surface` + `--shadow-md` + 1px `--line` border (keeps a crisp edge on light).
- **Level 3 (modal):** dialogs, palette: `--surface` + `--shadow-lg`, no border in light, the shadow's 1px ring in dark.
- **Toast:** `--ink` + `--shadow-lg`.
- **Remove** `box-shadow: var(--shadow-sm)` from `.widget`. Remove hover lift shadows on cards (use a tonal hover instead, see 7.6).

### Motion

| Interaction | Property | Duration / curve |
|---|---|---|
| Hover / colour changes | background, color | `--dur-1` `--ease` |
| Button / FAB press morph | border-radius, transform | `--dur-3` `--spring` (FAB: `--dur-4` `--spring-bouncy` on release) |
| Nav pill: becoming active | background-color + `::before` pill `transform: scaleX(.6) to 1` | `--dur-4` `--spring-bouncy` |
| List card select | border-radius 6 to 20, background | `--dur-3` `--spring` |
| Checkbox check | tick `transform: scale(.4) to 1`, fill | `--dur-4` `--spring-bouncy` |
| Menus / popovers / slash open | opacity `--dur-2` `--ease-out`; transform `translateY(-4px) scale(.96) to none` | `--dur-3` `--spring` |
| Menus close | opacity + scale(.98) | 120ms `--ease-in` |
| Dialog / palette open | opacity `--dur-2`; `translateY(12px) scale(.96) to none` | `--dur-3` `--spring` |
| Toast in | `translate(-50%, 16px) to (-50%, 0)` | `--dur-3` `--spring` |
| Mobile pane slide | `translateX(24px)` + opacity | `--dur-3` `--spring` |
| Focus mode grid change | grid-template-columns | `--dur-3` `--ease` (no spring on layout) |

Rules:
- Springs only on **transform and border-radius**. Never on opacity, colour or text position inside content.
- Never animate anything in the writing area while typing.
- **Reduced motion:** keep the existing global `prefers-reduced-motion` reset, and add `:root { --spring: var(--ease); --spring-bouncy: var(--ease); }` inside it so any transition that escapes the reset doesn't overshoot. Shape morphs become instant, and opacity fades can stay at 80ms (as in `editor-ui.css`).

---

## 7. Components

### 7.1 Sidebar (`.sidebar`)
- Background `--bg-2`, **no right border** (the tone step is the edge). Padding `16px 12px 12px`. Width stays 248px (1100px breakpoint: 224px).
- **Brand:** 32px logo tile (radius 10, `--accent` fill) + "Stackpad" at 17px/700/-0.02em, `"ROND" 100`, in `--text`. Padding `4px 8px 20px`.
- **New note** (`.btn-new`) is the Pixel extended FAB: height 48px, `--accent-container` fill, `--on-accent-container` label at 15px/600, 20px icon, radius 20px rest / 12px pressed, no shadow at rest. Hover: `background: color-mix(in srgb, var(--on-accent-container) 8%, var(--accent-container))`. `.btn-new-more` is a 48px circle on `--surface-2`, icon `--text-2`.
- **Search trigger:** pill, height 44px, `--surface` fill in light / `--surface-2` in dark, no border, left 20px search icon in `--text-2`, placeholder text `--text-3` 14px, `kbd` at the right with no border, `--text-3`. Hover: `--surface-2` (light) / `--surface-3` (dark). Margin-bottom 16px.
- **Nav items:** height 40px, padding `0 16px`, gap 12px, radius full, 14px `--text-2`, icon 20px `--text-2`.
  - Hover: `--surface-2`.
  - **Active (Pixel nav indicator pill):** background `--accent-container`, label and icon `--on-accent-container`, weight 600. It is a full pill spanning the row. Animate it in with the `--spring-bouncy` scaleX described in 6, using a `::before` layer behind the content so the label doesn't scale.
  - Count: 12px `--text-3`. In the active item use `--on-accent-container` at 0.8 opacity (still 5.8:1).
- **Section headers:** sentence case, 13px/600, `--text-2`, padding `20px 16px 6px`. `.mini-btn`: 28px circle.
- **Footer:** remove the top border. Use 16px of space instead. `.foot-btn` is a 40px circle.
- **Account / sign-in:** `.signin-btn` is a 20px-radius tonal card on `--surface` (light) / `--surface-2` (dark), no border, 12px padding; cloud icon in a 36px `--accent-container` circle with an `--on-accent-container` glyph (it's tappable, so accent is allowed). `.account-btn` is a pill row; the avatar fallback uses `--accent-container` / `--on-accent-container`. Sync dot colours come from tokens (2.4).
- **Optional variant (only if the owner wants to keep the dark Evernote chrome):** in light theme scope `.sidebar { --bg-2:#1C211D; --surface:#252B26; --surface-2:#2F3630; --surface-3:#3A423B; --text:#E1E4DF; --text-2:#BEC8BE; --text-3:#97A198; --accent-container:#0F5132; --on-accent-container:#B9F0CD; }`. Default is the tonal light sidebar.

### 7.2 Note list (`.list`, `.card`), the Android 16 grouped list
- Pane background `--bg-2` (same as the sidebar, so the two read as one chrome plane next to the `--bg` editor). No right border.
- **Head:** padding `20px 16px 12px 24px`, no bottom border. `h2` is Title L. The count line is Meta in `--text-3`. Icon buttons are 40px circles.
- **Body:** padding `0 12px 24px`. Cards sit in a **grouped stack**: each `.card` gets a `--surface` fill and `2px` margin between cards, radius `6px`, with the first card at `20px 20px 6px 6px` and the last at `6px 6px 20px 20px` (`:first-child` / `:last-child`). This replaces the hairline `::before` dividers; delete those rules.
- Card padding `14px 16px`, gap 12px. Title is Title S `--text`; snippet 13.5px/1.45 `--text-2`, 2 lines; meta 12px `--text-3`, top margin 8px.
- Hover: `--surface-2`.
- **Selected (`.is-active`):** background `--accent-soft`, **radius morphs to 20px on all corners**, and the card gets `margin: 6px 0` so it lifts out of the group visually (spring, `--dur-3`). Delete the `inset 3px 0 0 var(--accent)` bar.
- `.chip`: pill, height 20px, padding `0 8px`, `--surface-2` fill, `--text-2`, 11.5px/500. In the selected card: `--surface`.
- Pin glyph: `--star`, filled.
- Thumbnail: 56px, radius `--radius-sm`, no border.
- Empty state: one line Title S + one Body M line + one quiet pill button. No illustration tile.

### 7.3 Editor pane
- Background `--bg`. The header (`.ed-head`) is 56px tall with no divider. Crumb is a pill (height 32, padding `0 12px`), `--text-2`; hover `--surface-2`.
- **Save state:** 12px Meta in `--text-3` with a 6px dot in `--ok` (saved) or `--star` (saving). The dot is a status mark, not accent.
- **Page:** max-width 760, padding `48px 56px 30vh` (1100px: `36px 32px`; mobile: `24px 20px 40vh`).
- **Title:** Headline style, `--text`, placeholder `--text-3` (no extra opacity, it's already AA). Margin-bottom 12px.
- **Tags:** neutral, because tags are labels, not accent: pill height 28, padding `0 6px 0 12px`, `--surface-2` fill, `--text-2` 12.5px/500. The remove `button` is a 20px circle, `--text-3`, hover `--surface-3` + `--text`. Tag input placeholder `--text-3`.
- **Trash banner:** `--danger-soft`, radius `--radius`, padding `12px 16px`, margin `0 24px 12px`. Buttons inside are quiet pills.
- **Footer (`.ed-foot`):** no border-top. 12px Meta `--text-3`, padding `10px 24px`.
- **Empty editor:** remove the bordered `.empty-mark` tile. Show a 40px `--text-3` stroke icon, Title M heading, Body M line in `--text-2`, one primary pill, and the `kbd` hints row. Nothing else.
- **Focus mode:** unchanged behaviour. The page top padding becomes 72px.

### 7.4 Toolbar (`.tb`, `editor-ui.css`)
- Toolbar wrap: drop the `border-bottom`. The toolbar is a **floating-style tonal pill bar in-flow** (not floating and not glass): `.tb` gets background `--bg-2` (light) / `--surface` (dark), radius `--radius-full`, height 48px, padding `0 8px`, margin `0 auto 4px`. Groups gap 2px. `.tb-sep` is 1px x 20px `--line-2`, margin `0 6px`.
- `.tb-btn`: 36px circle, icon 18px `--text-2`. Hover `--surface-2` / `--text`. Pressed `--surface-3`.
- Active (`.is-active`): `--accent-soft` fill, `--accent-text` icon, and the shape morphs from circle to a 12px rounded square (`--dur-3 --spring`). That gives the Pixel "selected toggle" read without more colour.
- Block-type dropdown (`.tb-block`): pill, height 36, `--surface` (light) / `--surface-2` (dark) fill, 13.5px/600 `--text`, chevron `--text-3`.
- `.tb-text` (table row): pill, height 32, no border, `--surface-2` fill, 12.5px/600 `--text-2`. Danger hover: `--danger-soft` / `--danger`.
- Focus ring: same as global (7.10).
- Mobile: the toolbar stays a full-width bar (radius 0, `--bg-2`) above the keyboard. Pills only from 860px up.

### 7.5 Menus, popovers, slash menu, palette, dialogs
- **Menus / `.tb-menu` / `.slash` / `.link-pop`:** `--surface`, radius `--radius` (20), padding 8px, `--shadow-md`, 1px `--line` border. Items: height 40px, radius `--radius-sm` (12), padding `0 12px`, gap 12px, 14px `--text`; icon 18px `--text-2`. Hover / keyboard selection: `--surface-2`. Current item (block menu tick): tick in `--accent-text`, label 600. Danger item: `--danger`. Header label: Label M sentence case `--text-3`. Separator: 1px `--line`, margin `6px 12px`.
- **Slash item icon tile:** 32px, radius 10, `--bg-2` fill, **no border**, icon `--text-2`. On the selected item the tile becomes `--accent-container` / `--on-accent-container` (it is the tappable target).
- **Link popover:** input is a pill (height 40, `--surface-2` fill, no border). Focus: `background: --surface`, `box-shadow: 0 0 0 2px var(--accent)`. Apply button: primary pill, height 40. Remove: 40px circle.
- **Dialogs (`.modal`):** `--surface`, radius 28, padding 28px, width 400 (wide 520), `--shadow-lg`, no border in light. Title Title M; body 14px `--text-2` with 8px top margin. Actions: right-aligned, gap 8, top margin 28. Order: quiet then primary/danger.
- **Modal input:** pill, height 48, padding `0 20px`, `--surface-2` fill, no border, 15px. Focus: `--surface` fill + `box-shadow: 0 0 0 2px var(--accent)`.
- **Scrim:** `var(--scrim)`. No blur.
- **Palette:** radius 28, `--shadow-lg`. Input row: height 64, 17px text, search icon `--text-2`, no divider (the results list starts with 8px of space). Results padding 8. Items radius 12, padding `10px 12px`, selected `--surface-2`. `.pal-ic`: 36px circle, `--bg-2` fill, no border; selected becomes `--accent-container` / `--on-accent-container`. `mark` uses `--hl`.
- **Shortcut rows (`.key-row`):** no dividers. Rows are 36px tall with `kbd` on the right.

### 7.6 Home dashboard
- Canvas `--bg-2`. Inner max-width 1120, padding `48px 40px 72px`.
- **Hero: remove the gradient card entirely.** The greeting sits directly on the canvas: date as Meta-size 14px/500 `--text-2` (not accent), then the Display greeting. On the right, the "New note" **extended FAB** (same spec as `.btn-new`: 56px tall here, `--accent-container`, radius 20, 16px/600 label, `--spring-bouncy` release). Mobile: the greeting wraps to Display-mobile and the FAB goes full width below it. This is the Pixel "At a glance" moment: big type, nothing else.
- **Widgets:** `--surface` fill, radius 28, padding `20px 24px 24px`, **no border, no shadow**. Grid gap 16 (between sections 16).
- **Widget head:** `h2` in Label M sentence case (14px/600 `--text`). Count is Meta `--text-3`. `.link-btn` is a text pill (height 32, padding `0 12px`) in `--accent-text`; hover `--accent-soft`; disabled `--text-3`.
- **Recent cards:** 196 x 220, `--bg-2` fill (tone step inside the white widget), radius 20, padding 16, no border. Hover: `--surface-2` fill and the radius morphs 20 to 24 (`--spring`). **No lift or shadow.** Title is Title S, snippet 13px `--text-2`, meta 12px `--text-3`. Image radius 12.
- **"Create new note" card:** no dashed border. `--accent-soft` fill, `--accent-text` 24px plus icon in a 48px `--accent-container` circle, label 14px/600 `--accent-text`. It's tappable, so accent is correct.
- **Scratch pad:** `--bg-2` fill, radius 20, padding 16, 15px/1.6. Focus: `box-shadow: inset 0 0 0 2px var(--accent)`.
- **Task / pin / notebook rows:** height 44, radius `--radius-full`, padding `0 12px`, hover `--surface-2`. Task box: 20px rounded square (radius 6), 2px `--outline` border (it reads as a control). Icons `--text-2`. Trailing notebook name / count: `--text-3`.
- Empty widget text: 14px `--text-3`, one line.

### 7.7 Buttons

| Variant | Spec |
|---|---|
| **Primary** (`.btn-primary`) | Height 40, padding `0 20px`, pill, `--accent` / `--accent-ink`, 14px/600. Hover: `color-mix(in srgb, var(--accent-ink) 8%, var(--accent))`. Press morph. |
| **Tonal / FAB** (`.btn-new`, `.home-new`) | `--accent-container` / `--on-accent-container`, 48–56px tall, radius 20, 15–16px/600, icon 20–22px. |
| **Quiet** (`.btn-quiet`) | Height 40, pill, `--surface` fill, 1px `--outline` border at 40% (`color-mix(in srgb, var(--outline) 40%, transparent)`), `--text`. Hover `--surface-2`. `.danger` gives a `--danger` label. |
| **Danger** (`.btn-danger`) | `--danger` / `--danger-ink`, pill. |
| **Text** (`.link-btn`, toast action) | No fill. `--accent-text` (toast: `--ink-accent`), 600, pill hover `--accent-soft`. |
| **Icon** (`.icon-btn`) | 40px circle (36 in the toolbar, 28 for mini), `--text-2`. Hover `--surface-2` / `--text`. `.is-active` gives `--accent-text` icon on `--accent-soft`. |

Use `filter: brightness()` hovers nowhere (it shifts hue on tonal colours). Use the `color-mix` state layers above instead. Disabled: 38% opacity, no hover.

### 7.8 Inputs and search
- All text inputs are filled pills on `--surface-2`, with no resting border. Focus: `--surface` fill + 2px `--accent` ring (`box-shadow: 0 0 0 2px var(--accent)`). This replaces the `--accent-soft` 3px glow.
- Placeholder `--text-3`. Caret `--accent` (UI) / `--accent-text` (prose).
- Search pill (sidebar trigger and palette input) is described in 7.1 and 7.5.

### 7.9 Toast
- Pill, `--ink` / `--ink-text`, min-height 48, padding `0 8px 0 20px`, 14px/500, `--shadow-lg`, bottom 24px. The action is a text pill in `--ink-accent`, 600. Enter: `--spring`. Exit: 160ms opacity `--ease-in`.

### 7.10 Focus rings
- Global: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` with **no border-radius** override. In light, `--accent` (6.1:1 on bg) is stronger than `--accent-text`. In dark it's the same mint.
- Inside filled inputs, use the box-shadow ring instead of an outline (7.8).
- Toolbar and menu items: `outline-offset: 1px`.

### 7.11 Scrollbars
- Thin, `--line-2` thumb, transparent track. Thumb radius `--radius-full`, 3px transparent border (unchanged). Hover `--outline`. On `.tb` they stay hidden.

### 7.12 Prose (`prose.css`)
- Body: Body L (17px/1.7) Google Sans Flex. Mobile 17.5px.
- **Links:** `--accent-text`, underline at 1px, `color-mix` 40% (unchanged mechanism). Links are the one accent in running text, which fits the "accent = tappable" rule.
- **Selection (`::selection`):** `--accent-soft`.
- **Highlight (`mark`):** `--hl` (butter yellow, Pixel Keep-like), radius 4, padding `0 3px`. Yellow is deliberately not the accent, because a highlight is not tappable.
- **Inline code:** Google Sans Code 0.88em, `--surface-2` fill, **no border**, radius 6, padding `0.12em 0.4em`.
- **Code block:** `--bg-2` (light) / `--surface` (dark), radius 20, padding `16px 20px`, no border, 14px Google Sans Code / 1.6.
- **Blockquote:** **not accent** (it's not tappable). 4px `--line-2` bar with a rounded end (use `box-shadow: inset 4px 0 0 var(--line-2)` with `border-radius: 4px` on the quote, or a `::before` 4px pill), padding-left 20px, `--text-2`, sans 1.06em/500. Drop the italic serif to keep one voice; serif stays available as the optional note style.
- **hr:** 1px `--line-2`. Selected-node: `--accent` + `--accent-soft` glow (unchanged; it's a selection state).
- **Lists:** markers `--text-3`.
- **Task checkbox:** 20px, radius 6, 2px `--outline` border, `--surface` fill. Checked: `--accent` fill and border, tick in `--accent-ink` (dark-theme tick SVG override per 2.4), tick scale-in with `--spring-bouncy`. Press `scale(.9)`. Checked text: `--text-3` + strikethrough (unchanged).
- **Tables:** wrapper radius 16 with `overflow: hidden` and 1px `--line-2` outer border. Cell borders `--line`. `th` has a `--bg-2` fill, 600 weight. Selected cell `--accent-soft`. Resize handle `--accent`.
- **Images:** radius 16. Selected: 2px `--accent` outline, offset 4px.
- **Placeholder:** `--text-3`.

### 7.13 Mobile (< 860px)
- All tap targets at least 44px: nav items 48, icon buttons 44, list cards at least 72.
- The pane slide uses `--spring` translateX 24px (replaces the 10px fade).
- Home: hero FAB goes full width, 56px.
- Toolbar: square full-width bar (7.4).

---

## 8. Implementation checklist

1. Replace the theme blocks and `:root` block in `tokens.css` (section 2). Update the `:focus-visible` and scrollbar rules.
2. Add the font `<link>` tags and update `theme-color` in `index.html`. Update the favicon fill.
3. In `app.css`: delete the dark-sidebar override block and replace the hard-coded colours (2.4). Then restyle per section 7: sidebar, list grouping, buttons, home hero removal, widgets, menus, modal, palette, toast.
4. In `editor-ui.css`: pill toolbar, circle buttons, active-toggle morph, menu radii, slash tiles, link popover inputs.
5. In `prose.css`: body size, code/blockquote/checkbox/table changes.
6. Remove every `text-transform: uppercase` label style.
7. Check both themes at 1440px, 1024px and 390px. Check that `prefers-reduced-motion` removes overshoot.
8. Update `docs/DESIGN.md` principle 5 ("Never bouncy") to read: "Springs on shape and position only; text and colour never bounce."
