/** Tree listing columns — no commit/git fields. */
export const TREE_DIR = ["relative_path", "summary"] as const
export const TREE_FILE = ["relative_path", "summary"] as const

/** File detail panel (right pane). */
export const FILE_PANEL = ["relative_path", "summary", "author_name", "commit_time", "message"] as const

export const SYMBOL_ROW = ["display_name", "start_line", "end_line"] as const

export function tableCols(alias: string, columns: readonly string[]): string {
  return columns.map((column) => `${alias}.${column}`).join(", ")
}
