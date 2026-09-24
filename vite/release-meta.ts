import { execSync } from "node:child_process"

export function resolveRelease(): string {
  if (process.env.RELEASE) {
    return process.env.RELEASE
  }
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA
  }
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim()
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
