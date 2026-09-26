import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildExplorerDb } from "../../bin/pack/build.js"

export const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url))

export const SEARCH_FIXTURE = path.join(FIXTURE_DIR, "search.db")
export const EXPLORER_FIXTURE = path.join(FIXTURE_DIR, "explorer.db")
export const INDEX_FIXTURE = path.join(FIXTURE_DIR, "index.db")
export const ATLAS_FIXTURE = path.join(FIXTURE_DIR, "atlas.db")

/** Minimal explorer.db for search behavior — deterministic paths, commits, and symbols. */
export function populateSearchDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE committers (email TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE commits (
      sha TEXT PRIMARY KEY,
      commit_time INTEGER NOT NULL,
      committer_email TEXT NOT NULL,
      message TEXT NOT NULL
    );
    CREATE TABLE files (
      relative_path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      summary TEXT
    );
    CREATE TABLE dirs (
      relative_path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_path TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      summary TEXT
    );
    CREATE TABLE documents (id INTEGER PRIMARY KEY, relative_path TEXT NOT NULL);
    CREATE TABLE global_symbols (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL);
    CREATE TABLE defn_enclosing_ranges (
      id INTEGER PRIMARY KEY,
      document_id INTEGER NOT NULL,
      symbol_id INTEGER NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL
    );
  `)

  const insertCommitter = db.prepare("INSERT INTO committers (email, name) VALUES (?, ?)")
  const insertCommit = db.prepare(
    "INSERT INTO commits (sha, commit_time, committer_email, message) VALUES (?, ?, ?, ?)",
  )
  const insertFile = db.prepare(
    "INSERT INTO files (relative_path, name, commit_sha, summary) VALUES (?, ?, ?, ?)",
  )
  const insertDir = db.prepare(
    "INSERT INTO dirs (relative_path, name, parent_path, commit_sha, summary) VALUES (?, ?, ?, ?, ?)",
  )
  const insertDocument = db.prepare("INSERT INTO documents (id, relative_path) VALUES (?, ?)")
  const insertSymbol = db.prepare("INSERT INTO global_symbols (id, display_name) VALUES (?, ?)")
  const insertDefn = db.prepare(
    "INSERT INTO defn_enclosing_ranges (id, document_id, symbol_id, start_line, end_line) VALUES (?, ?, ?, ?, ?)",
  )

  insertCommitter.run("dev@acme.test", "Dev")
  insertCommit.run("sha-new", 3_000, "dev@acme.test", "newest")
  insertCommit.run("sha-mid", 2_000, "dev@acme.test", "middle")
  insertCommit.run("sha-old", 1_000, "dev@acme.test", "oldest")

  insertFile.run("helper.ts", "helper.ts", "sha-new", null)
  insertFile.run("alpha_pair.ts", "alpha_pair.ts", "sha-mid", null)
  insertFile.run("beta.ts", "beta.ts", "sha-old", null)
  insertFile.run("src/nested.ts", "nested.ts", "sha-old", null)
  insertDir.run("src", "src", "", "sha-old", null)

  insertDocument.run(1, "helper.ts")
  insertDocument.run(2, "alpha_pair.ts")
  insertDocument.run(3, "beta.ts")
  insertDocument.run(4, "src/nested.ts")
  insertSymbol.run(1, "greet")
  insertDefn.run(1, 1, 1, 1, 5)
}

export function buildSearchFixture(outputPath = SEARCH_FIXTURE): void {
  fs.rmSync(outputPath, { force: true })
  const db = new Database(outputPath)
  populateSearchDb(db)
  db.close()
}

export function buildExplorerFixture(outputPath = EXPLORER_FIXTURE): void {
  buildExplorerDb({
    repoPath: FIXTURE_DIR,
    indexPath: INDEX_FIXTURE,
    atlasPath: ATLAS_FIXTURE,
    outputPath,
  })
}

function main(): void {
  buildSearchFixture()
  buildExplorerFixture()
  console.log(`search.db: ${SEARCH_FIXTURE}`)
  console.log(`explorer.db: ${EXPLORER_FIXTURE}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
}
