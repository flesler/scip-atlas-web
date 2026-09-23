const DOWNLOAD_NAME = "scip-atlas-web.html";

function saveBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = DOWNLOAD_NAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function canDownloadApp(isProd = import.meta.env.PROD, protocol?: string): boolean {
  if (!isProd) {
    return false
  }
  const resolved = protocol ?? location.protocol
  return resolved === "http:" || resolved === "https:"
}

export async function downloadApp() {
  if (!canDownloadApp()) {
    throw new Error("download is only available on http(s) pages")
  }
  const response = await fetch(location.href)
  const blob = await response.blob()
  saveBlob(blob)
}
