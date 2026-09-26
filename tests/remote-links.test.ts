import { describe, expect, it } from "vitest"
import { commitUrl, fileBlobUrl, lineFragment, remoteFromMetaRow, resolveBlobRef } from "../src/remote-links.js"

const github = {
  host: "github.com",
  owner: "acme",
  repo: "sample-app",
  gitHead: "abc123",
}

describe("remote links", () => {
  it("builds remote info from meta row", () => {
    expect(
      remoteFromMetaRow({
        git_head: "abc",
        github_host: "github.com",
        github_owner: "acme",
        github_repo: "sample-app",
      }),
    ).toEqual({
      host: "github.com",
      owner: "acme",
      repo: "sample-app",
      gitHead: "abc",
    })
    expect(remoteFromMetaRow({ git_head: "abc" })).toBeNull()
  })

  it("builds GitHub blob URLs with line ranges", () => {
    expect(fileBlobUrl(github, "src/helper.ts", "deadbeef")).toBe(
      "https://github.com/acme/sample-app/blob/deadbeef/src/helper.ts",
    )
    expect(fileBlobUrl(github, "src/helper.ts", "deadbeef", 10, 10)).toBe(
      "https://github.com/acme/sample-app/blob/deadbeef/src/helper.ts#L10",
    )
    expect(fileBlobUrl(github, "src/helper.ts", "deadbeef", 10, 20)).toBe(
      "https://github.com/acme/sample-app/blob/deadbeef/src/helper.ts#L10-L20",
    )
    expect(lineFragment("github.com", 3, 3)).toBe("#L3")
  })

  it("builds GitLab blob URLs", () => {
    const gitlab = { ...github, host: "gitlab.com" }
    expect(fileBlobUrl(gitlab, "src/a.ts", "ref", 4, 9)).toBe(
      "https://gitlab.com/acme/sample-app/-/blob/ref/src/a.ts#L4-9",
    )
  })

  it("builds commit URLs", () => {
    expect(commitUrl(github, "deadbeef")).toBe("https://github.com/acme/sample-app/commit/deadbeef")
    expect(commitUrl({ ...github, host: "gitlab.com" }, "deadbeef")).toBe(
      "https://gitlab.com/acme/sample-app/-/commit/deadbeef",
    )
  })

  it("prefers per-file commit sha over git head", () => {
    expect(resolveBlobRef(github, "filesha")).toBe("filesha")
    expect(resolveBlobRef(github, null)).toBe("abc123")
    expect(resolveBlobRef({ ...github, gitHead: null }, null)).toBeNull()
  })
})
