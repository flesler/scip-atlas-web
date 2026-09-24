import type Database from "better-sqlite3"
import {
  classOwnerKey,
  isConstructorParameterSymbol,
  isConstructorSymbol,
  shouldPackDisplayName,
  symbolDisplayName,
} from "../../src/symbols.js"

type SourceSymbolRow = {
  id: number
  symbol: string
  display_name: string | null
  document_id: number
}

export type PackedSymbolRow = {
  id: number
  symbol: string
  display_name: string | null
}

function hasClassOwnerInDocs(
  symbol: string,
  documentIds: Set<number>,
  classKeysByDoc: Map<number, Set<string>>,
): boolean {
  const ownerKey = classOwnerKey(symbol)
  if (!ownerKey) {
    return false
  }
  for (const documentId of documentIds) {
    if (classKeysByDoc.get(documentId)?.has(ownerKey)) {
      return true
    }
  }
  return false
}

export function planGlobalSymbolPack(scip: Database.Database): PackedSymbolRow[] {
  const derRows = scip
    .prepare(
      `SELECT gs.id, gs.symbol, gs.display_name, der.document_id
       FROM global_symbols gs
       JOIN defn_enclosing_ranges der ON der.symbol_id = gs.id`,
    )
    .all() as SourceSymbolRow[]

  const classKeysByDoc = new Map<number, Set<string>>()
  const documentIdsBySymbolId = new Map<number, Set<number>>()
  const rowById = new Map<number, SourceSymbolRow>()

  for (const row of derRows) {
    const documentIds = documentIdsBySymbolId.get(row.id) ?? new Set<number>()
    documentIds.add(row.document_id)
    documentIdsBySymbolId.set(row.id, documentIds)
    if (!rowById.has(row.id)) {
      rowById.set(row.id, row)
    }
    if (isConstructorSymbol(row.symbol)) {
      continue
    }
    const key = classOwnerKey(row.symbol)
    if (!key) {
      continue
    }
    const classKeys = classKeysByDoc.get(row.document_id) ?? new Set<string>()
    classKeys.add(key)
    classKeysByDoc.set(row.document_id, classKeys)
  }

  const packed: PackedSymbolRow[] = []
  for (const row of rowById.values()) {
    const documentIds = documentIdsBySymbolId.get(row.id)
    if (!documentIds) {
      continue
    }
    if (isConstructorParameterSymbol(row.symbol)) {
      continue
    }
    if (isConstructorSymbol(row.symbol) && hasClassOwnerInDocs(row.symbol, documentIds, classKeysByDoc)) {
      continue
    }
    const fromSource = row.display_name?.trim()
    const display_name = fromSource || symbolDisplayName(row.symbol, null)
    if (!display_name || !shouldPackDisplayName(display_name)) {
      continue
    }
    packed.push({ id: row.id, symbol: row.symbol, display_name })
  }
  return packed
}

export function copyGlobalSymbols(main: Database.Database, scip: Database.Database) {
  // Row loop in a transaction beats INSERT…SELECT here (~13% on 117k rows).
  // scip-cli leaves display_name NULL, so bulk SQL inserts nothing and we still need JS
  // for symbolDisplayName; see .cursor/skills/pack/scripts/bench-copy-global-symbols.ts.
  const rows = planGlobalSymbolPack(scip)
  const insert = main.prepare("INSERT INTO global_symbols (id, display_name) VALUES (?, ?)")
  const insertAll = main.transaction((batch: PackedSymbolRow[]) => {
    for (const row of batch) {
      insert.run(row.id, row.display_name)
    }
  })
  insertAll(rows)
}
