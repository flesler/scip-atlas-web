const DOWNLOAD_NAME = "scip-atlas-web.html";
const FILE_DOWNLOAD_SOURCE = "__DOWNLOAD_SOURCE__";

function saveBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = DOWNLOAD_NAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadApp() {
  if (location.protocol === "http:" || location.protocol === "https:") {
    const response = await fetch(location.href);
    const blob = await response.blob();
    saveBlob(blob);
    return;
  }

  if (!FILE_DOWNLOAD_SOURCE || FILE_DOWNLOAD_SOURCE === "__DOWNLOAD_SOURCE__") {
    throw new Error("download source is not embedded for file://");
  }
  const html = JSON.parse(FILE_DOWNLOAD_SOURCE) as string;
  saveBlob(new Blob([html], { type: "text/html" }));
}
