# Gzip level for `explorer.db.gz`

Pack uses **zlib level 5** (`bin/pack/build.ts`). Browser load uses `DecompressionStream("gzip")` in `src/decompress.ts` — decompress time barely changes with level; pick level for **size vs pack time**.

## Benchmark

Sample: `tmp/explorer.db` (~27.8 MB uncompressed) from packing a medium TypeScript repo. Each cell is the **median of 5 runs** (Node 22, same machine). Decompress column is `DecompressionStream`, matching the app.

| Level | Gzip size | Saved | Pack (gzip) | Browser decompress |
| ----: | --------: | ----: | ----------: | -----------------: |
| 1 | 12.27 MB | 55.9% | 234 ms | 151 ms |
| 2 | 12.18 MB | 56.3% | 248 ms | 126 ms |
| 3 | 12.12 MB | 56.5% | 289 ms | 117 ms |
| 4 | 11.91 MB | 57.2% | 322 ms | 121 ms |
| **5** | **10.00 MB** | **64.0%** | **404 ms** | **99 ms** |
| 6 | 9.99 MB | 64.1% | 696 ms | 111 ms |
| 7 | 9.99 MB | 64.1% | 982 ms | 96 ms |
| 8 | 9.98 MB | 64.1% | 4.1 s | 90 ms |
| 9 | 9.98 MB | 64.1% | 7.6 s | 96 ms |

## Choice

- **L5–L7** share essentially the same size (~10 MB); L5 packs ~300 ms faster than L6 with no meaningful size loss.
- **L8–L9** add seconds of pack time for ~19 KB vs L5 — not worth it.
- **L1–L4** are ~2 MB larger with little benefit.

Re-run locally:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
const input = readFileSync('tmp/explorer.db');
for (let level = 1; level <= 9; level++) {
  const t0 = performance.now();
  const gz = gzipSync(input, { level });
  console.log(level, (gz.length/1024/1024).toFixed(2)+' MB', (performance.now()-t0).toFixed(0)+' ms');
}
"
```
