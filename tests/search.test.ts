import Database from "better-sqlite3"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { buildExplorerDb } from "../bin/pack/build.js"
import { buildSearchQuery, searchStrategies, type SearchMatchStyle, type SearchTokenCombine } from "../src/search-query.js"

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures")
const tempDirs: string[] = []

function openExplorer(): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scip-atlas-web-search-"))
  tempDirs.push(dir)
  const output = path.join(dir, "explorer.db")
  buildExplorerDb({
    repoPath: FIXTURE_DIR,
    indexPath: path.join(FIXTURE_DIR, "index.db"),
    atlasPath: path.join(FIXTURE_DIR, "atlas.db"),
    outputPath: output,
  })
  return new Database(output, { readonly: true })
}

function searchWith(
  db: Database.Database,
  tokens: string[],
  style: SearchMatchStyle,
  combine: SearchTokenCombine,
) {
  const { sql, binds } = buildSearchQuery(tokens, style, combine)
  return db.prepare(sql).all(...binds) as { path: string; name: string; kind: string }[]
}

function searchWithFallbacks(db: Database.Database, query: string) {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  for (const strategy of searchStrategies(tokens)) {
    const hits = searchWith(db, tokens, strategy.style, strategy.combine)
    if (hits.length) {
      return hits
    }
  }
  return []
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("search SQL", () => {
  it("matches file and dir basenames by substring on name", () => {
    const db = openExplorer()
    const hits = searchWithFallbacks(db, "elper")

    db.close()

    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.name.includes("elper"))).toBe(true)
    expect(hits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
  })

  it("matches files by defined symbol display_name prefix", () => {
    const db = openExplorer()
    const hits = searchWithFallbacks(db, "greet")

    db.close()

    expect(hits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
    expect(hits.every((hit) => hit.name !== "greet" || hit.path === "src/helper.ts")).toBe(true)
  })

  it("matches files and dirs by relative_path substring when query contains /", () => {
    const db = openExplorer()
    const hits = searchWithFallbacks(db, "/helper.")

    db.close()

    expect(hits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
    expect(hits.every((hit) => hit.path.includes("/helper."))).toBe(true)
  })

  it("does not apply path substring when query has no slash", () => {
    const db = openExplorer()
    const hits = searchWithFallbacks(db, "src")

    db.close()

    expect(hits.some((hit) => hit.path === "src" && hit.kind === "dir")).toBe(true)
    expect(hits.some((hit) => hit.path === "src/helper.ts")).toBe(false)
  })

  it("falls back from prefix to substring for a single token", () => {
    const db = openExplorer()
    const prefix = searchWith(db, ["elper"], "prefix", "and")
    const fallback = searchWithFallbacks(db, "elper")

    db.close()

    expect(prefix).toHaveLength(0)
    expect(fallback.some((hit) => hit.path === "src/helper.ts")).toBe(true)
  })

  it("uses AND across tokens before OR", () => {
    const db = openExplorer()
    const andHits = searchWith(db, ["helper", "ts"], "substring", "and")
    const andMiss = searchWith(db, ["helper", "nope"], "substring", "and")
    const orHits = searchWith(db, ["helper", "nope"], "substring", "or")
    const fallback = searchWithFallbacks(db, "helper nope")

    db.close()

    expect(andHits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
    expect(andMiss).toHaveLength(0)
    expect(orHits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
    expect(fallback.some((hit) => hit.path === "src/helper.ts")).toBe(true)
  })
})
