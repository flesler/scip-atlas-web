# scip-atlas-web

Read-only **single-file SPA** plus a Node **pack** CLI.

Accordion of the repo, FTS search, jump-nav via per-file **deps** / **rdeps**. Runs in the browser. Pack builds one `explorer.db` (slim SCIP graph + atlas overlay, no source).

Canonical contract: [docs/spec.md](docs/spec.md).

## Artifact (SPA)

Build emits **one** `index.html`: TypeScript, CSS, and SQLite WASM inlined. GitHub Pages or Download → `file://`. **Zero outbound HTTP** after load. User DB stays in memory.

| | |
| --- | --- |
| Dev | `src/**/*.ts`, CSS, `@sqlite.org/sqlite-wasm` |
| Ship | one HTML |
| Pack | `bin/pack.ts` — Node, not in the HTML |

## Pack

```bash
npx tsx bin/pack.ts --repo /path/to/repo
# full index.db + atlas.db → explorer.db
```

Drop `explorer.db` on the page. Port of atlas `slim_index.py` + sidecar merge; then **remove slim from atlas**.

## Status

Spec only. Implement pack first (parity with Python slim + atlas merge), then SPA.
