import { SQL } from "./queries.js"
import type { TreeNode } from "./types.js"

export const ROOT_TREE_KEY = "\0roots";

export function treeCacheKey(parent: string | null): string {
  return parent === null ? ROOT_TREE_KEY : parent;
}

export type QueryAll = <T extends Record<string, unknown>>(sql: string, ...bind: unknown[]) => T[];

type TreeRow = {
  relative_path: string;
  summary: string | null;
};

function toNode(row: TreeRow, kind: "dir" | "file"): TreeNode {
  return {
    path: row.relative_path,
    kind,
    summary: row.summary,
  };
}

export function listTree(queryAll: QueryAll, parent: string | null): TreeNode[] {
  const nodes: TreeNode[] = [];
  if (parent === null) {
    for (const dir of queryAll<TreeRow>(SQL.roots)) {
      nodes.push(toNode(dir, "dir"));
    }
    for (const file of queryAll<TreeRow>(SQL.rootFiles)) {
      nodes.push(toNode(file, "file"));
    }
    return nodes;
  }

  for (const dir of queryAll<TreeRow>(SQL.childDirs, parent)) {
    nodes.push(toNode(dir, "dir"));
  }
  for (const file of queryAll<TreeRow>(SQL.childFiles, parent)) {
    nodes.push(toNode(file, "file"));
  }
  return nodes;
}
