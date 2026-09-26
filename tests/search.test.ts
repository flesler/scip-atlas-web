import { describe, expect, it } from "vitest"
import {
  buildSearchQuery,
  parseSearchTokens,
  runSearch,
  searchStrategies,
  type SearchMatchStyle,
  type SearchTokenCombine,
} from "../src/search-query.js"
import type { SearchHit } from "../src/types.js"
import { asQueryAll, openFixture } from "./open-explorer.js"

type ExpectedHit = Pick<SearchHit, "path" | "kind">

function paths(hits: SearchHit[]): string[] {
  return hits.map((hit) => hit.path)
}

function searchWith(
  tokens: string[],
  style: SearchMatchStyle,
  combine: SearchTokenCombine,
): SearchHit[] {
  const db = openFixture("search")
  const { sql, binds } = buildSearchQuery(tokens, style, combine)
  return db.prepare(sql).all(...binds) as SearchHit[]
}

function expectHits(hits: SearchHit[], expected: ExpectedHit[]): void {
  expect(hits.map((hit) => ({ path: hit.path, kind: hit.kind }))).toEqual(expected)
}

function expectDescendingCommitTimes(hits: SearchHit[]): void {
  expect(hits.length).toBeGreaterThanOrEqual(2)
  for (let i = 1; i < hits.length; i++) {
    expect(hits[i].commit_time).toBeLessThanOrEqual(hits[i - 1].commit_time ?? 0)
  }
}

describe("search SQL", () => {
  it("tokenizes on whitespace", () => {
    expect(parseSearchTokens("  helper   ts  ")).toEqual(["helper", "ts"])
    expect(parseSearchTokens("")).toEqual([])
  })

  it.each<[string, ExpectedHit[]]>([
    ["helper", [{ path: "helper.ts", kind: "file" }]],
    ["elper", [{ path: "helper.ts", kind: "file" }]],
    ["greet", [{ path: "helper.ts", kind: "file" }]],
    ["/nested", [{ path: "src/nested.ts", kind: "file" }]],
    ["src", [{ path: "src", kind: "dir" }]],
    [
      "ts",
      [
        { path: "helper.ts", kind: "file" },
        { path: "alpha_pair.ts", kind: "file" },
        { path: "beta.ts", kind: "file" },
        { path: "src/nested.ts", kind: "file" },
      ],
    ],
  ])('search "%s"', (query, expected) => {
    const hits = runSearch(asQueryAll(openFixture("search")), query)
    expectHits(hits, expected)
  })

  it("orders by commit_time descending within the same rank", () => {
    const hits = runSearch(asQueryAll(openFixture("search")), "ts")

    expect(paths(hits)).toEqual(["helper.ts", "alpha_pair.ts", "beta.ts", "src/nested.ts"])
    expect(hits[0]?.commit_time).toBe(3_000)
    expect(hits[1]?.commit_time).toBe(2_000)
    expect(hits[2]?.commit_time).toBe(1_000)
    expectDescendingCommitTimes(hits)
  })

  it("falls back from prefix to substring for a single token", () => {
    expect(searchWith(["elper"], "prefix", "and")).toHaveLength(0)
    const hits = runSearch(asQueryAll(openFixture("search")), "elper")
    expectHits(hits, [{ path: "helper.ts", kind: "file" }])
  })

  it("uses AND across tokens before OR", () => {
    expect(searchWith(["alpha", "pair"], "substring", "and")).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "alpha_pair.ts" })]),
    )
    expect(searchWith(["alpha", "nope"], "substring", "and")).toHaveLength(0)
    expect(searchWith(["alpha", "nope"], "substring", "or")).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "alpha_pair.ts" })]),
    )

    const hits = runSearch(asQueryAll(openFixture("search")), "alpha nope")
    expect(paths(hits)).toEqual(["alpha_pair.ts"])
    expect(searchStrategies(["a", "b"]).length).toBe(4)
  })
})
