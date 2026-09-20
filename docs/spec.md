# scip-atlas-web spec

Fully local SPA. Not an indexer. Not git. Not LLM. Not a Node/Python server.

Sibling: [scip-atlas](https://github.com/flesler/scip-atlas) writes `atlas.db` and `index.slim.db`. [scip-cli](https://github.com/flesler/scip-cli) writes full `index.db`.

Users open **one HTML file**, drop SQLite DBs, explore. DBs never leave the machine.

## Product

Accordion tree + FTS + file panel (defined symbols, **deps**, **rdeps**). Click a path to jump (expand ancestors + select). Same for search hits.

## Stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript under `src/**/*.ts` |
| SQL | `@sqlite.org/sqlite-wasm` from npm (FTS5 required) |
| UI | SPA, CSS in the repo (no UI CDN) |
| Runtime | Browser only. Queries in a **Worker** |
| Ship | **Single HTML** — all JS, CSS, and WASM inlined |

Do not add `serve` to scip-atlas. Do not ship a Node API.

### Build (required)

- Bundler (Vite or equivalent) + plugin that emits **one** `index.html`.
- Minify, tree-shake, inline JS and CSS into that HTML.
- Inline SQLite **wasm** as a data URL / base64 (or equivalent). **NEVER** `fetch()` wasm/js/css from npm, unpkg, jsDelivr, or GitHub at runtime.
- No extra `.js` / `.wasm` / `.css` next to the HTML on GitHub Pages.
- `file://` must work: no COOP/COEP, no OPFS requirement for v1. Open DBs from `ArrayBuffer` in memory (MemVFS / oo1 from bytes).

Dev may use a local Vite server. Production and GitHub Pages serve only the built HTML.

### Hosting

GitHub Pages = the online copy of that HTML. After the page load, **no outbound HTTP**: no analytics, no fonts CDNs, no telemetry, no update checks.

Fonts: system UI stack only.

### Download itself

Toolbar **Download** control (icon + accessible name “Download this app”). Saves the **original built HTML** (not a DOM snapshot after the user opened DBs).

- `https:` / `http:` — `fetch(location.href)` as blob, same-origin, then `<a download="scip-atlas-web.html">`.
- `file:` — `fetch` of self often fails; embed the built source at compile time (e.g. `import.meta` asset / string constant of the HTML) or reconstruct from the inlined document **before** mutating the DOM. The saved file must be a working copy of the app (empty explorer, no user DB bytes).

Saved HTML is usable fully offline.

## Inputs

No CLI flags. No default cache path (the browser cannot read `~/.cache`).

| Input | File |
| --- | --- |
| Required | `index.slim.db` (or a bundle that contains slim tables) |
| Required | `atlas.db` (or the same bundle) |

UX: drag-and-drop zone and file picker. Accept two files, or one file if a later atlas bundle exists.

Open both in one connection: `ATTACH` the second DB. Join atlas on **path strings**, never SCIP integer ids (ids reshuffle on reindex).

Reject **full** `index.db` when `chunks` has `occurrences` (source). Message: use `scip-atlas index slim`. If `mentions` is missing: “rebuild slim” on deps/rdeps — do not show empty lists as “no importers.”

Refuse leftover `-wal` / `-shm` as the chosen file; ask for a checkpointed copy (`scip-atlas sync` already checkpoints `atlas.db`).

Large files: progress on read; fail clearly if WASM heap cannot hold them. v1 is in-memory only.

## UI

### Accordion tree

Lazy: children of one parent, not the whole repo.

- Roots: atlas `dirs` where `parent_path IS NULL` (repo root `relative_path = ''`) plus top-level dirs (`parent_path = ''`).
- Expand a dir: child dirs (`dirs.parent_path = ?`) and **direct** files (atlas `files` has no `parent_path` — dirname of `relative_path`).
- Each node: basename, last git author/date/subject, summary if present.

Empty state until DBs are loaded. Persist last-opened DB **names** in `localStorage` only (not file bytes).

### File panel

Selecting a file:

1. Overlay: summary, last commit, author
2. **Defined symbols** — names + start line from slim `defn_enclosing_ranges` (SCIP defs, not the TS `export` keyword)
3. **deps** — other indexed files this file references
4. **rdeps** — other indexed files that reference this file’s defined symbols

Click a path → navigate. Optional later: per-symbol deps like `scip-cli deps Symbol`.

### Search

Box → atlas FTS5 `search_docs_fts`. Names/paths first, summaries second. No embeddings.

### Chrome

- Load DBs
- Search
- **Download this HTML** (always visible, even before DBs)

No login. No settings that call the network.

## Query surface (in-process, not HTTP)

Same shapes as a former REST sketch — **functions in the worker**, not `GET`:

```text
tree(parent)     → roots / children (dirs + files)
node(path)       → overlay + symbols + deps + rdeps
search(q)        → FTS hits
health()         → which DBs loaded, table presence, sizes
```

Lazy tree. `node` is the jump target.

## SQL (slim + atlas)

`mentions.role != 1` is a reference (role 1 = definition). Same as scip-cli `deps` / `rdeps`.

Prefix table names with the attached schema if both files are open (`slim.documents`, `atlas.files`, …). If one bundled DB, no prefix.

Defined symbols in a file:

```sql
SELECT gs.display_name, gs.symbol, der.start_line, der.end_line
FROM global_symbols gs
JOIN defn_enclosing_ranges der ON der.symbol_id = gs.id
JOIN documents d ON der.document_id = d.id
WHERE d.relative_path = ?
  AND gs.symbol NOT LIKE '%/'
ORDER BY der.start_line, gs.symbol
```

**rdeps** (importers of this file):

```sql
SELECT DISTINCT d.relative_path
FROM mentions m
JOIN chunks c ON m.chunk_id = c.id
JOIN documents d ON c.document_id = d.id
JOIN defn_enclosing_ranges der ON der.symbol_id = m.symbol_id
JOIN documents def_d ON der.document_id = def_d.id
WHERE m.role != 1
  AND def_d.relative_path = ?
  AND d.relative_path != ?
ORDER BY d.relative_path
```

**deps** (files this file uses):

```sql
SELECT DISTINCT def_d.relative_path
FROM mentions m
JOIN chunks c ON m.chunk_id = c.id
JOIN global_symbols gs ON m.symbol_id = gs.id
JOIN defn_enclosing_ranges der ON der.symbol_id = gs.id
JOIN documents def_d ON der.document_id = def_d.id
WHERE c.document_id = (SELECT id FROM documents WHERE relative_path = ?)
  AND m.role != 1
  AND def_d.relative_path != ?
ORDER BY def_d.relative_path
```

Direct files under dir `src` (atlas, no `parent_path` on files):

```sql
SELECT relative_path, author_name, commit_time, subject, summary
FROM files
WHERE relative_path LIKE 'src/%'
  AND instr(substr(relative_path, 5), '/') = 0
ORDER BY relative_path
```

Root files: `instr(relative_path, '/') = 0`.

Child dirs: `SELECT … FROM dirs WHERE parent_path = ?`.

Search:

```sql
SELECT path, kind, name, summary
FROM search_docs_fts
WHERE search_docs_fts MATCH ?
LIMIT 50
```

## Slim contract

`scip-atlas index slim` **keeps** `mentions` and chunk location columns. It **drops** `chunks.occurrences`. v1 does not show source snippets.

## SCIP gaps

Empty deps/rdeps is often a SCIP miss (`require()`, named imports, barrels), not proof unused. Show the lists; do not label “dead” in v1.

## Privacy / local-only (hard)

- **NEVER** `fetch`/`XHR`/`sendBeacon`/`WebSocket` except: (1) GitHub Pages serving this HTML, (2) `fetch(location.href)` for the Download button on http(s).
- **NEVER** upload DBs. `File` → `arrayBuffer()` in-page only.
- **NEVER** persist DB bytes to `localStorage` / IndexedDB / OPFS in v1 (memory is enough; OPFS would need headers `file://` lacks).
- Service worker: **no**. It is extra network/cache surface and breaks `file://`.

## Non-goals (v1)

- Reindex, sync, summarize
- Source snippets / blame
- Embeddings / Q&A
- Auth, accounts, share links of DBs
- Editing the DBs
- Node/Python backend
- Multi-file GitHub Pages deploy (`app.js`, `sqlite3.wasm` beside HTML)

## Later

- Atlas `bundle` command → one `.db` to drop
- Embed **summaries** only (RAG), invalidate with atlas hashes
- OPFS when not on `file://`
