import type Database from "better-sqlite3"

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
