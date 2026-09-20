import fs from "node:fs"
import path from "node:path"

const marker = "__DOWNLOAD_SOURCE__";
const distDir = path.resolve("dist");
const htmlPath = path.join(distDir, "index.html");
let html = fs.readFileSync(htmlPath, "utf8");

html = html.replace(
  /new Worker\(new URL\([^)]*sqlite3-worker1[^)]*\)[^)]*\)/g,
  '(()=>{throw new Error("sqlite3Worker1Promiser is disabled")})()',
);

const source = html.replaceAll(marker, "");
html = html.replaceAll(marker, JSON.stringify(source));
fs.writeFileSync(htmlPath, html);

for (const entry of fs.readdirSync(distDir)) {
  if (entry !== "index.html") {
    fs.rmSync(path.join(distDir, entry), { recursive: true, force: true });
  }
}
