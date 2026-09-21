import Database from "better-sqlite3"

export function checkpointAtlas(atlasPath: string): void {
  const conn = openAtlas(atlasPath)
  try {
    conn.pragma("wal_checkpoint(TRUNCATE)")
  } finally {
    conn.close()
  }
}

export function openAtlas(atlasPath: string): Database.Database {
  const conn = new Database(atlasPath)
  conn.pragma("journal_mode = WAL")
  conn.pragma("foreign_keys = ON")
  return conn
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
