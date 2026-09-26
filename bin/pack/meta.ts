import Database from "better-sqlite3"
import fs from "node:fs"

export const FALLBACK_PACKED_DB = "explorer.db"

export function sanitizePackedDbRepoName(repo: string): string {
  const cleaned = repo.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return cleaned || "explorer"
}

export function packedDbBasename(atlasPath: string): string {
  if (!fs.existsSync(atlasPath)) {
    return FALLBACK_PACKED_DB
  }
  const atlas = new Database(atlasPath, { readonly: true })
  try {
    const hasMeta = atlas
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
      .get() as { ok: number } | undefined
    if (!hasMeta) {
      return FALLBACK_PACKED_DB
    }
    const columns = new Set((atlas.pragma("table_info(meta)") as { name: string }[]).map((row) => row.name))
    if (!columns.has("github_repo")) {
      return FALLBACK_PACKED_DB
    }
    const row = atlas.prepare("SELECT github_repo FROM meta WHERE id = 1").get() as {
      github_repo: string | null
    } | undefined
    const repo = row?.github_repo?.trim()
    if (!repo) {
      return FALLBACK_PACKED_DB
    }
    return `${sanitizePackedDbRepoName(repo)}.db`
  } finally {
    atlas.close()
  }
}

export function copyMetaIfPresent(main: Database.Database, atlas: Database.Database, atlasHasMeta: boolean): void {
  if (!atlasHasMeta) {
    return
  }

  const columns = new Set(
    (atlas.pragma("table_info(meta)") as { name: string }[]).map((row) => row.name),
  )
  const hasGithub = columns.has("github_host") && columns.has("github_owner") && columns.has("github_repo")

  main.exec(`
    CREATE TABLE meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      git_head TEXT,
      github_host TEXT,
      github_owner TEXT,
      github_repo TEXT
    )
  `)

  if (hasGithub) {
    main.exec(`
      INSERT INTO main.meta (id, git_head, github_host, github_owner, github_repo)
      SELECT id, git_head, github_host, github_owner, github_repo
      FROM atlas.meta
    `)
    return
  }

  main.exec(`
    INSERT INTO main.meta (id, git_head, github_host, github_owner, github_repo)
    SELECT id, git_head, NULL, NULL, NULL
    FROM atlas.meta
  `)
}
