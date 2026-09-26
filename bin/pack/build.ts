import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { checkpointAtlas, finalizeExplorer, formatSummaryWarning, missingSummaryCoverages } from "./atlas.js"
import { copyMetaIfPresent } from "./meta.js"
import { compressedOutputPath, explorerDbPath, type ResolvedPaths } from "./paths.js"
import {
  EXPLORER_ATLAS_INDEXES,
  EXPLORER_ATLAS_OPTIONAL_INDEXES,
  EXPLORER_ATLAS_OPTIONAL_TABLES,
  EXPLORER_ATLAS_TABLES,
  EXPLORER_SCIP_INDEXES,
  EXPLORER_SCIP_TABLES,
} from "./schema.js"
import {
  PackError,
  columnSpecs,
  copyTableSql,
  createIndexSql,
  createTableSql,
} from "./slim.js"
import { copyGlobalSymbols } from "./symbols.js"

export type PackResult = {
  indexBytes: number;
  atlasBytes: number;
  outputBytes: number;
  outputPath: string;
  uncompressedBytes?: number
}

export type BuildExplorerOptions = {
  compress?: boolean
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

export function buildExplorerDb(paths: ResolvedPaths, options: BuildExplorerOptions = {}): PackResult {
  const indexPath = path.resolve(paths.indexPath);
  const atlasPath = path.resolve(paths.atlasPath);
  const finalPath = path.resolve(
    options.compress ? compressedOutputPath(paths.outputPath) : paths.outputPath,
  )
  const dbPath = explorerDbPath(finalPath);

  if (indexPath === dbPath || atlasPath === dbPath || indexPath === finalPath || atlasPath === finalPath) {
    throw new PackError("source and output must differ");
  }

  const indexBytes = assertFile(indexPath, "index");
  const atlasBytes = assertFile(atlasPath, "atlas");

  checkpointAtlas(atlasPath);

  for (const filePath of [dbPath, finalPath]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  const main = new Database(dbPath);
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

    for (const table of EXPLORER_SCIP_TABLES) {
      const specs = columnSpecs({ pragma }, table);
      main.exec(createTableSql(table, specs));
      if (table.name === "global_symbols") {
        copyGlobalSymbols(main, scip);
      } else {
        main.exec(copyTableSql(table));
      }
    }

    const atlasPragma = (table: string) => pragmaTableInfo(atlas, table)
    for (const table of EXPLORER_ATLAS_TABLES) {
      if (!atlasTables.has(table.name)) {
        throw new PackError(`atlas missing ${table.name}; run scip-atlas sync first`)
      }
      const specs = columnSpecs({ pragma: atlasPragma }, table)
      main.exec(createTableSql(table, specs))
      main.exec(copyTableSql(table, "atlas"))
    }

    for (const table of EXPLORER_ATLAS_OPTIONAL_TABLES) {
      if (!atlasTables.has(table.name)) {
        continue
      }
      const specs = columnSpecs({ pragma: atlasPragma }, table)
      main.exec(createTableSql(table, specs))
      main.exec(copyTableSql(table, "atlas"))
    }

    copyMetaIfPresent(main, atlas, atlasTables.has("meta"))

    const summaryWarning = formatSummaryWarning(missingSummaryCoverages(atlas))
    if (summaryWarning) {
      console.warn(summaryWarning)
    }

    for (const index of EXPLORER_SCIP_INDEXES) {
      main.exec(createIndexSql(index));
    }
    for (const index of EXPLORER_ATLAS_INDEXES) {
      main.exec(createIndexSql(index));
    }
    for (const index of EXPLORER_ATLAS_OPTIONAL_INDEXES) {
      if (!atlasTables.has(index.table)) {
        continue
      }
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

  const uncompressedBytes = fs.statSync(dbPath).size
  let outputBytes = uncompressedBytes
  if (options.compress) {
    fs.writeFileSync(finalPath, gzipSync(fs.readFileSync(dbPath), { level: 5 }))
    fs.unlinkSync(dbPath)
    outputBytes = fs.statSync(finalPath).size
    console.log(
      `index.db: ${formatMb(indexBytes)} MB + atlas.db: ${formatMb(atlasBytes)} MB -> ${path.basename(finalPath)}: ${formatMb(outputBytes)} MB (${formatMb(uncompressedBytes)} MB uncompressed)`,
    );
  } else {
    console.log(
      `index.db: ${formatMb(indexBytes)} MB + atlas.db: ${formatMb(atlasBytes)} MB -> ${path.basename(dbPath)}: ${formatMb(outputBytes)} MB`,
    )
  }

  return {
    indexBytes,
    atlasBytes,
    outputBytes,
    outputPath: options.compress ? finalPath : dbPath,
    uncompressedBytes: options.compress ? uncompressedBytes : undefined,
  }
}
