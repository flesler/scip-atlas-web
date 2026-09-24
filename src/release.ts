export function readReleaseFromMeta(doc: Document = document): string | null {
  const raw = doc.querySelector<HTMLMetaElement>('meta[name="release"]')?.content?.trim()
  if (!raw || raw === "__RELEASE__") {
    return null
  }
  return raw
}
