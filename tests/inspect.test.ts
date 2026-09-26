import { describe, expect, it } from "vitest"
import {
  flattenInspectTableNames,
  groupInspectTables,
  listTables,
  tableRows,
  tableSchema,
} from "../src/inspect.js"
import { asQueryAll, openExplorer } from "./open-explorer.js"

describe("inspect", () => {
  it("lists atlas and scip tables from explorer.db", () => {
    const tables = listTables(asQueryAll(openExplorer()))
    expect(tables.some((table) => table.name === "files")).toBe(true)
    expect(tables.some((table) => table.name === "committers")).toBe(true)
    expect(tables.some((table) => table.name === "documents")).toBe(true)
  })

  it("groups tables into scip-cli, scip-atlas, and other", () => {
    const groups = groupInspectTables(listTables(asQueryAll(openExplorer())))
    const byId = new Map(groups.map((group) => [group.id, group.tables.map((table) => table.name)]))
    expect(byId.get("scip-cli")).toEqual(
      expect.arrayContaining(["documents", "mentions", "chunks", "global_symbols", "defn_enclosing_ranges"]),
    )
    expect(byId.get("scip-atlas")).toEqual(
      expect.arrayContaining(["committers", "commits", "files", "dirs", "owners", "file_owners", "meta"]),
    )
    expect(byId.has("other")).toBe(false)
  })

  it("flattens grouped table names in display order", () => {
    const groups = groupInspectTables([
      { name: "chunks", type: "table", rowCount: 1 },
      { name: "files", type: "table", rowCount: 2 },
      { name: "dirs", type: "table", rowCount: 3 },
    ])
    expect(flattenInspectTableNames(groups)).toEqual([
      "chunks",
      "files",
      "dirs",
    ])
  })

  it("returns schema and rows with NULL rendered explicitly", () => {
    const query = asQueryAll(openExplorer())
    const allowed = new Set(listTables(query).map((table) => table.name))
    const schema = tableSchema(query, "files", allowed)
    const rows = tableRows(query, "files", allowed, 5, 0)

    expect(schema.some((column) => column.name === "summary")).toBe(true)
    expect(rows.columns).toContain("summary")
    expect(rows.rows.some((row) => row.includes("NULL"))).toBe(true)
  })
})
