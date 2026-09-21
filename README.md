# scip-atlas-web

Read-only **single-file SPA** plus a Node **pack** CLI.

Accordion of the repo, basename search, jump-nav via per-file **deps** / **rdeps**. Runs in the browser. Pack builds one `explorer.db` (slim SCIP graph + atlas overlay, no source).

Canonical contract: [docs/spec.md](docs/spec.md). **Atlas schema delta (pack + SPA):** [tmp/atlas-schema-delta.md](tmp/atlas-schema-delta.md).

## Artifact (SPA)

Build emits **one** `index.html`: TypeScript, CSS, and SQLite WASM inlined. GitHub Pages or Download → `file://`. **Zero outbound HTTP** after load. User DB stays in memory.

| | |
| --- | --- |
| Dev | `src/**/*.ts`, CSS, `@sqlite.org/sqlite-wasm` |
| Ship | one HTML |
| Pack | `bin/pack.ts` — Node, not in the HTML |

## Prepare a repo (3 tools)

From the repo root, one step per tool. Artifacts land in `~/.cache/scip-cli/projects/<slug>/` (`index.db`, `atlas.db`, then `explorer.db`).

```bash
# 1. scip-cli — index the code (symbols, deps graph, source chunks)
scip-cli reindex

# 2. scip-atlas — git overlay + path columns (no LLM required for browse)
scip-atlas sync

# 3. scip-atlas-web — slim SCIP + merge atlas → explorer.db (no source in output)
npm run pack -- --repo /path/to/repo
```

Optional: `scip-atlas summarize` after sync for LLM blurbs in the tree.

**Load in the SPA:** drop or open the packed `explorer.db` (e.g. from the cache folder above).

## Status

Pack CLI and SPA implemented; **atlas schema changed** — see [tmp/atlas-schema-delta.md](tmp/atlas-schema-delta.md) for SQL/pack updates still needed in this repo.

```bash
npm install
npm test
npm run pack -- --index path/to/index.db --atlas path/to/atlas.db
npm run build
```

## Testing

| Command | What |
| --- | --- |
| `npm test` | Vitest (pack, inspect, dump-ui, paths) |
| `npm run dump-ui -- path/to/explorer.db` | Text report of tree/overlay data the SPA would show (for agents/debug) |
| `npm run test:ui` | **WIP** — Playwright browser e2e; not hooked into `npm test`. Requires `npx playwright install` once. |

## GitHub Pages

Pushes to `main` build `dist/index.html` and deploy via [`.github/workflows/pages.yml`](.github/workflows/pages.yml) (Actions source, no `gh-pages` branch).

Live site: https://flesler.github.io/scip-atlas-web/

Enable once in the repo if needed: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
