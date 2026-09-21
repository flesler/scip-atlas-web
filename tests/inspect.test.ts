import Database from "better-sqlite3"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { buildExplorerDb } from "../bin/pack/build.js"
import { groupInspectTables, listTables, tableRows, tableSchema, type QueryAll } from "../src/inspect.js"

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const tempDirs: string[] = [];

function openExplorer(): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scip-atlas-web-inspect-"));
  tempDirs.push(dir);
  const output = path.join(dir, "explorer.db");
  buildExplorerDb({
    repoPath: FIXTURE_DIR,
    indexPath: path.join(FIXTURE_DIR, "index.db"),
    atlasPath: path.join(FIXTURE_DIR, "atlas.db"),
    outputPath: output,
  });
  return new Database(output, { readonly: true });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("inspect", () => {
  it("lists atlas and scip tables from explorer.db", () => {
    const db = openExplorer();
    const query = ((sql: string, ...bind: unknown[]) => db.prepare(sql).all(...bind)) as QueryAll;
    const tables = listTables(query);
    db.close();

    expect(tables.some((table) => table.name === "files")).toBe(true);
    expect(tables.some((table) => table.name === "committers")).toBe(true)
    expect(tables.some((table) => table.name === "documents")).toBe(true);
  });

  it("groups tables into scip-cli, scip-atlas, and other", () => {
    const db = openExplorer();
    const query = ((sql: string, ...bind: unknown[]) => db.prepare(sql).all(...bind)) as QueryAll;
    const groups = groupInspectTables(listTables(query));
    db.close();

    const byId = new Map(groups.map((group) => [group.id, group.tables.map((table) => table.name)]));
    expect(byId.get("scip-cli")).toEqual(
      expect.arrayContaining(["documents", "mentions", "chunks", "global_symbols", "defn_enclosing_ranges"]),
    );
    expect(byId.get("scip-atlas")).toEqual(
      expect.arrayContaining(["committers", "commits", "files", "dirs"]),
    );
    expect(byId.has("other")).toBe(false);
  });

  it("returns schema and rows with NULL rendered explicitly", () => {
    const db = openExplorer();
    const query = ((sql: string, ...bind: unknown[]) => db.prepare(sql).all(...bind)) as QueryAll;
    const allowed = new Set(listTables(query).map((table) => table.name));
    const schema = tableSchema(query, "files", allowed);
    const rows = tableRows(query, "files", allowed, 5, 0);
    db.close();

    expect(schema.some((column) => column.name === "summary")).toBe(true);
    expect(rows.columns).toContain("summary");
    expect(rows.rows.some((row) => row.includes("NULL"))).toBe(true);
  });
});
