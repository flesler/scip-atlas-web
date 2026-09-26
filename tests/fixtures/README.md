# Test fixtures

Checked-in inputs for pack/SPA tests. **Not a real repo** — a minimal synthetic TypeScript tree indexed as `npm sample-app 1.0.0`.

| File | Source | Role |
| --- | --- | --- |
| `index.db` | scip-cli reindex on fake `src/**` tree | Full SCIP graph (37 files, deps/rdeps) |
| `atlas.db` | scip-atlas sync on same tree | Overlay: `files`, `dirs`, `commits`, `committers`, `owners`, `file_owners`, `meta` (no summaries) |

Tests call `buildExplorerDb()` at runtime; `explorer.db` is never committed.

Regenerate only when schema or graph expectations change (requires scip-cli + scip-atlas on a matching fake repo). Do not commit `*.db-shm` / `*.db-wal`.
