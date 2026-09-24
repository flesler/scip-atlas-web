---
name: global-symbols
description: Read when changing symbol names or global_symbols in explorer.db.
---

# Global symbols

## Source data (scip-cli)

- `global_symbols.display_name` is usually **NULL**; names come from parsing `symbol`.
- **Module symbols** end with `/` (file-as-module node). `symbolDisplayName()` returns `null` for them.
- Do not pack module rows as filenames like `index.ts` — they pollute "Defined symbols" with file names.

Logic lives in `src/symbols.ts`; pack uses it in `bin/pack/symbols.ts`.

## Packing

`copyGlobalSymbols` skips rows where resolved `display_name` is null (module symbols) or starts with `_`.

Safe because the import graph does **not** need those rows:

| Query | Joins `global_symbols`? |
| --- | --- |
| `deps` / `rdeps` | No — `mentions` + `defn_enclosing_ranges` |
| `definedSymbols` | Yes — `WHERE display_name IS NOT NULL` |

`mentions` and `defn_enclosing_ranges` still copy every `symbol_id`; omitting module rows only shrinks `global_symbols`.

## Performance

Row loop inside a `better-sqlite3` transaction beats `INSERT … SELECT` bulk for this workload (~13% on a 117k-row index). scip-cli has zero non-null `display_name`, so bulk SQL is a no-op plus extra queries.

NEVER replace the row loop with bulk SQL without running the pack benchmark script.

Comment in `bin/pack/symbols.ts` points at `.cursor/skills/pack/scripts/bench-copy-global-symbols.ts`.
