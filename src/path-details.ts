import { SQL } from "./queries.js"
import type { QueryAll } from "./tree.js"
import type { PathDetails, SymbolRow } from "./types.js"

export function fetchPathDetails(
  queryAll: QueryAll,
  pathValue: string,
  mentionsPresent: boolean,
  ownersPresent: boolean,
): PathDetails {
  const fileOverlay = queryAll<{
    author_name: string
    commit_time: number
    message: string
    summary: string | null
    commit_sha: string
  }>(SQL.fileOverlay, pathValue)[0]
  if (!fileOverlay) {
    throw new Error(`not a file: ${pathValue}`)
  }

  const overlay = {
    author_name: fileOverlay.author_name,
    commit_time: fileOverlay.commit_time,
    message: fileOverlay.message,
    summary: fileOverlay.summary,
    commit_sha: fileOverlay.commit_sha,
  }

  const symbols = queryAll<SymbolRow>(SQL.definedSymbols, pathValue)
  const owners = ownersPresent
    ? queryAll<{ owner_handle: string }>(SQL.fileOwners, pathValue).map((row) => row.owner_handle)
    : []

  if (!mentionsPresent) {
    throw new Error("mentions table missing; run pack / rebuild")
  }
  const deps = queryAll<{ relative_path: string }>(SQL.deps, pathValue, pathValue).map((row) => row.relative_path)
  const rdeps = queryAll<{ relative_path: string }>(SQL.rdeps, pathValue, pathValue).map((row) => row.relative_path)
  return { path: pathValue, kind: "file", overlay, symbols, owners, deps, rdeps }
}
