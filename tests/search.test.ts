import { afterEach, describe, expect, it } from "vitest"
import {
  buildSearchQuery,
  parseSearchTokens,
  runSearch,
  searchStrategies,
  type SearchMatchStyle,
  type SearchTokenCombine,
} from "../src/search-query.js"
import { asQueryAll, cleanupExplorerFixtures, openExplorer } from "./open-explorer.js"

function searchWith(
  db: ReturnType<typeof openExplorer>,
  tokens: string[],
  style: SearchMatchStyle,
  combine: SearchTokenCombine,
) {
  const { sql, binds } = buildSearchQuery(tokens, style, combine)
  return db.prepare(sql).all(...binds) as { path: string; name: string; kind: string }[]
}

afterEach(() => {
  cleanupExplorerFixtures()
})

describe("search SQL", () => {
  it("tokenizes on whitespace", () => {
    expect(parseSearchTokens("  helper   ts  ")).toEqual(["helper", "ts"])
    expect(parseSearchTokens("")).toEqual([])
  })

  it("matches file and dir basenames by substring on name", () => {
    const db = openExplorer()
    const hits = runSearch(asQueryAll(db), "elper")

    db.close()

    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.name.includes("elper"))).toBe(true)
    expect(hits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
  })

  it("matches files by defined symbol display_name prefix", () => {
    const db = openExplorer()
    const hits = runSearch(asQueryAll(db), "greet")

    db.close()

    expect(hits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
    expect(hits.every((hit) => hit.name !== "greet" || hit.path === "src/helper.ts")).toBe(true)
  })

  it("matches files and dirs by relative_path substring when query contains /", () => {
    const db = openExplorer()
    const hits = runSearch(asQueryAll(db), "/helper.")

    db.close()

    expect(hits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
    expect(hits.every((hit) => hit.path.includes("/helper."))).toBe(true)
  })

  it("does not apply path substring when query has no slash", () => {
    const db = openExplorer()
    const hits = runSearch(asQueryAll(db), "src")

    db.close()

    expect(hits.some((hit) => hit.path === "src" && hit.kind === "dir")).toBe(true)
    expect(hits.some((hit) => hit.path === "src/helper.ts")).toBe(false)
  })

  it("falls back from prefix to substring for a single token", () => {
    const db = openExplorer()
    const prefix = searchWith(db, ["elper"], "prefix", "and")
    const fallback = runSearch(asQueryAll(db), "elper")

    db.close()

    expect(prefix).toHaveLength(0)
    expect(fallback.some((hit) => hit.path === "src/helper.ts")).toBe(true)
  })

  it("uses AND across tokens before OR", () => {
    const db = openExplorer()
    const andHits = searchWith(db, ["helper", "ts"], "substring", "and")
    const andMiss = searchWith(db, ["helper", "nope"], "substring", "and")
    const orHits = searchWith(db, ["helper", "nope"], "substring", "or")
    const fallback = runSearch(asQueryAll(db), "helper nope")

    db.close()

    expect(andHits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
    expect(andMiss).toHaveLength(0)
    expect(orHits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
    expect(fallback.some((hit) => hit.path === "src/helper.ts")).toBe(true)
    expect(searchStrategies(["a", "b"]).length).toBe(4)
  })
})
