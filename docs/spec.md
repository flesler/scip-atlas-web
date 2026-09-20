# scip-atlas-web spec

Fully local SPA + a **Node pack CLI**. Not an indexer. Not git. Not LLM. Not an HTTP API for the UI.

Sibling: [scip-atlas](https://github.com/flesler/scip-atlas) writes `atlas.db` from **full** `index.db`. [scip-cli](https://github.com/flesler/scip-cli) writes that full index (includes source). This repo owns **slim+merge** into one `explorer.db` for the viewer.

Users open **one HTML file**, drop **one** SQLite file, explore. Bytes never leave the machine.

## Product

Accordion tree + FTS + file panel (defined symbols, **deps**, **rdeps**). Click a path to jump (expand ancestors + select). Same for search hits.

## Two artifacts

| | Role |
| --- | --- |
| SPA | `src/**/*.ts` → one inlined HTML (GitHub Pages / `file://`) |
| Pack CLI | `bin/*.ts` (Node) → `explorer.db` from full index + atlas |

The CLI is **not** inlined into the HTML. WASM inlining is SPA-only.

---

## Pack CLI (`bin/pack.ts`)

Port of atlas slim + sidecar merge into one `explorer.db`. Once this CLI works, **delete slim from atlas** (atlas `docs/spec.md` § Slim index).

### Atlas mirror map (copy → TypeScript)

Sibling repo: `../scip-atlas/` (same parent as this repo). Read these files directly — do not guess schema or SQL.

| Atlas (Python) | Web (TypeScript) | Port |
| --- | --- | --- |
| `../scip-atlas/scip_atlas/slim_index.py` | `bin/pack/slim.ts` (or inline in `pack.ts`) | `SlimIndexTable` → `PackTable`, `SlimIndexIndex` → `PackIndex`, `SLIM_INDEX_TABLES`, `SLIM_INDEX_INDEXES`, `index_name`, `create_index_sql`, `create_table_sql`, `copy_table_sql`, `build_slim_index` loop |
| `../scip-atlas/scip_atlas/project_paths.py` | `bin/pack/paths.ts` | `project_cache_slug`, `_project_root_hash`, `scip_cli_cache_dir`, `resolve_git_root`, `default_index_path`, `default_sidecar_path` (from `schema.py` L146) — **copy logic, no `import scip_cli`** |
| `../scip-atlas/scip_atlas/schema.py` | `bin/pack/atlas.ts` | `commits` / `files` / `dirs` / `meta` / `search_docs` DDL, `_FTS_CREATE_SQL`, `close_sidecar` WAL checkpoint before reading atlas |
| `../scip-atlas/scip_atlas/search.py` | (pack only) | FTS rebuild: `INSERT INTO search_docs_fts … SELECT … FROM search_docs` — same columns as `rebuild_search_index` |
| `../scip-atlas/.cursor/skills/scip-atlas/references/slim-index.md` | — | Config → SQL pattern doc; parity checklist |
| `../scip-atlas/tests/test_slim_index.py` | `tests/pack.test.ts` | Mirror: no `occurrences`, rdeps SQL match, missing source exit, generated index DDL |
| `../scip-atlas/tests/test_project_paths.py` | `tests/paths.test.ts` | `test_cache_slug_matches_scip_cli` — slug must stay aligned |

**Pack flow** (mirror `build_slim_index` + atlas copy):

1. Resolve paths (`paths.ts`) — full `index.db`, `atlas.db`, `explorer.db`.
2. Checkpoint atlas WAL (`schema.close_sidecar` pattern).
3. Open output `main`; `ATTACH` full index as `scip`, atlas as `atlas`.
4. For each `SLIM_INDEX_TABLES` entry: `create_table_sql` from `PRAGMA table_info` on `scip`, then `INSERT INTO main.t SELECT cols FROM scip.t`.
5. For atlas tables (`meta`, `commits`, `files`, `dirs`, `search_docs`): copy all columns from `atlas` into `main` (allowlist = every column present). Copy `commits` before `files`/`dirs` (FK).
6. Create `SLIM_INDEX_INDEXES` + `idx_dirs_parent` via `PackIndex` helper.
7. Drop any inherited FTS shadow tables; run `_FTS_CREATE_SQL` + populate from `search_docs`.
8. Detach, commit, print size line.

**SPA SQL** in this spec (deps / rdeps / tree / search) is already the consumer contract — same queries as atlas tests and scip-cli.

### Command

```text
npx tsx bin/pack.ts
  [--index PATH] [--atlas PATH] [--output PATH]
  [--repo PATH]
```

Defaults: git root of cwd → scip-cli cache slug (same algorithm as atlas `project_paths.py` — copy the few functions, do not `import scip_cli`). `--index` = cache `index.db` (full). `--atlas` = `atlas.db` beside it. `--output` = `explorer.db` beside atlas.

Checkpoint atlas WAL before copy (`PRAGMA wal_checkpoint(TRUNCATE)` on a write connection, then read).

Overwrite `--output` if it exists. Source ≠ output.

Print sizes: `index.db: X MB + atlas.db: Y MB -> explorer.db: Z MB`.

### Config → SQL (same pattern as Python)

**NEVER** hand-write `CREATE TABLE` / `INSERT … SELECT` / `CREATE INDEX` strings in the pack path. Static tuples; derive SQL.

Python to port (`slim_index.py`):

| Python | TypeScript |
| --- | --- |
| `SlimIndexTable(name, columns)` | `PackTable` |
| `SlimIndexIndex(table, columns)` | `PackIndex` |
| `create_table_sql` from `PRAGMA table_info` | same |
| `copy_table_sql` | `INSERT INTO main.t (cols) SELECT cols FROM src.t` |
| `index_name` → `idx_{table}_{col}_…` | same |
| `create_index_sql` | same |

**Index (SCIP) tables** — copy these columns only; drop `chunks.occurrences`:

```
documents: id, relative_path
global_symbols: id, symbol, display_name, kind
defn_enclosing_ranges: id, document_id, symbol_id, start_line, end_line
chunks: id, document_id, chunk_index, start_line, end_line
mentions: chunk_id, symbol_id, role
```

**Indexes:**

```
chunks (document_id)
mentions (symbol_id)
mentions (chunk_id)
defn_enclosing_ranges (document_id)
defn_enclosing_ranges (symbol_id)
```

**Atlas tables** — copy full columns from sidecar (types/PK from `PRAGMA table_info`, allowlist = all columns present):

```
meta
commits
files
dirs
search_docs
```

Index: `dirs (parent_path)` → `idx_dirs_parent` via the same `PackIndex` helper.

**FTS:** do **not** copy `search_docs_fts` virtual/shadow tables. After `search_docs` is filled:

```sql
CREATE VIRTUAL TABLE search_docs_fts USING fts5(
    path, kind UNINDEXED, symbol UNINDEXED, name, summary,
    tokenize='unicode61 remove_diacritics 2'
);
INSERT INTO search_docs_fts(rowid, path, kind, symbol, name, summary)
SELECT rowid, path, kind, symbol, name, summary FROM search_docs;
```

(Match atlas `schema.py` FTS definition.)

Attach full index as `scip`, atlas as `atlas`, write into `main` (`explorer.db`). No source blob in output. Reject if source `chunks` is missing required location columns. If atlas has no `search_docs`, fail (run `scip-atlas sync` first).

Node driver: `better-sqlite3` or Node `node:sqlite` — native, not WASM.

### Tests (pack)

- Output has no `occurrences` column on `chunks`.
- Mention PK / rdeps query matches full `index.db` for a fixture file (same SQL as atlas `test_slim_index_file_rdeps_match_full`).
- Atlas `files` / `dirs` / FTS row counts match source sidecar.
- Missing source → non-zero exit.

---

## SPA stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript under `src/**/*.ts` |
| SQL | `@sqlite.org/sqlite-wasm` from npm (FTS5 required) |
| UI | SPA, CSS in the repo (no UI CDN) |
| Runtime | Browser only. Queries in a **Worker** |
| Ship | **Single HTML** — all JS, CSS, and WASM inlined |

Do not add `serve` to scip-atlas. Do not ship a Node HTTP API.

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
- `file:` — embed the built source at compile time. Saved file must be a working empty explorer (no user DB bytes).

Saved HTML is usable fully offline.

## Inputs (SPA)

No CLI flags. Browser cannot read `~/.cache`.

**v1 load:** one file — `explorer.db` (pack output). All tables in `main` — no `ATTACH`. Reject full `index.db` if `chunks` has `occurrences`.

Join atlas overlay on **path strings**, never SCIP integer ids.

If `mentions` is missing: “run pack / rebuild” on deps/rdeps — do not show empty lists as “no importers.”

Refuse `-wal` / `-shm` as the dropped file.

Large files: progress on read; fail clearly if WASM heap cannot hold them. v1 is in-memory only.

## UI

### Accordion tree

Lazy: children of one parent, not the whole repo.

- Roots: `dirs` where `parent_path IS NULL` (repo root `relative_path = ''`) plus top-level dirs (`parent_path = ''`).
- Expand a dir: child dirs (`dirs.parent_path = ?`) and **direct** files ( `files` has no `parent_path` — dirname of `relative_path`).
- Each node: basename, last git author/date/subject, summary if present.

Empty state until a DB is loaded. Persist last-opened **filename** in `localStorage` only (not file bytes).

### File panel

Selecting a file:

1. Overlay: summary, last commit, author
2. **Defined symbols** — names + start line from `defn_enclosing_ranges` (SCIP defs, not the TS `export` keyword)
3. **deps** — other indexed files this file references
4. **rdeps** — other indexed files that reference this file’s defined symbols

Click a path → navigate.

### Search

Box → `search_docs_fts`. Names/paths first, summaries second. No embeddings.

### Chrome

- Load DB
- Search
- **Download this HTML** (always visible, even before DBs)

No login. No settings that call the network.

## Query surface (in-process, not HTTP)

```text
tree(parent)     → roots / children (dirs + files)
node(path)       → overlay + symbols + deps + rdeps
search(q)        → FTS hits
health()         → loaded file, table presence, sizes
```

## SQL (single `explorer.db`)

`mentions.role != 1` is a reference (role 1 = definition). Same as scip-cli `deps` / `rdeps`. No schema prefix.

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

**rdeps:**

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

**deps:**

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

Direct files under dir `src`:

```sql
SELECT f.relative_path, c.author_name, c.commit_time, c.subject, f.summary
FROM files f
JOIN commits c ON c.sha = f.commit_sha
WHERE f.relative_path LIKE 'src/%'
  AND instr(substr(f.relative_path, 5), '/') = 0
ORDER BY f.relative_path
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

## SCIP gaps

Empty deps/rdeps is often a SCIP miss (`require()`, named imports, barrels), not proof unused. Show the lists; do not label “dead” in v1.

## Privacy / local-only (hard)

- **NEVER** `fetch`/`XHR`/`sendBeacon`/`WebSocket` except: (1) GitHub Pages serving this HTML, (2) `fetch(location.href)` for the Download button on http(s).
- **NEVER** upload DBs. `File` → `arrayBuffer()` in-page only.
- **NEVER** persist DB bytes to `localStorage` / IndexedDB / OPFS in v1.
- Service worker: **no**.

## Non-goals (v1)

- Reindex, sync, summarize (stay in atlas / scip-cli)
- Source snippets / blame
- Embeddings / Q&A
- Auth, accounts
- Editing the DBs
- Node HTTP backend
- Multi-file GitHub Pages deploy

## Later

- Embed **summaries** only (RAG), invalidate with atlas hashes
- OPFS when not on `file://`
