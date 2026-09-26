import { EXPLORER_ATLAS_OPTIONAL_TABLES, EXPLORER_ATLAS_TABLES, EXPLORER_SCIP_TABLES } from "../bin/pack/schema.js"
import { formatDbCell } from "./format.js"

export type InspectTable = {
  name: string;
  type: string;
  rowCount: number;
};

export type InspectColumn = {
  name: string;
  type: string;
  notnull: number;
  pk: number;
};

export type InspectRows = {
  table: string;
  columns: string[];
  rows: string[][];
  rowCount: number;
  offset: number;
  limit: number;
};

export type QueryAll = <T extends Record<string, unknown>>(sql: string, ...bind: unknown[]) => T[];

const SCIP_CLI_TABLES = new Set(EXPLORER_SCIP_TABLES.map((table) => table.name))
const SCIP_ATLAS_TABLES = new Set([
  ...EXPLORER_ATLAS_TABLES.map((table) => table.name),
  ...EXPLORER_ATLAS_OPTIONAL_TABLES.map((table) => table.name),
  "meta",
]);

export type InspectTableGroup = {
  id: "scip-cli" | "scip-atlas" | "other";
  label: string;
  tables: InspectTable[];
};

export function flattenInspectTableNames(groups: InspectTableGroup[]): string[] {
  const names: string[] = []
  for (const group of groups) {
    for (const table of group.tables) {
      names.push(table.name)
    }
  }
  return names
}

export function groupInspectTables(tables: InspectTable[]): InspectTableGroup[] {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const groups: InspectTableGroup[] = [
    {
      id: "scip-cli",
      label: "scip-cli",
      tables: [...SCIP_CLI_TABLES]
        .map((name) => byName.get(name))
        .filter((table): table is InspectTable => table !== undefined),
    },
    {
      id: "scip-atlas",
      label: "scip-atlas",
      tables: [...SCIP_ATLAS_TABLES]
        .map((name) => byName.get(name))
        .filter((table): table is InspectTable => table !== undefined),
    },
  ];

  const known = new Set([...SCIP_CLI_TABLES, ...SCIP_ATLAS_TABLES]);
  const other = tables.filter((table) => !known.has(table.name));
  if (other.length) {
    groups.push({ id: "other", label: "Other", tables: other });
  }
  return groups;
}

export function isBrowsableTable(_name: string): boolean {
  return true
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function assertTableName(name: string, allowed: ReadonlySet<string>): void {
  if (!allowed.has(name)) {
    throw new Error(`unknown table: ${name}`);
  }
}

export function listAllowedTables(queryAll: QueryAll): string[] {
  const rows = queryAll<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  );
  return rows.map((row) => row.name).filter(isBrowsableTable);
}

export function listTables(queryAll: QueryAll): InspectTable[] {
  const names = listAllowedTables(queryAll);
  return names.map((name) => {
    const typeRow = queryAll<{ type: string }>(
      `SELECT type FROM sqlite_master WHERE type = 'table' AND name = ?`,
      name,
    )[0];
    const countRow = queryAll<{ count: number }>(`SELECT COUNT(*) AS count FROM ${quoteIdent(name)}`)[0];
    return {
      name,
      type: typeRow?.type ?? "table",
      rowCount: Number(countRow?.count ?? 0),
    };
  });
}

export function tableSchema(queryAll: QueryAll, table: string, allowed: ReadonlySet<string>): InspectColumn[] {
  assertTableName(table, allowed);
  return queryAll<{
    name: string;
    type: string;
    notnull: number;
    pk: number;
  }>(`PRAGMA table_info(${table})`).map((row) => ({
    name: row.name,
    type: row.type || "TEXT",
    notnull: row.notnull,
    pk: row.pk,
  }));
}

export function tableRows(
  queryAll: QueryAll,
  table: string,
  allowed: ReadonlySet<string>,
  limit = 100,
  offset = 0,
): InspectRows {
  assertTableName(table, allowed);
  const columns = tableSchema(queryAll, table, allowed).map((col) => col.name);
  const countRow = queryAll<{ count: number }>(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`)[0];
  const rawRows = queryAll<Record<string, unknown>>(
    `SELECT * FROM ${quoteIdent(table)} LIMIT ? OFFSET ?`,
    limit,
    offset,
  );
  return {
    table,
    columns,
    rows: rawRows.map((row) => columns.map((column) => formatDbCell(row[column]))),
    rowCount: Number(countRow?.count ?? 0),
    offset,
    limit,
  };
}
