import { gzipSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { isGzip, isGzipFileName, maybeDecompress } from "../src/decompress.js"

describe("maybeDecompress", () => {
  it("returns raw bytes for uncompressed sqlite payloads", async () => {
    const bytes = new TextEncoder().encode("SQLite format 3\0").buffer
    const out = await maybeDecompress(bytes, "explorer.db")
    expect(out).toBe(bytes)
  })

  it("decompresses gzip by magic bytes", async () => {
    const raw = new TextEncoder().encode("SQLite format 3\0").buffer
    const gz = gzipSync(Buffer.from(raw))
    const out = await maybeDecompress(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength), "explorer.db")
    expect(new TextDecoder().decode(out)).toBe("SQLite format 3\0")
  })

  it("decompresses gzip when the file name ends with .gz", async () => {
    const raw = new TextEncoder().encode("packed").buffer
    const gz = gzipSync(Buffer.from(raw))
    const out = await maybeDecompress(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength), "explorer.db.gz")
    expect(new TextDecoder().decode(out)).toBe("packed")
  })

  it("rejects a .gz file that is not gzip data", async () => {
    const bytes = new TextEncoder().encode("not gzip").buffer
    await expect(maybeDecompress(bytes, "explorer.db.gz")).rejects.toThrow(/not gzip data/)
  })
})

describe("gzip helpers", () => {
  it("detects gzip magic and file names", () => {
    const gz = gzipSync(Buffer.from("x"))
    expect(isGzip(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength))).toBe(true)
    expect(isGzipFileName("explorer.db.gz")).toBe(true)
    expect(isGzipFileName("explorer.db")).toBe(false)
  })

  it("round-trips fixture explorer bytes through gzip", async () => {
    const raw = new TextEncoder().encode("SQLite format 3\0fixture").buffer
    const gz = gzipSync(Buffer.from(raw))
    const out = await maybeDecompress(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength), "explorer.db.gz")
    expect(new TextDecoder().decode(out)).toBe("SQLite format 3\0fixture")
  })
})
