---
name: layout
description: Read when changing layout, panels, or load-screen UI.
---

# Layout

Owner: `src/main.ts` (`syncExplorerLayout`, `syncLoadChrome`, `syncShortcutsPanel`), `src/styles.css`, `src/shortcuts-panel.ts`.

`#app` = toolbar + `.layout`. Breakpoint: `@media (max-width: 900px)` only — NEVER use `max-height` media queries for layout; they fire on short desktop windows.

## Modes (classes on `.layout`)

| Class | When | Effect |
| --- | --- | --- |
| `layout--awaiting-db` | `!state.loaded` | Single column; hide `.panel` / `.detail`; show load screen |
| `layout--tree-only` | Explorer, no detail (or search, or mobile overlay) | One column; hide detail unless overlay |
| `layout--detail-open` | Explorer + file detail, **desktop only** | Side-by-side tree + detail |
| `layout--detail-overlay` | Mobile file detail | Tree full height; detail is fixed sheet |
| `layout--db` | DB view | `fit-content` table list + detail |

Toggle in `syncExplorerLayout()` only. Panel open/close via `syncPanelForEntry` / `hideDetailPanel` — not arrow handlers (see `keyboard` skill).

## Mobile detail (≤900px, explorer, file open)

Use **fixed overlay sheet**, not stacked scroll. Stacked scroll + `scrollIntoView` fought keyboard focus (`focusListingPath` scrolls tree rows).

- `isStackedExplorerLayout()` → `matchMedia("(max-width: 900px)")` + explorer
- `isMobileDetailOverlay()` → stacked + `detailPath` + `!searchActive`
- Mobile: keep `layout--tree-only`, add `layout--detail-overlay` + `detail--overlay` on `#detail-panel`
- CSS: `.detail.detail--overlay` fixed below toolbar (`top: var(--app-toolbar-height)`), `z-index: 50`, scrolls inside sheet
- `syncToolbarHeight()` sets `--app-toolbar-height` from `.toolbar.offsetHeight` on every `syncExplorerLayout`
- `layout--tree-only .detail:not(.detail--overlay)` hides detail; overlay exception required
- `layout--detail-overlay .panel { overflow: hidden }` — tree does not scroll behind sheet
- `focusEntry` file on mobile: `focusListingPath(..., { preventScroll: true })`; no page/detail scroll juggling
- Desktop file open: `layout--detail-open`, `detailPanel.scrollTo({ top: 0 })`

NEVER reintroduce `app--stacked-detail` or layout-level scroll for mobile detail.
NEVER use `scrollIntoView` to reveal mobile detail — overlay replaces that.

## Load screen (no DB)

- Upload + shortcuts inline in `#load-screen` (shortcuts mounted via `mountShortcutsInline`)
- `justify-content: flex-start` + `overflow-y: auto` — upload stays at top, shortcuts grow down
- NEVER vertically center load screen content (upload must not scroll off-screen)
- Mobile shortcuts: full width, single-column `dl`; desktop keeps two-column grid

## Toolbar chrome

- **GitHub** (`#github-link`): toolbar icon after Download; `currentColor` SVG; always visible
- **Download**: `#download-btn` has `margin-left: auto`

## Shortcuts panel

| Phase | UI |
| --- | --- |
| Pre-load | Inline in load screen |
| Post-load | `?` key toggles overlay; `?` fab bottom-right |

Fab (`mountShortcutsFab`): hidden until DB loaded. Hover → overlay preview (`shortcutsHover`, `shortcuts-overlay--preview` with `pointer-events: none`). Click → pin (`shortcutsOpen`). Fab `z-index: 101` above overlay (`100`) so hover is not stolen. Close: Esc, `?`, backdrop, ×, unpin click.

`syncShortcutsPanel`: inline hidden when `loaded || overlayOpen`; overlay only when `loaded`.

Mobile overlay/dialog: `align-items: flex-start` + scroll (≤900px) — not vertically centered (clips on short viewports).

## When changing behavior

- Class toggles live in `syncExplorerLayout` / `syncLoadChrome` / `syncShortcutsPanel` — keep one source of truth
- Mobile layout changes: `max-width: 900px` block in `styles.css` only
- Detail panel needs `background: var(--panel)` (transparent detail caused bleed/gap bugs)
- Z-index stack: shortcuts overlay 100, fab 101, mobile detail sheet 50
