import Database from "better-sqlite3"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { buildExplorerDb } from "../bin/pack/build.js"
import { renderTreeDepth } from "../src/render-tree.js"
import { ROOT_TREE_KEY, listTree, treeCacheKey, type QueryAll } from "../src/tree.js"

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const tempDirs: string[] = [];

function openExplorer(): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scip-atlas-web-tree-"));
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

function queryAll<T extends Record<string, unknown>>(db: Database.Database, sql: string, ...bind: unknown[]): T[] {
  return db.prepare(sql).all(...bind) as T[];
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("listTree", () => {
  it("distinguishes roots from children of repo root", () => {
    const db = openExplorer();
    const query = ((sql: string, ...bind: unknown[]) => queryAll(db, sql, ...bind)) as QueryAll;
    const roots = listTree(query, null);
    const repoChildren = listTree(query, "");

    db.close();

    expect(roots.some((node) => node.path === "")).toBe(false);
    expect(roots.some((node) => node.path === "src")).toBe(true);
    expect(repoChildren.some((node) => node.path === "")).toBe(false);
    expect(repoChildren.some((node) => node.path === "src")).toBe(true);
    expect(treeCacheKey(null)).not.toBe(treeCacheKey(""));
  });

  it("lists direct files under a dir without files.folder", () => {
    const db = openExplorer()
    const query = ((sql: string, ...bind: unknown[]) => queryAll(db, sql, ...bind)) as QueryAll
    const expected = queryAll<{ relative_path: string }>(
      db,
      `SELECT relative_path FROM files
       WHERE relative_path LIKE 'src/%'
         AND instr(substr(relative_path, length('src') + 2), '/') = 0
       ORDER BY relative_path`,
    ).map((row) => row.relative_path)
    const srcFiles = listTree(query, "src").filter((node) => node.kind === "file")

    db.close()

    expect(srcFiles.map((node) => node.path)).toEqual(expected)
    expect(srcFiles.length).toBeGreaterThan(0)
  });

  it("does not recurse infinitely when repo root is expanded", () => {
    const db = openExplorer();
    const query = ((sql: string, ...bind: unknown[]) => queryAll(db, sql, ...bind)) as QueryAll;
    const cache = new Map<string, ReturnType<typeof listTree>>();
    cache.set(ROOT_TREE_KEY, listTree(query, null));
    cache.set("", listTree(query, ""));

    const state = {
      expanded: new Set(["src"]),
      selectedPath: "",
      treeCache: cache,
    };

    db.close();
    expect(() => renderTreeDepth(state, null)).not.toThrow();
    expect(renderTreeDepth(state, null)).toBeLessThan(10);
  });
});
