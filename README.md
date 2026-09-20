# scip-atlas-web

Read-only explorer for a [scip-atlas](https://github.com/flesler/scip-atlas) sidecar plus a scip-cli **slim** index.

Accordion of the repo, FTS search, and jump-nav via per-file **deps** / **rdeps** and defined symbols. No indexer. No git. No LLM.

Canonical contract: [docs/spec.md](docs/spec.md).

## Stack

**TypeScript** (Node HTTP + browser). Atlas and scip-cli stay Python ETL. This repo is a UI over SQLite.

Python would share sqlite/`ATTACH` with atlas, but the product is a collapsible tree and click-to-jump — that is a browser app. One TS codebase beats a Python API plus a separate frontend.

## DBs

Point the server at a scip-cli cache dir (or explicit paths):

| File | Role |
| --- | --- |
| `index.slim.db` | Documents, symbols, definition lines, mention graph (**no source**) |
| `atlas.db` | Git overlay, summaries, FTS |

Rebuild slim after atlas updates that change the slim schema: `scip-atlas index slim`.

## Status

Spec only. Implement against `docs/spec.md`.
