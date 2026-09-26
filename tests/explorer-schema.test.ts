import { describe, expect, it } from "vitest"
import { detectExplorerMode, validateExplorerDb } from "../src/explorer-schema.js"

describe("explorer schema", () => {
  it("detects explorer mode from required tables", () => {
    expect(detectExplorerMode(new Set(["files", "committers", "documents"]))).toBe("explorer")
    expect(detectExplorerMode(new Set(["files", "committers"]))).toBe("invalid")
  })

  it("rejects full index.db chunks schema", () => {
    const tables = new Set(["files", "committers", "commits", "documents"])
    expect(() => validateExplorerDb(tables, ["id", "occurrences"])).toThrow(/full index\.db/)
  })

  it("requires atlas tables from pack", () => {
    const tables = new Set(["documents", "mentions"])
    expect(() => validateExplorerDb(tables, ["id"])).toThrow(/expected explorer\.db/)
  })

  it("accepts a packed explorer.db table set", () => {
    const tables = new Set(["files", "committers", "commits", "documents", "mentions"])
    expect(() => validateExplorerDb(tables, ["id", "document_id"])).not.toThrow()
    expect(detectExplorerMode(tables)).toBe("explorer")
  })
})
