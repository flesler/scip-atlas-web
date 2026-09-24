import { execSync } from "node:child_process"

const RELEASE_SHA_LENGTH = 7

export function shortReleaseSha(value: string): string {
  return value.slice(0, RELEASE_SHA_LENGTH)
}

export function resolveRelease(): string {
  if (process.env.RELEASE) {
    return shortReleaseSha(process.env.RELEASE)
  }
  if (process.env.GITHUB_SHA) {
    return shortReleaseSha(process.env.GITHUB_SHA)
  }
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim()
  } catch {
    return "dev"
  }
}

export function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
}

export function releaseMetaTag(release = resolveRelease()): string {
  return `<meta name="release" content="${escapeAttr(release)}" />`
}
