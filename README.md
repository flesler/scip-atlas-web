# scip-atlas-web

Read-only **single-file SPA** for a [scip-atlas](https://github.com/flesler/scip-atlas) sidecar plus a slim scip-cli index.

Accordion of the repo, FTS search, jump-nav via per-file **deps** / **rdeps** and defined symbols. Runs entirely in the browser. No server, no indexer, no git, no LLM.

Canonical contract: [docs/spec.md](docs/spec.md).

## Artifact

Build emits **one** `index.html`: TypeScript, CSS, and SQLite WASM inlined, minified, tree-shaken. Open it from GitHub Pages, or download it (toolbar icon) and use offline via `file://`.

**Zero outbound HTTP** after the page itself is loaded. User SQLite files stay in memory (never uploaded).

## Source vs ship

| | |
| --- | --- |
| Dev | `src/**/*.ts`, CSS, `@sqlite.org/sqlite-wasm` from npm |
| Ship | one HTML file, nothing else |

## DBs (user provides)

Drag-drop or file picker:

| File | Role |
| --- | --- |
| `index.slim.db` | Documents, symbols, definition lines, mention graph (**no source**) |
| `atlas.db` | Git overlay, summaries, FTS |

Optional later: one bundled file from atlas. Rebuild slim after schema changes: `scip-atlas index slim`.

## Status

Spec only. Implement against `docs/spec.md`.
