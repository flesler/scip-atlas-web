import { defineConfig, type Plugin } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"
import { faviconLink } from "./vite/favicon.js"
import { reorderSingleFileHtml } from "./vite/reorder-inlined-html.js"

function injectFavicon(): Plugin {
  return {
    name: "inject-favicon",
    transformIndexHtml(html) {
      if (html.includes('rel="icon"')) {
        return html
      }
      return html.replace("<title>", `${faviconLink()}\n    <title>`)
    },
  }
}

const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  base: process.env.GITHUB_ACTIONS && repo ? `/${repo}/` : "/",
  plugins: [
    injectFavicon(),
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
  server: {
    port: 5173,
    strictPort: true,
  },
});
