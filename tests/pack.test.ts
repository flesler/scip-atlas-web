import Database from "better-sqlite3"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"
import { afterEach, describe, expect, it } from "vitest"
import { formatSummaryWarning, missingSummaryCoverages } from "../bin/pack/atlas.js"
import { buildExplorerDb } from "../bin/pack/build.js"
import { EXPLORER_ATLAS_TABLES, EXPLORER_SCIP_INDEXES, EXPLORER_SCIP_TABLES } from "../bin/pack/schema.js"
import {
  PackError,
  copyTableSql,
  createIndexSql,
  createTableSql,
  indexName
} from "../bin/pack/slim.js"

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const INDEX_PATH = path.join(FIXTURE_DIR, "index.db");
const ATLAS_PATH = path.join(FIXTURE_DIR, "atlas.db");

const tempDirs: string[] = [];

function makeOutput(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scip-atlas-web-pack-"));
  tempDirs.push(dir);
  return path.join(dir, "explorer.db");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const RDEP_SQL = `
  SELECT DISTINCT d.relative_path
  FROM mentions m
  JOIN chunks c ON m.chunk_id = c.id
  JOIN documents d ON c.document_id = d.id
  JOIN defn_enclosing_ranges der ON der.symbol_id = m.symbol_id
  JOIN documents def_d ON der.document_id = def_d.id
  WHERE m.role != 1 AND def_d.relative_path = ? AND d.relative_path != ?
  ORDER BY d.relative_path
`;

describe("pack explorer SQL helpers", () => {
  it("derives index names and DDL from config", () => {
    const index = EXPLORER_SCIP_INDEXES[0];
    expect(createIndexSql(index)).toBe(
      `CREATE INDEX ${indexName(index)} ON ${index.table}(${index.columns.join(", ")})`,
    );
  });

  it("uses explicit columns in generated SQL", () => {
    const conn = new Database(INDEX_PATH, { readonly: true });
    for (const table of EXPLORER_SCIP_TABLES) {
      const rows = conn.pragma(`table_info(${table.name})`) as { name: string }[];
      const byName = new Map(rows.map((row) => [row.name, row]));
      const specs = table.columns.map((name) => byName.get(name)!);
      const ddl = createTableSql(table, specs as never);
      expect(ddl).toContain(table.name);
      for (const column of table.columns) {
        expect(ddl).toContain(column);
      }
      const insert = copyTableSql(table);
      expect(insert).toContain(`SELECT ${table.columns.join(", ")}`);
    }
    conn.close();
  });
});

describe("summary coverage", () => {
  it("warns when atlas rows lack summaries", () => {
    const atlas = new Database(ATLAS_PATH, { readonly: true })
    const warning = formatSummaryWarning(missingSummaryCoverages(atlas))
    atlas.close()

    expect(warning).toBe("warning: 60/60 rows do not include summaries, run scip-atlas summarize")
  })
});

describe("buildExplorerDb", () => {
  it("drops chunks.occurrences and keeps mention PK", () => {
    const output = makeOutput();
    buildExplorerDb({ repoPath: FIXTURE_DIR, indexPath: INDEX_PATH, atlasPath: ATLAS_PATH, outputPath: output });

    const conn = new Database(output, { readonly: true });
    const tables = new Set(
      (conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
        (row) => row.name,
      ),
    );
    const chunkCols = new Set(
      (conn.pragma("table_info(chunks)") as { name: string }[]).map((row) => row.name),
    );
    const mentionPk = (
      conn.prepare("SELECT sql FROM sqlite_master WHERE name = 'mentions'").get() as { sql: string }
    ).sql;

    const required = new Set([
      ...EXPLORER_SCIP_TABLES.map((table) => table.name),
      ...EXPLORER_ATLAS_TABLES.map((table) => table.name),
    ]);
    for (const name of required) {
      expect(tables.has(name)).toBe(true);
    }
    expect(tables.has("meta")).toBe(false)
    expect(tables.has("search_docs")).toBe(false)
    expect(tables.has("search_docs_fts")).toBe(false);
    expect(chunkCols.has("occurrences")).toBe(false);
    expect(chunkCols.has("chunk_index")).toBe(false)
    const symbolCols = new Set(
      (conn.pragma("table_info(global_symbols)") as { name: string }[]).map((row) => row.name),
    )
    expect(symbolCols.has("display_name")).toBe(false)
    expect(symbolCols.has("kind")).toBe(false)
    const fileCols = new Set((conn.pragma("table_info(files)") as { name: string }[]).map((row) => row.name))
    expect(fileCols.has("blob_sha")).toBe(false)
    expect(fileCols.has("summary_at_sha")).toBe(false);
    expect(mentionPk).toContain("PRIMARY KEY (chunk_id, symbol_id, role)");
    conn.close();
  });

  it("matches rdeps against full index for fixture file", () => {
    const output = makeOutput();
    buildExplorerDb({ repoPath: FIXTURE_DIR, indexPath: INDEX_PATH, atlasPath: ATLAS_PATH, outputPath: output });

    const filePath = "src/helper.ts";
    const full = new Database(INDEX_PATH, { readonly: true });
    const packed = new Database(output, { readonly: true });
    const fullRows = full.prepare(RDEP_SQL).all(filePath, filePath).map((row) => (row as { relative_path: string }).relative_path);
    const packedRows = packed.prepare(RDEP_SQL).all(filePath, filePath).map((row) => (row as { relative_path: string }).relative_path);
    full.close();
    packed.close();
    expect(packedRows).toEqual(fullRows);
  });

  it("copies atlas committers, commits, files, and dirs row counts", () => {
    const output = makeOutput();
    buildExplorerDb({ repoPath: FIXTURE_DIR, indexPath: INDEX_PATH, atlasPath: ATLAS_PATH, outputPath: output });

    const atlas = new Database(ATLAS_PATH, { readonly: true });
    const packed = new Database(output, { readonly: true });
    for (const table of EXPLORER_ATLAS_TABLES.map((row) => row.name)) {
      const sourceCount = (atlas.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
      const packedCount = (packed.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
      expect(packedCount).toBe(sourceCount);
    }
    atlas.close();
    packed.close();
  });

  it("writes explorer.db.gz when compress is enabled", () => {
    const output = makeOutput()
    const gzPath = `${output}.gz`
    const result = buildExplorerDb(
      { repoPath: FIXTURE_DIR, indexPath: INDEX_PATH, atlasPath: ATLAS_PATH, outputPath: output },
      { compress: true },
    )

    expect(result.outputPath).toBe(gzPath)
    expect(fs.existsSync(gzPath)).toBe(true)
    expect(fs.existsSync(output)).toBe(false)
    expect(result.uncompressedBytes).toBeGreaterThan(result.outputBytes)

    const packed = new Database(gunzipSync(fs.readFileSync(gzPath)), { readonly: true })
    const tables = new Set(
      (packed.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
        (row) => row.name,
      ),
    )
    expect(tables.has("files")).toBe(true)
    expect(tables.has("documents")).toBe(true)
    packed.close()
  });

  it("vacuums explorer.db so a second VACUUM does not shrink it further", () => {
    const output = makeOutput()
    buildExplorerDb({ repoPath: FIXTURE_DIR, indexPath: INDEX_PATH, atlasPath: ATLAS_PATH, outputPath: output })

    const before = fs.statSync(output).size
    const conn = new Database(output)
    conn.exec("VACUUM")
    conn.close()
    expect(fs.statSync(output).size).toBe(before)
  });

  it("rejects missing source index", () => {
    const output = makeOutput();
    expect(() =>
      buildExplorerDb({
        repoPath: FIXTURE_DIR,
        indexPath: path.join(FIXTURE_DIR, "missing.db"),
        atlasPath: ATLAS_PATH,
        outputPath: output,
      }),
    ).toThrow(PackError);
  });
});
