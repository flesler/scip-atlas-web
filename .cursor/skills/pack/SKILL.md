---
name: pack
description: Read when changing pack logic or repacking explorer.db.gz.
---

# Pack

## Repack (required after pack logic changes)

After edits to `bin/pack/**`, `bin/pack.ts`, `src/symbols.ts`, or `src/queries.ts`, repack without asking:

```bash
npx tsx bin/pack.ts --gzip
```

NEVER skip repack when pack output shape or symbol/query logic changed.
Default output is `<github_repo>.db` beside atlas (from meta); use the printed `Output:` path. For a fixed desktop copy, pass `--output ~/Desktop/<repo>.db.gz`.

Gzip level for `--compress`: **5** — see `docs/gzip.md`.

Uses git root + scip-cli cache by default (`--repo`). Override with `--project`, `--index`, or `--atlas` when needed.

Other tables copy via `INSERT … SELECT` in `bin/pack/slim.ts`. Only `global_symbols` uses custom logic — see `global-symbols` skill.

## Benchmark copyGlobalSymbols

Before swapping row-loop for bulk SQL:

```bash
npx tsx .cursor/skills/pack/scripts/bench-copy-global-symbols.ts
```

Needs `tmp/index.db` (any full scip-cli index for scale testing).
