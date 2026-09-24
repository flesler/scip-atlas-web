---
name: keyboard
description: Read when changing explorer or DB view keyboard navigation.
---

# Keyboard

Owner: `src/main.ts` (`document` keydown + `searchInput` keydown), `src/shortcuts-panel.ts`. `PAGE_STEPS = 5`.

**Shortcuts panel:** user-facing keys in `SHORTCUT_SECTIONS`. Chrome (inline vs overlay, `?` fab) → `layout` skill.

**Mobile file detail:** fixed overlay sheet, not side-by-side — see `layout` skill.

## Explorer

| Key | Action |
| --- | --- |
| ↑ / ↓ | Move selection among **siblings** in the visible listing (tree or search results) |
| Page Up / Down | Same, ±`PAGE_STEPS` rows |
| ← | Collapse expanded dir, else go to parent dir, else previous sibling |
| → | Expand dir (or first child if already expanded); files: no-op |
| Esc | Close file detail panel (search input: restore tree via its own handler) |
| a–z | Type-to-search (focuses search, clears tree selection) |
| Ctrl/Cmd+F | Focus search (overrides browser find) |
| ? | Toggle shortcuts panel |

**Boundaries (↑/↓):** at first sibling → parent; past last sibling → parent's next sibling (if any).

**Search:** ↑/↓/Page keys move hits without opening detail. ←/→ in the search box edit text; ←/→ elsewhere follow tree rules (disabled while search results are active). Enter opens first hit. Esc in search restores prior tree state.

**Focus model:** `focusEntry` is the single source of truth — updates selection, expands ancestors, renders, scrolls row. `syncPanelForEntry`: **file** → open right panel; **dir** → hide panel. Do not toggle the panel from individual key handlers.

**Listing source:** `listingRows()` — `.tree-row` in tree mode, `.search-result-row` in search mode.

## DB view

Works **regardless of which panel is focused** (left table list or right detail).

| Key | Action |
| --- | --- |
| ← / → | Previous / next **page of rows** (100 per page) |
| ↑ / ↓ | Previous / next **table** in flattened group order (crosses scip-cli → scip-atlas → other) |

Table changes reset offset to 0 and scroll the selected row into view in the left list. Row paging uses `state.tablePageInfo` from `renderDbDetails`.

Helpers: `flattenInspectTableNames` (`src/inspect.ts`), `DB_TABLE_PAGE_SIZE` (`src/ui-db.ts`).

## When changing behavior

- Keep explorer and DB handlers separate (`viewMode === "db"` branches first).
- NEVER make ↑/↓ descend into children — siblings only; use → for drill-in.
- NEVER tie the detail panel to arrow handlers — only `focusEntry` / `syncPanelForEntry`.
- DB ←/→ are for row pages, not tables; ↑/↓ are for tables, not rows.
- Arrow handlers skip when ctrl/meta/alt held. Explorer arrows also skip editable targets except when focus is in search (so tree keys work from the search box).
