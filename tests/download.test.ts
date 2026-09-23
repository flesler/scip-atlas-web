import { describe, expect, it } from "vitest"
import { canDownloadApp } from "../src/download.js"

describe("canDownloadApp", () => {
  it("is false in dev even on http(s)", () => {
    expect(canDownloadApp(false)).toBe(false)
  })

  it("is true only for production http(s) pages", () => {
    expect(canDownloadApp(true, "https:")).toBe(true)
    expect(canDownloadApp(true, "file:")).toBe(false)
  })
})
