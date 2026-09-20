/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm"
import sqlite3Wasm from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url"
import { listAllowedTables, listTables, tableRows, tableSchema, type QueryAll } from "./inspect.js"
import { SQL } from "./queries.js"
import { symbolDisplayName } from "./symbols.js"
import { listTree } from "./tree.js"
import type { HealthInfo, PathDetails, SearchHit, SymbolRow, WorkerRequest, WorkerResponse } from "./types.js"

let db: Database | null = null;
let sqlite3: Sqlite3Static | null = null;
let loadedBytes = 0;
let loadedName: string | null = null;
let mode: HealthInfo["mode"] = "invalid";
let mentionsPresent = false;

async function getSqlite3(): Promise<Sqlite3Static> {
  if (!sqlite3) {
    const init = sqlite3InitModule as (config?: { locateFile?: (file: string) => string }) => Promise<Sqlite3Static>;
    sqlite3 = await init({
      locateFile: () => sqlite3Wasm,
    });
  }
  return sqlite3;
}

function queryAll<T extends Record<string, unknown>>(conn: Database, sql: string, ...bind: unknown[]): T[] {
  const rows = conn.exec({
    sql,
    bind: bind as never,
    rowMode: "object",
    returnValue: "resultRows",
  });
  return rows as unknown as T[];
}

function openFromBuffer(module: Sqlite3Static, bytes: Uint8Array): Database {
  const conn = new module.oo1.DB();
  const pointer = module.wasm.allocFromTypedArray(bytes);
  const rc = module.capi.sqlite3_deserialize(
    conn.pointer!,
    "main",
    pointer,
    bytes.byteLength,
    bytes.byteLength,
    module.capi.SQLITE_DESERIALIZE_FREEONCLOSE | module.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  conn.checkRc(rc);
  return conn;
}

function tableNames(conn: Database): string[] {
  return queryAll<{ name: string }>(conn, SQL.tableNames).map((row) => row.name);
}

function detectMode(conn: Database): HealthInfo["mode"] {
  const tables = new Set(tableNames(conn));
  if (tables.has("files") && tables.has("search_docs_fts") && tables.has("documents")) {
    return "explorer";
  }
  return "invalid";
}

function rejectFullIndex(conn: Database) {
  const cols = queryAll<{ name: string }>(conn, SQL.chunkColumns).map((row) => row.name);
  if (cols.includes("occurrences")) {
    throw new Error("full index.db detected; run pack to build explorer.db");
  }
}

async function loadDatabase(bytes: ArrayBuffer, fileName: string) {
  const module = await getSqlite3();
  const conn = openFromBuffer(module, new Uint8Array(bytes));
  rejectFullIndex(conn);

  const tables = new Set(tableNames(conn));
  if (!tables.has("files") || !tables.has("search_docs_fts")) {
    throw new Error("expected explorer.db from pack");
  }
  if (!tables.has("search_docs")) {
    throw new Error("search_docs missing; run scip-atlas sync and pack");
  }

  const resolvedMode = detectMode(conn);
  if (resolvedMode === "invalid") {
    throw new Error("expected explorer.db from pack");
  }

  db = conn;
  loadedBytes = bytes.byteLength;
  loadedName = fileName;
  mentionsPresent = tables.has("mentions");
  mode = resolvedMode;
}

function tree(parent: string | null) {
  if (!db) {
    return [];
  }
  return listTree((sql, ...bind) => queryAll(db!, sql, ...bind), parent)
}

function node(pathValue: string): PathDetails {
  if (!db) {
    throw new Error("no database loaded")
  }
  const fileOverlay = queryAll<{
    author_name: string
    commit_time: number
    subject: string
    summary: string | null;
  }>(db, SQL.fileOverlay, pathValue)[0]
  const dirOverlay = queryAll<{
    last_author_name: string
    last_commit_time: number
    last_subject: string
    summary: string | null
  }>(db, SQL.dirOverlay, pathValue)[0]

  const kind = fileOverlay ? "file" : "dir"
  const overlay = fileOverlay
    ? {
      author_name: fileOverlay.author_name,
      commit_time: fileOverlay.commit_time,
      subject: fileOverlay.subject,
      summary: fileOverlay.summary,
    }
    : dirOverlay
      ? {
        author_name: dirOverlay.last_author_name,
        commit_time: dirOverlay.last_commit_time,
        subject: dirOverlay.last_subject,
        summary: dirOverlay.summary,
      }
      : null;

  const symbols =
    kind === "file"
      ? queryAll<{
        display_name: string | null
        symbol: string
        start_line: number
        end_line: number
      }>(db, SQL.definedSymbols, pathValue)
        .map((row) => {
          const display_name = symbolDisplayName(row.symbol, row.display_name)
          if (!display_name) {
            return null
          }
            return { ...row, display_name }
          })
        .filter((row): row is SymbolRow => row !== null)
      : [];

  if (!mentionsPresent) {
    throw new Error("mentions table missing; run pack / rebuild");
  }
  const deps =
    kind === "file"
      ? queryAll<{ relative_path: string }>(db, SQL.deps, pathValue, pathValue).map((row) => row.relative_path)
      : []
  const rdeps =
    kind === "file"
      ? queryAll<{ relative_path: string }>(db, SQL.rdeps, pathValue, pathValue).map((row) => row.relative_path)
      : []
  return { path: pathValue, kind, overlay, symbols, deps, rdeps }
}

function inspectQueryAll(): QueryAll {
  return ((sql: string, ...bind: unknown[]) => queryAll(db!, sql, ...bind)) as QueryAll
}

function inspectTables() {
  return listTables(inspectQueryAll())
}

function inspectSchema(table: string) {
  const allowed = new Set(listAllowedTables(inspectQueryAll()))
  return tableSchema(inspectQueryAll(), table, allowed)
}

function inspectRows(table: string, offset = 0, limit = 100) {
  const allowed = new Set(listAllowedTables(inspectQueryAll()))
  return tableRows(inspectQueryAll(), table, allowed, limit, offset)
}

function search(query: string): SearchHit[] {
  if (!db) {
    return [];
  }
  const term = query.trim();
  if (!term) {
    return [];
  }
  return queryAll<SearchHit>(db, SQL.search, term);
}

function health(): HealthInfo {
  return {
    loaded: Boolean(db),
    fileName: loadedName,
    tables: db ? tableNames(db) : [],
    bytes: loadedBytes,
    mode,
    mentionsPresent,
  };
}

function respond(id: number, data: unknown) {
  postMessage({ id, ok: true, data } satisfies WorkerResponse);
}

function respondError(id: number, error: string) {
  postMessage({ id, ok: false, error } satisfies WorkerResponse);
}

addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "load") {
      await loadDatabase(request.bytes, request.fileName);
      respond(request.id, health());
      return;
    }
    if (!db) {
      throw new Error("load a database first");
    }
    if (request.type === "tree") {
      respond(request.id, tree(request.parent));
      return;
    }
    if (request.type === "node") {
      respond(request.id, node(request.path));
      return;
    }
    if (request.type === "search") {
      respond(request.id, search(request.query));
      return;
    }
    if (request.type === "health") {
      respond(request.id, health());
      return;
    }
    if (request.type === "inspectTables") {
      respond(request.id, inspectTables())
      return
    }
    if (request.type === "inspectSchema") {
      respond(request.id, inspectSchema(request.table))
      return
    }
    if (request.type === "inspectRows") {
      respond(request.id, inspectRows(request.table, request.offset ?? 0, request.limit ?? 100))
      return
    }
    throw new Error(`unknown request: ${(request as WorkerRequest).type}`);
  } catch (error) {
    respondError(request.id, error instanceof Error ? error.message : String(error));
  }
});
