import type { PackIndex, PackTable } from "./slim.js"

/** SCIP tables + columns kept in explorer.db */
export const EXPLORER_SCIP_TABLES: readonly PackTable[] = [
  { name: "documents", columns: ["id", "relative_path"] },
  { name: "global_symbols", columns: ["id", "display_name"] },
  { name: "defn_enclosing_ranges", columns: ["id", "document_id", "symbol_id", "start_line", "end_line"] },
  { name: "chunks", columns: ["id", "document_id", "start_line", "end_line"] },
  { name: "mentions", columns: ["chunk_id", "symbol_id", "role"] },
]

export const EXPLORER_SCIP_INDEXES: readonly PackIndex[] = [
  { table: "chunks", columns: ["document_id"] },
  { table: "mentions", columns: ["symbol_id"] },
  { table: "mentions", columns: ["chunk_id"] },
  { table: "defn_enclosing_ranges", columns: ["document_id"] },
  { table: "defn_enclosing_ranges", columns: ["symbol_id"] },
]

/** Atlas sidecar tables + columns kept in explorer.db */
export const EXPLORER_ATLAS_TABLES: readonly PackTable[] = [
  { name: "committers", columns: ["email", "name"] },
  { name: "commits", columns: ["sha", "commit_time", "committer_email", "message"] },
  { name: "files", columns: ["relative_path", "name", "commit_sha", "summary"] },
  { name: "dirs", columns: ["relative_path", "name", "parent_path", "commit_sha", "summary"] },
]

export const EXPLORER_ATLAS_INDEXES: readonly PackIndex[] = [
  { table: "files", columns: ["name"] },
  { table: "dirs", columns: ["name"] },
  { table: "dirs", columns: ["parent_path"] },
]
