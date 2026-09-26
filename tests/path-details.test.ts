import { afterEach, describe, expect, it } from "vitest"
import { fetchPathDetails } from "../src/path-details.js"
import { asQueryAll, cleanupExplorerFixtures, openExplorer } from "./open-explorer.js"

afterEach(() => {
  cleanupExplorerFixtures()
})

describe("fetchPathDetails", () => {
  it("returns overlay, symbols, deps, and rdeps for a fixture file", () => {
    const db = openExplorer()
    const details = fetchPathDetails(asQueryAll(db), "src/helper.ts", true, true)

    db.close()

    expect(details.kind).toBe("file")
    expect(details.path).toBe("src/helper.ts")
    expect(details.overlay?.message).toBe("initial commit")
    expect(details.overlay?.commit_sha).toBeTruthy()
    expect(details.symbols.some((row) => row.display_name === "greet")).toBe(true)
    expect(details.owners).toEqual(["@acme/core", "@acme/tooling"])
    expect(details.deps).toEqual([])
    expect(details.rdeps).toContain("src/consumer.ts")
  })

  it("throws when the path is not a file", () => {
    const db = openExplorer()
    const query = asQueryAll(db)
    expect(() => fetchPathDetails(query, "src", true, true)).toThrow(/not a file/)
    db.close()
  })

  it("throws when mentions are missing", () => {
    const db = openExplorer()
    const query = asQueryAll(db)
    expect(() => fetchPathDetails(query, "src/helper.ts", false, true)).toThrow(/mentions table missing/)
  })

  it("returns no owners when codeowners tables are absent", () => {
    const db = openExplorer()
    const details = fetchPathDetails(asQueryAll(db), "src/helper.ts", true, false)

    db.close()

    expect(details.owners).toEqual([])
    db.close()
  })
})
