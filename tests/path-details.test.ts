import { describe, expect, it } from "vitest"
import { fetchPathDetails } from "../src/path-details.js"
import { asQueryAll, openExplorer } from "./open-explorer.js"

describe("fetchPathDetails", () => {
  it("returns overlay, symbols, deps, and rdeps for a fixture file", () => {
    const details = fetchPathDetails(asQueryAll(openExplorer()), "src/helper.ts", true, true)

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
    const query = asQueryAll(openExplorer())
    expect(() => fetchPathDetails(query, "src", true, true)).toThrow(/not a file/)
  })

  it("throws when mentions are missing", () => {
    const query = asQueryAll(openExplorer())
    expect(() => fetchPathDetails(query, "src/helper.ts", false, true)).toThrow(/mentions table missing/)
  })

  it("returns no owners when codeowners tables are absent", () => {
    const details = fetchPathDetails(asQueryAll(openExplorer()), "src/helper.ts", true, false)
    expect(details.owners).toEqual([])
  })
})
