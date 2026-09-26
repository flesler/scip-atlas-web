export type ExplorerMode = "explorer" | "invalid"

export function detectExplorerMode(tables: ReadonlySet<string>): ExplorerMode {
  if (tables.has("files") && tables.has("committers") && tables.has("documents")) {
    return "explorer"
  }
  return "invalid"
}

export function validateExplorerDb(tables: ReadonlySet<string>, chunkColumns: readonly string[]): void {
  if (chunkColumns.includes("occurrences")) {
    throw new Error("full index.db detected; run pack to build explorer.db")
  }
  if (!tables.has("files") || !tables.has("committers") || !tables.has("commits")) {
    throw new Error("expected explorer.db from pack")
  }
  if (detectExplorerMode(tables) === "invalid") {
    throw new Error("expected explorer.db from pack")
  }
}
