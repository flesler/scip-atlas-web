import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import { checkpointAtlas, finalizeExplorer, formatSummaryWarning, missingSummaryCoverages } from "./atlas.js"
import type { ResolvedPaths } from "./paths.js"
import {
  ATLAS_INDEXES,
  ATLAS_TABLES,
  PackError,
  SLIM_INDEX_INDEXES,
  SLIM_INDEX_TABLES,
  columnSpecs,
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
    for (const table of ["committers", "commits", "files", "dirs"]) {
      if (!atlasTables.has(table)) {
        throw new PackError(`atlas missing ${table}; run scip-atlas sync first`);
      }
    }

    main.exec(`ATTACH DATABASE '${indexPath.replace(/'/g, "''")}' AS scip`);
    main.exec(`ATTACH DATABASE '${atlasPath.replace(/'/g, "''")}' AS atlas`);

    const pragma = (table: string) => pragmaTableInfo(scip, table);

    for (const table of SLIM_INDEX_TABLES) {
      const specs = columnSpecs({ pragma }, table);
      main.exec(createTableSql(table, specs));
      main.exec(copyTableSql(table));
    }

    const atlasPragma = (table: string) => pragmaTableInfo(atlas, table)
    for (const table of ATLAS_TABLES) {
      if (!atlasTables.has(table.name)) {
        throw new PackError(`atlas missing ${table.name}; run scip-atlas sync first`)
      }
      const specs = columnSpecs({ pragma: atlasPragma }, table)
      main.exec(createTableSql(table, specs))
      main.exec(copyTableSql(table, "atlas"))
    }

    const summaryWarning = formatSummaryWarning(missingSummaryCoverages(atlas))
    if (summaryWarning) {
      console.warn(summaryWarning)
    }

    for (const index of SLIM_INDEX_INDEXES) {
      main.exec(createIndexSql(index));
    }
    for (const index of ATLAS_INDEXES) {
      main.exec(createIndexSql(index));
    }

    main.exec("DETACH DATABASE scip");
    main.exec("DETACH DATABASE atlas");
    finalizeExplorer(main);
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
