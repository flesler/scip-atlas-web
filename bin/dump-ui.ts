#!/usr/bin/env node
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { joinMeta } from "../src/format.js"
import { listTables, tableSchema } from "../src/inspect.js"
import { SQL } from "../src/queries.js"
import { listTree } from "../src/tree.js"

type DumpReport = {
  dbPath: string;
  bytes: number;
  tables: ReturnType<typeof listTables>;
  nullStats: Record<string, Record<string, { nulls: number; total: number }>>;
  roots: ReturnType<typeof listTree>;
  samples: {
    file: Record<string, unknown> | null;
    dir: Record<string, unknown> | null;
  };
};

function queryAll<T extends Record<string, unknown>>(db: Database.Database, sql: string, ...bind: unknown[]): T[] {
  return db.prepare(sql).all(...bind) as T[];
}

function nullStatsForTable(db: Database.Database, table: string): Record<string, { nulls: number; total: number }> {
  const allowed = new Set(listTables((sql, ...bind) => queryAll(db, sql, ...bind)).map((row) => row.name));
  const columns = tableSchema((sql, ...bind) => queryAll(db, sql, ...bind), table, allowed);
  const total = Number(queryAll<{ count: number }>(db, `SELECT COUNT(*) AS count FROM "${table}"`)[0]?.count ?? 0);
  const stats: Record<string, { nulls: number; total: number }> = {};
  for (const column of columns) {
    const nulls = Number(
      queryAll<{ nulls: number }>(db, `SELECT COUNT(*) AS nulls FROM "${table}" WHERE "${column.name}" IS NULL`)[0]
        ?.nulls ?? 0,
    );
    stats[column.name] = { nulls, total };
  }
  return stats;
}

export function dumpExplorerUi(dbPath: string): DumpReport {
  const resolved = path.resolve(dbPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`database not found: ${resolved}`);
  }

  const db = new Database(resolved, { readonly: true });
  const query = ((sql: string, ...bind: unknown[]) => queryAll(db, sql, ...bind)) as Parameters<typeof listTables>[0];

  const tables = listTables(query);
  const nullStats: DumpReport["nullStats"] = {};
  for (const table of ["files", "dirs"] as const) {
    if (tables.some((row) => row.name === table)) {
      nullStats[table] = nullStatsForTable(db, table);
    }
  }

  const roots = listTree(query, null);

  const firstFile = queryAll<{ relative_path: string }>(
    db,
    `SELECT relative_path FROM files ORDER BY relative_path LIMIT 1`,
  )[0];
  const firstDir = queryAll<{ relative_path: string }>(
    db,
    `SELECT relative_path FROM dirs WHERE relative_path != '' ORDER BY relative_path LIMIT 1`,
  )[0];
  const file = firstFile ? queryAll<Record<string, unknown>>(db, SQL.fileOverlay, firstFile.relative_path)[0] ?? null : null;
  const dir = firstDir ? queryAll<Record<string, unknown>>(db, SQL.dirOverlay, firstDir.relative_path)[0] ?? null : null;

  const bytes = fs.statSync(resolved).size;
  db.close();

  return { dbPath: resolved, bytes, tables, nullStats, roots, samples: { file, dir } };
}

function printReport(report: DumpReport) {
  console.log(`# ${report.dbPath} (${(report.bytes / 1024).toFixed(1)} KB)`);
  console.log("\n## tables");
  for (const table of report.tables) {
    console.log(`- ${table.name}: ${table.rowCount} rows`);
  }

  for (const [table, stats] of Object.entries(report.nullStats)) {
    console.log(`\n## nulls in ${table}`);
    for (const [column, counts] of Object.entries(stats)) {
      if (counts.nulls === 0) {
        continue;
      }
      const pct = counts.total ? ((counts.nulls / counts.total) * 100).toFixed(0) : "0";
      console.log(`- ${column}: ${counts.nulls}/${counts.total} (${pct}%)`);
    }
  }

  console.log("\n## tree roots");
  for (const node of report.roots) {
    const meta = joinMeta([
      node.author,
      node.commitTime ? new Date(node.commitTime * 1000).toISOString().slice(0, 10) : "",
    ]);
    console.log(`- [${node.kind}] ${node.path || "/"}${meta ? ` — ${meta}` : ""}`);
  }

  console.log("\n## sample file overlay");
  console.log(report.samples.file ?? "(none)");

  console.log("\n## sample dir overlay");
  console.log(report.samples.dir ?? "(none)");
}

function main() {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error("Usage: npx tsx bin/dump-ui.ts <explorer.db>");
    process.exit(1);
  }
  const report = dumpExplorerUi(dbPath);
  printReport(report);
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main();
}
