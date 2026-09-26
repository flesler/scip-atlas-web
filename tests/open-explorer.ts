import Database from "better-sqlite3"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildExplorerDb } from "../bin/pack/build.js"
import type { QueryAll } from "../src/tree.js"

export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures")

const tempDirs: string[] = []

export function openExplorer(): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scip-atlas-web-explorer-"))
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

export function queryAll<T extends Record<string, unknown>>(
  db: Database.Database,
  sql: string,
  ...bind: unknown[]
): T[] {
  return db.prepare(sql).all(...bind) as T[]
}

export function asQueryAll(db: Database.Database): QueryAll {
  return ((sql: string, ...bind: unknown[]) => queryAll(db, sql, ...bind)) as QueryAll
}

export function cleanupExplorerFixtures(): void {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
