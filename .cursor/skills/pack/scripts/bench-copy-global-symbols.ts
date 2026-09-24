import Database from "better-sqlite3"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import { copyGlobalSymbols } from "../../../../bin/pack/symbols.js"
import { symbolDisplayName } from "../../../../src/symbols.js"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const INDEX_PATH = path.join(ROOT, "tmp/index.db")
const RUNS = 12
const WARMUPS = 3

type SourceSymbolRow = {
  id: number
  symbol: string
  display_name: string | null
}

function copyGlobalSymbolsBulk(main: Database.Database, scip: Database.Database) {
  main.exec(`
    INSERT INTO global_symbols (id, display_name)
    SELECT id, TRIM(display_name)
    FROM scip.global_symbols
    WHERE display_name IS NOT NULL AND TRIM(display_name) != ''
  `)

  const fallbackRows = scip
    .prepare(
      `SELECT id, symbol, display_name
       FROM global_symbols
       WHERE display_name IS NULL OR TRIM(display_name) = ''`,
    )
    .all() as SourceSymbolRow[]
  if (!fallbackRows.length) {
    return
  }

  const insert = main.prepare("INSERT INTO global_symbols (id, display_name) VALUES (?, ?)")
  const insertFallback = main.transaction((batch: SourceSymbolRow[]) => {
    for (const row of batch) {
      const display_name = symbolDisplayName(row.symbol, null)
      if (!display_name) {
        continue
      }
      insert.run(row.id, display_name)
    }
  })
  insertFallback(fallbackRows)
}

function openPair(indexPath: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "copy-global-symbols-bench-"))
  const mainPath = path.join(dir, "main.db")
  const main = new Database(mainPath)
  const scip = new Database(indexPath, { readonly: true })
  main.exec("CREATE TABLE global_symbols (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL)")
  main.exec(`ATTACH DATABASE '${indexPath.replace(/'/g, "''")}' AS scip`)
  return {
    main,
    scip,
    cleanup: () => {
      main.close()
      scip.close()
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}

function snapshot(main: Database.Database) {
  return main
    .prepare("SELECT id, display_name FROM global_symbols ORDER BY id")
    .all() as { id: number; display_name: string }[]
}

function runVariant(copy: (main: Database.Database, scip: Database.Database) => void) {
  const { main, scip, cleanup } = openPair(INDEX_PATH)
  const start = performance.now()
  copy(main, scip)
  const ms = performance.now() - start
  const rows = snapshot(main)
  cleanup()
  return { ms, rows }
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
  return { mean, median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted[sorted.length - 1] }
}

function parityHash(rows: { id: number; display_name: string }[]) {
  return rows.map((row) => `${row.id}\t${row.display_name}`).join("\n")
}

if (!fs.existsSync(INDEX_PATH)) {
  console.error(`missing ${INDEX_PATH} — copy a full index.db to tmp/ first`)
  process.exit(1)
}

const sourceConn = new Database(INDEX_PATH, { readonly: true })
const sourceCount = (sourceConn.prepare("SELECT COUNT(*) AS n FROM global_symbols").get() as { n: number }).n
sourceConn.close()
console.log(`index: ${INDEX_PATH}`)
console.log(`global_symbols rows in source: ${sourceCount}`)

const rowLoopCheck = runVariant(copyGlobalSymbols)
const bulkCheck = runVariant(copyGlobalSymbolsBulk)
if (parityHash(rowLoopCheck.rows) !== parityHash(bulkCheck.rows)) {
  throw new Error(`output mismatch: row=${rowLoopCheck.rows.length} bulk=${bulkCheck.rows.length}`)
}
console.log(`packed rows: ${rowLoopCheck.rows.length}`)
console.log("parity: ok")

for (let i = 0; i < WARMUPS; i++) {
  runVariant(copyGlobalSymbols)
  runVariant(copyGlobalSymbolsBulk)
}

const rowLoopSamples: number[] = []
const bulkSamples: number[] = []
for (let i = 0; i < RUNS; i++) {
  if (i % 2 === 0) {
    rowLoopSamples.push(runVariant(copyGlobalSymbols).ms)
    bulkSamples.push(runVariant(copyGlobalSymbolsBulk).ms)
  } else {
    bulkSamples.push(runVariant(copyGlobalSymbolsBulk).ms)
    rowLoopSamples.push(runVariant(copyGlobalSymbols).ms)
  }
}

const rowLoop = stats(rowLoopSamples)
const bulk = stats(bulkSamples)
const speedup = rowLoop.mean / bulk.mean

console.log("")
console.log(`row loop (production, n=${RUNS}): mean ${rowLoop.mean.toFixed(1)}ms  median ${rowLoop.median.toFixed(1)}ms`)
console.log(`bulk+tail (rejected, n=${RUNS}): mean ${bulk.mean.toFixed(1)}ms  median ${bulk.median.toFixed(1)}ms`)
console.log(`speedup: ${speedup.toFixed(2)}x (${speedup >= 1 ? "" : "-"}${Math.abs((1 - 1 / speedup) * 100).toFixed(0)}% vs bulk)`)
