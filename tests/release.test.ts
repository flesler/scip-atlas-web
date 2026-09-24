import { describe, expect, it } from "vitest"
import { readReleaseFromMeta } from "../src/release.js"

function metaDoc(content: string | undefined): Document {
  return {
    querySelector: (selector: string) => {
      if (selector !== 'meta[name="release"]') {
        return null
      }
      return content === undefined ? null : { content }
    },
  } as Document
}

describe("readReleaseFromMeta", () => {
  it("reads meta content", () => {
    expect(readReleaseFromMeta(metaDoc("abc1234"))).toBe("abc1234")
  })

  it("ignores build placeholder", () => {
    expect(readReleaseFromMeta(metaDoc("__RELEASE__"))).toBeNull()
  })

  it("uses first 7 characters", () => {
    expect(readReleaseFromMeta(metaDoc("deadbeef0123456789"))).toBe("deadbee")
  })
})
