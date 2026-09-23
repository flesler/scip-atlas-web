import { describe, expect, it } from "vitest"
import { reorderInlinedHtml } from "../vite/reorder-inlined-html.js"

describe("reorderInlinedHtml", () => {
  it("puts CSS in head and JS at the end of body", () => {
    const html = reorderInlinedHtml(
      `<!doctype html><html><head><title>T</title><script type="module">console.log(1)</script><style>body{}</style></head><body><div id="app"></div></body></html>`,
    )

    const headEnd = html.indexOf("</head>")
    const bodyStart = html.indexOf("<body>")
    const styleAt = html.indexOf("<style>")
    const scriptAt = html.lastIndexOf("<script")

    expect(styleAt).toBeGreaterThan(-1)
    expect(scriptAt).toBeGreaterThan(bodyStart)
    expect(styleAt).toBeLessThan(headEnd)
    expect(html.indexOf("<script", bodyStart)).toBe(scriptAt)
  })
})
