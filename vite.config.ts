import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"
import { reorderSingleFileHtml } from "./vite/reorder-inlined-html.js"

const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  base: process.env.GITHUB_ACTIONS && repo ? `/${repo}/` : "/",
  plugins: [
    viteSingleFile({ removeViteModuleLoader: true }),
    // singlefile inlines where Vite placed tags (JS in head); reorder to CSS-in-head, JS-before-</body>.
    reorderSingleFileHtml(),
  ],
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  build: {
    target: "esnext",
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    modulePreload: false,
  },
  worker: {
    format: "es",
  },
});
