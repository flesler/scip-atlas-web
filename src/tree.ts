import { SQL } from "./queries.js"
import type { TreeNode } from "./types.js"

export const ROOT_TREE_KEY = "\0roots";

export function treeCacheKey(parent: string | null): string {
  return parent === null ? ROOT_TREE_KEY : parent;
}

export type QueryAll = <T extends Record<string, unknown>>(sql: string, ...bind: unknown[]) => T[];

export function listTree(queryAll: QueryAll, parent: string | null): TreeNode[] {
  const nodes: TreeNode[] = [];
  if (parent === null) {
    const dirs = queryAll<{
      relative_path: string;
      last_author_name: string | null;
      last_commit_time: number | null;
      last_subject: string | null;
      summary: string | null;
    }>(SQL.roots);
    for (const dir of dirs) {
      nodes.push({
        path: dir.relative_path,
        kind: "dir",
        author: dir.last_author_name,
        commitTime: dir.last_commit_time,
        subject: dir.last_subject,
        summary: dir.summary,
      });
    }
    const files = queryAll<{
      relative_path: string;
      author_name: string;
      commit_time: number;
      subject: string;
      summary: string | null;
    }>(SQL.rootFiles);
    for (const file of files) {
      nodes.push({
        path: file.relative_path,
        kind: "file",
        author: file.author_name,
        commitTime: file.commit_time,
        subject: file.subject,
        summary: file.summary,
      });
    }
    return nodes;
  }

  const childDirs = queryAll<{
    relative_path: string;
    last_author_name: string | null;
    last_commit_time: number | null;
    last_subject: string | null;
    summary: string | null;
  }>(SQL.childDirs, parent);
  for (const dir of childDirs) {
    nodes.push({
      path: dir.relative_path,
      kind: "dir",
      author: dir.last_author_name,
      commitTime: dir.last_commit_time,
      subject: dir.last_subject,
      summary: dir.summary,
    });
  }

  const childFiles = queryAll<{
    relative_path: string;
    author_name: string;
    commit_time: number;
    subject: string;
    summary: string | null;
  }>(SQL.childFiles, `${parent}/%`, parent);
  for (const file of childFiles) {
    nodes.push({
      path: file.relative_path,
      kind: "file",
      author: file.author_name,
      commitTime: file.commit_time,
      subject: file.subject,
      summary: file.summary,
    });
  }
  return nodes;
}
