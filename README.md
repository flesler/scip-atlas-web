# scip-atlas-web

Read-only **single-file SPA** plus a Node **pack** CLI.

Tree explorer with search (name, path, symbols), file panel (owners, defined symbols, deps/rdeps), and GitHub/GitLab deep links when atlas stores remote metadata. Pack builds one slim DB (SCIP graph + atlas overlay, no source).

Canonical contract: [docs/spec.md](docs/spec.md).

## Artifact (SPA)

Build emits **one** `index.html`: TypeScript, CSS, and SQLite WASM inlined. GitHub Pages or Download → `file://`. **Zero outbound HTTP** after load. User DB stays in memory.

| | |
| --- | --- |
| Dev | `src/**/*.ts`, CSS, `@sqlite.org/sqlite-wasm` |
| Ship | one HTML |
| Pack | `bin/pack.ts` — Node, not in the HTML |

## Prepare a repo (3 tools)

From the repo root, one step per tool. Artifacts land in `~/.cache/scip-cli/projects/<slug>/` (`index.db`, `atlas.db`, then `<repo>.db` when atlas meta has `github_repo`, else `explorer.db`).

```bash
# 1. scip-cli — index the code (symbols, deps graph, source chunks)
scip-cli reindex

# 2. scip-atlas — git overlay + path columns (no LLM required for browse)
scip-atlas sync

# 3. scip-atlas-web — slim SCIP + merge atlas → packed DB (no source in output)
npm run pack -- --gzip
```

Optional: `scip-atlas summarize` after sync for LLM blurbs in the tree.

**Load in the SPA:** grab the packed `.db` or `.db.gz` from the `Output:` line pack prints, then drop or open it in the app. `--output` accepts a file path or a directory (uses `<repo>.db`, or `explorer.db` when atlas has no `github_repo`).

## Development

```bash
npm install
npm test
npm run pack -- --index path/to/index.db --atlas path/to/atlas.db
npm run build
```

## Testing

| Command | What |
| --- | --- |
| `npm test` | Vitest (pack, search, inspect, paths, …) |
| `npm run dump-ui -- path/to/packed.db` | Text report of tree/overlay data the SPA would show |
| `npm run test:ui` | Playwright browser e2e (optional; run `npx playwright install` once) |

## GitHub Pages

Pushes to `main` build `dist/index.html` and deploy via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

Live site: https://flesler.github.io/scip-atlas-web/
