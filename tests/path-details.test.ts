import { afterEach, describe, expect, it } from "vitest"
import { fetchPathDetails } from "../src/path-details.js"
import { asQueryAll, cleanupExplorerFixtures, openExplorer } from "./open-explorer.js"

afterEach(() => {
  cleanupExplorerFixtures()
})

describe("fetchPathDetails", () => {
  it("returns overlay, symbols, deps, and rdeps for a fixture file", () => {
    const db = openExplorer()
    const details = fetchPathDetails(asQueryAll(db), "src/helper.ts", true)

    db.close()

    expect(details.kind).toBe("file")
    expect(details.path).toBe("src/helper.ts")
    expect(details.overlay?.message).toBe("initial commit")
    expect(details.symbols.some((row) => row.display_name === "greet")).toBe(true)
    expect(details.deps).toEqual([])
    expect(details.rdeps).toContain("src/consumer.ts")
  })

  it("throws when the path is not a file", () => {
    const db = openExplorer()
    const query = asQueryAll(db)
    expect(() => fetchPathDetails(query, "src", true)).toThrow(/not a file/)
    db.close()
  })

  it("throws when mentions are missing", () => {
    const db = openExplorer()
    const query = asQueryAll(db)
    expect(() => fetchPathDetails(query, "src/helper.ts", false)).toThrow(/mentions table missing/)
    db.close()
  })
})
