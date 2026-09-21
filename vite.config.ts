import { defineConfig, type Plugin } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

const SQLITE_WORKER1_STUB = "\0virtual:sqlite3-worker1-stub";

function stripSqliteWorker1(): Plugin {
  const workerReplacement = "throw new Error('sqlite3Worker1Promiser is disabled');";
  const workerPattern =
    /return new Worker\(new URL\("sqlite3-worker1\.mjs", import\.meta\.url\), \{ type: "module" \}\);/;
  return {
    name: "strip-sqlite-worker1",
    enforce: "pre",
    resolveId(source) {
      if (source.includes("sqlite3-worker1.mjs")) {
        return SQLITE_WORKER1_STUB;
      }
      return null;
    },
    load(id) {
      if (id === SQLITE_WORKER1_STUB) {
        return "export {};";
      }
      return null;
    },
    transform(code) {
      if (!workerPattern.test(code)) {
        return null;
      }
      return code.replace(workerPattern, workerReplacement);
    },
  };
}

const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  base: process.env.GITHUB_ACTIONS && repo ? `/${repo}/` : "/",
  plugins: [stripSqliteWorker1(), viteSingleFile()],
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  build: {
    target: "esnext",
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  worker: {
    format: "es",
  },
});
