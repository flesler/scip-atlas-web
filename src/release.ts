const RELEASE_SHA_LENGTH = 7

export function shortReleaseSha(value: string): string {
  return value.slice(0, RELEASE_SHA_LENGTH)
}

export function readReleaseFromMeta(doc: Document = document): string | null {
  const raw = doc.querySelector<HTMLMetaElement>('meta[name="release"]')?.content?.trim()
  if (!raw || raw === "__RELEASE__") {
    return null
  }
  return shortReleaseSha(raw)
}
