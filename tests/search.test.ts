import Database from "better-sqlite3"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { buildExplorerDb } from "../bin/pack/build.js"
import { SQL } from "../src/queries.js"

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

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("search SQL", () => {
  it("matches file and dir basenames by prefix on name", () => {
    const db = openExplorer()
    const hits = db.prepare(SQL.search).all("helper", "helper", "helper") as { path: string; name: string; kind: string }[]

    db.close()

    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.name.startsWith("helper"))).toBe(true)
    expect(hits.some((hit) => hit.kind === "file")).toBe(true)
  })

  it("matches files by defined symbol display_name prefix", () => {
    const db = openExplorer()
    const hits = db.prepare(SQL.search).all("greet", "greet", "greet") as { path: string; name: string; kind: string }[]

    db.close()

    expect(hits.some((hit) => hit.path === "src/helper.ts")).toBe(true)
    expect(hits.every((hit) => hit.name !== "greet" || hit.path === "src/helper.ts")).toBe(true)
  })
})
