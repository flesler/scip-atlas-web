import Database from "better-sqlite3"

export const FTS_CREATE_SQL = `
CREATE VIRTUAL TABLE search_docs_fts USING fts5(
    path,
    kind UNINDEXED,
    symbol UNINDEXED,
    name,
    summary,
    tokenize='unicode61 remove_diacritics 2'
);
`;

export const FTS_POPULATE_SQL = `
INSERT INTO search_docs_fts(rowid, path, kind, symbol, name, summary)
SELECT rowid, path, kind, symbol, name, summary FROM search_docs;
`;

export function checkpointAtlas(atlasPath: string): void {
  const conn = openAtlas(atlasPath);
  try {
    conn.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    conn.close();
  }
}

export function openAtlas(atlasPath: string): Database.Database {
  const conn = new Database(atlasPath);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  return conn;
}

const SUMMARY_TABLES = ["files", "dirs"] as const

export type SummaryCoverage = {
  table: string
  missing: number
  total: number
}

export function missingSummaryCoverages(conn: Database.Database): SummaryCoverage[] {
  return SUMMARY_TABLES.map((table) => {
    const row = conn
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN summary IS NULL OR TRIM(summary) = '' THEN 1 ELSE 0 END) AS missing
         FROM ${table}`,
      )
      .get() as { total: number; missing: number | null }
    return { table, total: Number(row.total ?? 0), missing: Number(row.missing ?? 0) }
  })
}

export function formatSummaryWarning(coverages: SummaryCoverage[]): string | null {
  const missing = coverages.reduce((sum, row) => sum + row.missing, 0)
  const total = coverages.reduce((sum, row) => sum + row.total, 0)
  if (missing === 0) {
    return null
  }
  return `warning: ${missing}/${total} rows do not include summaries, run scip-atlas summarize`
}

export function dropFtsShadowTables(conn: Database.Database): void {
  const rows = conn
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type IN ('table', 'shadow')
         AND (name = 'search_docs_fts' OR name LIKE 'search_docs_fts%')`,
    )
    .all() as { name: string }[];
  for (const row of rows) {
    conn.exec(`DROP TABLE IF EXISTS ${row.name}`);
  }
}
