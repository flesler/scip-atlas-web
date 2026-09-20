# scip-atlas-web spec

Read-only HTTP + accordion UI over **slim index + atlas sidecar**. Not an indexer. Not git. Not LLM. If the DBs are not on disk, it cannot help.

Sibling: [scip-atlas](https://github.com/flesler/scip-atlas) writes `atlas.db` and `index.slim.db`. [scip-cli](https://github.com/flesler/scip-cli) writes full `index.db`.

## Stack

**TypeScript** — Node server, SQLite (`ATTACH`), static HTML/CSS/JS (or a small SPA). Atlas stays Python on purpose (ETL + local models). This product is a browser tree with jump links.

Do not add `serve` to scip-atlas.

## Inputs

Default: scip-cli cache for a `--repo` (`~/.cache/scip-cli/projects/<slug>/`). Same slug rules as atlas (`project_paths.py` — copy or reimplement; do not `import scip_cli` unless atlas later publishes it).

| Flag / config | File |
| --- | --- |
| `--index` | `index.slim.db` preferred; full `index.db` only if slim missing (warn: larger, contains source) |
| `--atlas` | `atlas.db` beside the index |

Open both, `ATTACH`, query. Join atlas on **path strings**, never SCIP integer ids (ids reshuffle on reindex).

## UI

### Accordion tree

Lazy: load children of one parent, not the whole repo.

- Roots: atlas `dirs` where `parent_path IS NULL` (repo root `relative_path = ''`) plus top-level dirs (`parent_path = ''`).
- Expand a dir: child dirs (`dirs.parent_path = ?`) and **direct** files (atlas `files` has no `parent_path` — derive: files whose dirname is this dir).
- Each node: basename, last git author/date/subject, summary if present.

### File panel (not only un-collapse)

Selecting a file opens a panel (or route) with:

1. Overlay: summary, last commit, author
2. **Defined symbols** — names + start line from slim `defn_enclosing_ranges` (this is the export/API list without reading source; SCIP defs, not the TS `export` keyword)
3. **deps** — other indexed files this file references
4. **rdeps** — other indexed files that reference this file’s defined symbols

Clicking a path **navigates** to that file (open ancestors + select). Same for a search hit.

Optional later: click a symbol → highlight; outbound deps per-symbol like `scip-cli deps Symbol`.

### Search

Box backed by atlas FTS5 `search_docs_fts`. Match names, paths, symbol names, summaries. Rank: names/paths first, summaries second. No embeddings.

## API sketch

```text
GET /tree?parent=                 → roots / children (dirs + files)
GET /node?path=src/helper.ts      → overlay + symbols + deps + rdeps
GET /search?q=Handler
GET /health                       → which DBs, schema versions, mtimes
```

Lazy tree. `/node` is the jump target.

## SQL (slim + atlas)

`mentions.role != 1` means reference (definition is role 1). Same as scip-cli `deps` / `rdeps`.

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

## Slim contract (must not regress)

`scip-atlas index slim` **keeps** `mentions` and chunk location columns. It **drops** `chunks.occurrences` (source). Explorer v1 does not show code snippets; that needs full `index.db` or the worktree (out of v1).

If slim is old (no `mentions` table), fail `/node` deps/rdeps with a clear “rebuild slim” error — do not pretend the file has zero importers.

## SCIP gaps (do not paper over)

Empty deps/rdeps is often a SCIP miss (`require()`, some named imports, barrels), not proof unused. Same caveats as `scip-cli rdeps` / `deps`. Show the lists; do not label “dead” in v1.

## Non-goals (v1)

- Reindex, sync, summarize
- Source snippets / blame
- Embeddings / Q&A
- Auth (local server)
- Editing the DBs

## Embeddings / Q&A

Later: embed **summaries** only, invalidate with atlas hashes. Accordion + FTS + graph is v1 understanding. RAG is a follow-on.
