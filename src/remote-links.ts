import type { RemoteInfo } from "./types.js"

export function remoteFromMetaRow(row: {
  git_head?: string | null
  github_host?: string | null
  github_owner?: string | null
  github_repo?: string | null
} | undefined): RemoteInfo | null {
  if (!row?.github_host || !row.github_owner || !row.github_repo) {
    return null
  }
  return {
    host: row.github_host,
    owner: row.github_owner,
    repo: row.github_repo,
    gitHead: row.git_head ?? null,
  }
}

export function isGitLabHost(host: string): boolean {
  return host.toLowerCase().includes("gitlab")
}

function encodeRepoPath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/")
}

export function lineFragment(host: string, startLine: number, endLine: number): string {
  if (startLine === endLine) {
    return `#L${startLine}`
  }
  if (isGitLabHost(host)) {
    return `#L${startLine}-${endLine}`
  }
  return `#L${startLine}-L${endLine}`
}

export function fileBlobUrl(
  remote: RemoteInfo,
  path: string,
  ref: string,
  startLine?: number,
  endLine?: number,
): string {
  const pathPart = encodeRepoPath(path)
  const base = isGitLabHost(remote.host)
    ? `https://${remote.host}/${remote.owner}/${remote.repo}/-/blob/${ref}/${pathPart}`
    : `https://${remote.host}/${remote.owner}/${remote.repo}/blob/${ref}/${pathPart}`
  if (startLine === undefined) {
    return base
  }
  const end = endLine ?? startLine
  return `${base}${lineFragment(remote.host, startLine, end)}`
}

export function commitUrl(remote: RemoteInfo, sha: string): string {
  if (isGitLabHost(remote.host)) {
    return `https://${remote.host}/${remote.owner}/${remote.repo}/-/commit/${sha}`
  }
  return `https://${remote.host}/${remote.owner}/${remote.repo}/commit/${sha}`
}

export function resolveBlobRef(remote: RemoteInfo, commitSha: string | null | undefined): string | null {
  if (commitSha) {
    return commitSha
  }
  if (remote.gitHead) {
    return remote.gitHead
  }
  return null
}
