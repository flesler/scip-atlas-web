import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import {
  FTS_CREATE_SQL,
  FTS_POPULATE_SQL,
  checkpointAtlas,
  dropFtsShadowTables,
  formatSummaryWarning,
  missingSummaryCoverages,
} from "./atlas.js"
import type { ResolvedPaths } from "./paths.js"
import {
  ATLAS_TABLES,
  PackError,
  SLIM_INDEX_INDEXES,
  SLIM_INDEX_TABLES,
  allColumnSpecs,
  columnSpecs,
  copyAllColumnsSql,
  copyTableSql,
  createIndexSql,
  createTableSql,
} from "./slim.js"

export type PackResult = {
  indexBytes: number;
  atlasBytes: number;
  outputBytes: number;
  outputPath: string;
};

const DIRS_PARENT_INDEX = { table: "dirs", columns: ["parent_path"] as const };

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function assertFile(filePath: string, label: string): number {
  if (!fs.existsSync(filePath)) {
    throw new PackError(`${label} not found: ${filePath}`);
  }
  return fs.statSync(filePath).size;
}

function pragmaTableInfo(conn: Database.Database, table: string) {
  return conn.pragma(`table_info(${table})`) as {
    name: string;
    type: string;
    pk: number;
    notnull: number;
  }[];
}

export function buildExplorerDb(paths: ResolvedPaths): PackResult {
  const indexPath = path.resolve(paths.indexPath);
  const atlasPath = path.resolve(paths.atlasPath);
  const outputPath = path.resolve(paths.outputPath);

  if (indexPath === outputPath || atlasPath === outputPath) {
    throw new PackError("source and output must differ");
  }

  const indexBytes = assertFile(indexPath, "index");
  const atlasBytes = assertFile(atlasPath, "atlas");

  checkpointAtlas(atlasPath);

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  const main = new Database(outputPath);
  const scip = new Database(indexPath, { readonly: true });
  const atlas = new Database(atlasPath, { readonly: true });

  try {
    const chunkCols = new Set(pragmaTableInfo(scip, "chunks").map((row) => row.name));
    for (const col of ["start_line", "end_line"]) {
      if (!chunkCols.has(col)) {
        throw new PackError(`source chunks missing required column: ${col}`);
      }
    }

    const atlasTables = new Set(
      (atlas.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
        (row) => row.name,
      ),
    );
    if (!atlasTables.has("search_docs")) {
      throw new PackError("atlas has no search_docs; run scip-atlas sync first");
    }

    main.exec(`ATTACH DATABASE '${indexPath.replace(/'/g, "''")}' AS scip`);
    main.exec(`ATTACH DATABASE '${atlasPath.replace(/'/g, "''")}' AS atlas`);

    const pragma = (table: string) => pragmaTableInfo(scip, table);

    for (const table of SLIM_INDEX_TABLES) {
      const specs = columnSpecs({ pragma }, table);
      main.exec(createTableSql(table, specs));
      main.exec(copyTableSql(table));
    }

    for (const tableName of ATLAS_TABLES) {
      const specs = allColumnSpecs({ pragma: (name) => pragmaTableInfo(atlas, name) }, tableName);
      const columns = specs.map((spec) => spec.name);
      main.exec(createTableSql({ name: tableName, columns }, specs));
      main.exec(copyAllColumnsSql(tableName, columns));
    }

    const summaryWarning = formatSummaryWarning(missingSummaryCoverages(atlas))
    if (summaryWarning) {
      console.warn(summaryWarning)
    }

    for (const index of SLIM_INDEX_INDEXES) {
      main.exec(createIndexSql(index));
    }
    main.exec(createIndexSql(DIRS_PARENT_INDEX));

    dropFtsShadowTables(main);
    main.exec(FTS_CREATE_SQL);
    main.exec(FTS_POPULATE_SQL);

    main.exec("DETACH DATABASE scip");
    main.exec("DETACH DATABASE atlas");
  } finally {
    scip.close();
    atlas.close();
    main.close();
  }

  const outputBytes = fs.statSync(outputPath).size;
  console.log(
    `index.db: ${formatMb(indexBytes)} MB + atlas.db: ${formatMb(atlasBytes)} MB -> explorer.db: ${formatMb(outputBytes)} MB`,
  );

  return { indexBytes, atlasBytes, outputBytes, outputPath };
}
