import Database from "better-sqlite3"
import fs from "node:fs"
import type { QueryAll } from "../src/tree.js"
import {
  ATLAS_FIXTURE,
  buildExplorerFixture,
  EXPLORER_FIXTURE,
  FIXTURE_DIR,
  INDEX_FIXTURE,
  populateSearchDb,
  SEARCH_FIXTURE,
} from "./fixtures/bootstrap.js"

export { ATLAS_FIXTURE, EXPLORER_FIXTURE, FIXTURE_DIR, INDEX_FIXTURE, SEARCH_FIXTURE }

export type FixtureName = "search" | "explorer"

const memoryFixtures: Partial<Record<FixtureName, Database.Database>> = {}

function openSearchFixture(): Database.Database {
  let db = memoryFixtures.search
  if (!db) {
    db = new Database(":memory:")
    populateSearchDb(db)
    memoryFixtures.search = db
  }
  return db
}

function openExplorerFixture(): Database.Database {
  let db = memoryFixtures.explorer
  if (!db) {
    if (!fs.existsSync(EXPLORER_FIXTURE) || fs.statSync(EXPLORER_FIXTURE).size === 0) {
      buildExplorerFixture()
    }
    db = new Database(fs.readFileSync(EXPLORER_FIXTURE), { readonly: true })
    memoryFixtures.explorer = db
  }
  return db
}

/** Shared in-memory fixture — do not close between tests. */
export function openFixture(name: FixtureName): Database.Database {
  if (name === "search") {
    return openSearchFixture()
  }
  return openExplorerFixture()
}

/** Packed sample-app explorer.db (loaded into memory once per process). */
export function openExplorer(): Database.Database {
  return openFixture("explorer")
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
