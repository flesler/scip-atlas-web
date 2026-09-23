import type Database from "better-sqlite3"
import { symbolDisplayName } from "../../src/symbols.js"

type SourceSymbolRow = {
  id: number
  symbol: string
  display_name: string | null
}

export function copyGlobalSymbols(main: Database.Database, scip: Database.Database) {
  const rows = scip.prepare("SELECT id, symbol, display_name FROM global_symbols").all() as SourceSymbolRow[]
  const insert = main.prepare("INSERT INTO global_symbols (id, display_name) VALUES (?, ?)")
  const insertAll = main.transaction((batch: SourceSymbolRow[]) => {
    for (const row of batch) {
      const fromSource = row.display_name?.trim()
      const display_name = fromSource || symbolDisplayName(row.symbol, null)
      insert.run(row.id, display_name)
    }
  })
  insertAll(rows)
}
