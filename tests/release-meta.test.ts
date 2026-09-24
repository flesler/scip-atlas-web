import { describe, expect, it } from "vitest"
import { escapeAttr, releaseMetaTag, shortReleaseSha } from "../vite/release-meta.js"
import { reorderInlinedHtml } from "../vite/reorder-inlined-html.js"

describe("release meta", () => {
  it("escapes attribute values", () => {
    expect(escapeAttr(`a"b&c`)).toBe(`a&quot;b&amp;c`)
  })

  it("shortens to 7 characters", () => {
    expect(shortReleaseSha("deadbeef0123456789")).toBe("deadbee")
  })

  it("renders a release meta tag", () => {
    expect(releaseMetaTag("abc1234")).toBe(`<meta name="release" content="abc1234" />`)
  })

  it("includes release meta in reordered html", () => {
    const html = reorderInlinedHtml(
      `<!doctype html><html><head><title>T</title><script type="module">console.log(1)</script><style>body{}</style></head><body><div id="app"></div></body></html>`,
      "deadbeef",
    )
    expect(html).toContain(`<meta name="release" content="deadbeef" />`)
  })
})
