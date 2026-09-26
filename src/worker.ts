/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm"
import sqlite3Wasm from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url"
import { maybeDecompress } from "./decompress.js"
import { detectExplorerMode, validateExplorerDb } from "./explorer-schema.js"
import { listAllowedTables, listTables, tableRows, tableSchema, type QueryAll } from "./inspect.js"
import { fetchPathDetails } from "./path-details.js"
import { SQL } from "./queries.js"
import { runSearch } from "./search-query.js"
import { listTree } from "./tree.js"
import type { HealthInfo, PathDetails, WorkerRequest, WorkerResponse } from "./types.js"

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


async function loadDatabase(bytes: ArrayBuffer, fileName: string) {
  const module = await getSqlite3();
  const raw = await maybeDecompress(bytes, fileName);
  const conn = openFromBuffer(module, new Uint8Array(raw));
  const tables = new Set(tableNames(conn));
  const chunkColumns = queryAll<{ name: string }>(conn, SQL.chunkColumns).map((row) => row.name);
  validateExplorerDb(tables, chunkColumns);
  const resolvedMode = detectExplorerMode(tables);

  db = conn;
  loadedBytes = raw.byteLength;
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
  const conn = db
  if (!conn) {
    throw new Error("no database loaded")
  }
  return fetchPathDetails((sql, ...bind) => queryAll(conn, sql, ...bind), pathValue, mentionsPresent)
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

function search(query: string) {
  const conn = db
  if (!conn) {
    return [];
  }
  return runSearch((sql, ...bind) => queryAll(conn, sql, ...bind), query)
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
