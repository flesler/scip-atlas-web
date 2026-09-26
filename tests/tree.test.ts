import { afterEach, describe, expect, it } from "vitest"
import { renderTreeDepth } from "../src/render-tree.js"
import { ROOT_TREE_KEY, listTree, treeCacheKey } from "../src/tree.js"
import { asQueryAll, cleanupExplorerFixtures, openExplorer, queryAll } from "./open-explorer.js"

afterEach(() => {
  cleanupExplorerFixtures()
})

describe("listTree", () => {
  it("distinguishes roots from children of repo root", () => {
    const db = openExplorer()
    const query = asQueryAll(db)
    const roots = listTree(query, null)
    const repoChildren = listTree(query, "")

    db.close()

    expect(roots.some((node) => node.path === "")).toBe(false)
    expect(roots.some((node) => node.path === "src")).toBe(true)
    expect(repoChildren.some((node) => node.path === "")).toBe(false)
    expect(repoChildren.some((node) => node.path === "src")).toBe(true)
    expect(treeCacheKey(null)).not.toBe(treeCacheKey(""))
  })

  it("lists direct files under a dir without files.folder", () => {
    const db = openExplorer()
    const query = asQueryAll(db)
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
  })

  it("does not recurse infinitely when repo root is expanded", () => {
    const db = openExplorer()
    const query = asQueryAll(db)
    const cache = new Map<string, ReturnType<typeof listTree>>()
    cache.set(ROOT_TREE_KEY, listTree(query, null))
    cache.set("", listTree(query, ""))

    const state = {
      expanded: new Set(["src"]),
      selectedPath: "",
      treeCache: cache,
    }

    db.close()
    expect(() => renderTreeDepth(state, null)).not.toThrow()
    expect(renderTreeDepth(state, null)).toBeLessThan(10)
  })
})
