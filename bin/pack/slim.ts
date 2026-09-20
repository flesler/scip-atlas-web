export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackError";
  }
}

export type PackTable = {
  name: string;
  columns: readonly string[];
};

export type PackIndex = {
  table: string;
  columns: readonly string[];
};

export const SLIM_INDEX_TABLES: readonly PackTable[] = [
  { name: "documents", columns: ["id", "relative_path"] },
  { name: "global_symbols", columns: ["id", "symbol", "display_name", "kind"] },
  {
    name: "defn_enclosing_ranges",
    columns: ["id", "document_id", "symbol_id", "start_line", "end_line"],
  },
  { name: "chunks", columns: ["id", "document_id", "chunk_index", "start_line", "end_line"] },
  { name: "mentions", columns: ["chunk_id", "symbol_id", "role"] },
];

export const SLIM_INDEX_INDEXES: readonly PackIndex[] = [
  { table: "chunks", columns: ["document_id"] },
  { table: "mentions", columns: ["symbol_id"] },
  { table: "mentions", columns: ["chunk_id"] },
  { table: "defn_enclosing_ranges", columns: ["document_id"] },
  { table: "defn_enclosing_ranges", columns: ["symbol_id"] },
];

export const ATLAS_TABLES = ["meta", "commits", "files", "dirs", "search_docs"] as const;

export type ColumnSpec = {
  name: string;
  type: string;
  pk: number;
  notnull: number;
};

export function indexName(index: PackIndex): string {
  return `idx_${index.table}_${index.columns.join("_")}`;
}

export function createIndexSql(index: PackIndex): string {
  const cols = index.columns.join(", ");
  return `CREATE INDEX ${indexName(index)} ON ${index.table}(${cols})`;
}

export function formatColumn(spec: ColumnSpec, inlinePk: boolean): string {
  const parts = [spec.name, spec.type || "TEXT"];
  if (inlinePk && spec.pk) {
    parts.push("PRIMARY KEY");
  }
  if (spec.notnull && !spec.pk) {
    parts.push("NOT NULL");
  }
  return parts.join(" ");
}

export function createTableSql(table: PackTable, specs: ColumnSpec[]): string {
  const pkCols = specs
    .filter((spec) => spec.pk)
    .sort((a, b) => a.pk - b.pk)
    .map((spec) => spec.name);
  const inlinePk = pkCols.length === 1;
  const columns = specs.map((spec) => formatColumn(spec, inlinePk));
  if (pkCols.length > 1) {
    columns.push(`PRIMARY KEY (${pkCols.join(", ")})`);
  }
  return `CREATE TABLE ${table.name} (\n  ${columns.join(",\n  ")}\n)`;
}

export function copyTableSql(table: PackTable, sourceAlias = "scip"): string {
  const cols = table.columns.join(", ");
  return `INSERT INTO main.${table.name} (${cols}) SELECT ${cols} FROM ${sourceAlias}.${table.name}`;
}

export function copyAllColumnsSql(tableName: string, columns: string[], sourceAlias = "atlas"): string {
  const cols = columns.join(", ");
  return `INSERT INTO main.${tableName} (${cols}) SELECT ${cols} FROM ${sourceAlias}.${tableName}`;
}

export function columnSpecs(
  db: { pragma: (table: string) => ColumnSpec[] },
  table: PackTable,
): ColumnSpec[] {
  const rows = db.pragma(table.name);
  const byName = new Map(rows.map((row) => [row.name, row]));
  const missing = table.columns.filter((name) => !byName.has(name));
  if (missing.length) {
    throw new PackError(`source table ${table.name} missing columns: ${missing.join(", ")}`);
  }
  return table.columns.map((name) => byName.get(name)!);
}

export function allColumnSpecs(
  db: { pragma: (table: string) => ColumnSpec[] },
  tableName: string,
): ColumnSpec[] {
  const rows = db.pragma(tableName);
  if (!rows.length) {
    throw new PackError(`source table ${tableName} not found`);
  }
  return rows;
}
