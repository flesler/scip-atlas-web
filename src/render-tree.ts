import { treeCacheKey } from "./tree.js";
import type { TreeNode } from "./types.js";

export type TreeRenderState = {
  expanded: Set<string>;
  selectedPath: string;
  treeCache: Map<string, TreeNode[]>;
};

export function renderTreeDepth(state: TreeRenderState, parent: string | null): number {
  const key = treeCacheKey(parent);
  const nodes = state.treeCache.get(key) ?? [];
  let depth = 1;
  for (const node of nodes) {
    if (node.kind === "dir" && state.expanded.has(node.path)) {
      const childDepth = renderTreeDepth(state, node.path);
      if (childDepth >= depth) {
        depth = childDepth + 1;
      }
    }
  }
  return depth;
}
