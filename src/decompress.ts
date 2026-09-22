export function isGzip(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, 2);
  return head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;
}

export function isGzipFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".gz");
}

export async function maybeDecompress(bytes: ArrayBuffer, fileName: string): Promise<ArrayBuffer> {
  if (!isGzip(bytes)) {
    if (isGzipFileName(fileName)) {
      throw new Error("file looks gzip-compressed by name but is not gzip data");
    }
    return bytes;
  }
  return await new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
}
