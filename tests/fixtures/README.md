# Test fixtures

Checked-in inputs for pack/SPA tests. **Not a real repo** — a minimal synthetic TypeScript tree indexed as `npm sample-app 1.0.0`.

| File | Source | Role |
| --- | --- | --- |
| `index.db` | scip-cli reindex on fake `src/**` tree | Full SCIP graph (37 files, deps/rdeps) |
| `atlas.db` | scip-atlas sync on same tree | Overlay: `files`, `dirs`, `commits`, `committers`, `owners`, `file_owners`, `meta` (no summaries) |
| `search.db` | `bootstrap.ts` (optional) | Debug export of the in-memory search fixture |
| `explorer.db` | `bootstrap.ts` via `buildExplorerDb` | Packed sample-app DB (gitignored; built once, loaded into memory per test run) |

Tests use `:memory:` fixtures via `openFixture()` — no per-test disk files.

Regenerate disk exports (optional):

```bash
npm run bootstrap:fixtures
```

Do not commit `*.db-shm` / `*.db-wal`.
