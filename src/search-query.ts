export type SearchMatchStyle = "prefix" | "substring"
export type SearchTokenCombine = "and" | "or"

function likePattern(style: SearchMatchStyle, token: string): string {
  if (style === "prefix") {
    return `${token}%`
  }
  return `%${token}%`
}

function joinClauses(clauses: string[], combine: SearchTokenCombine): string {
  return clauses.join(combine === "and" ? " AND " : " OR ")
}

function entryClauses(
  tokens: string[],
  style: SearchMatchStyle,
  combine: SearchTokenCombine,
  nameColumn: string,
  pathColumn: string,
): { clause: string; binds: string[] } {
  const binds: string[] = []
  const clauses = tokens.map((token) => {
    const parts = [`${nameColumn} LIKE ?`]
    binds.push(likePattern(style, token))
    if (token.includes("/")) {
      parts.push(`${pathColumn} LIKE ?`)
      binds.push(likePattern(style, token))
    }
    return `(${parts.join(" OR ")})`
  })
  return { clause: joinClauses(clauses, combine), binds }
}

function symbolClauses(
  tokens: string[],
  style: SearchMatchStyle,
  combine: SearchTokenCombine,
): { clause: string; binds: string[] } {
  const binds = tokens.map((token) => likePattern(style, token))
  const clauses = tokens.map(() => "gs.display_name LIKE ?")
  return { clause: joinClauses(clauses, combine), binds }
}

export function buildSearchQuery(
  tokens: string[],
  style: SearchMatchStyle,
  combine: SearchTokenCombine,
): { sql: string; binds: string[] } {
  const files = entryClauses(tokens, style, combine, "name", "relative_path")
  const dirs = entryClauses(tokens, style, combine, "name", "relative_path")
  const symbols = symbolClauses(tokens, style, combine)

  const sql = `
    SELECT path, name, kind, summary
    FROM (
      SELECT relative_path AS path, name, 'file' AS kind, summary, 0 AS rank
      FROM files
      WHERE ${files.clause}
      UNION ALL
      SELECT relative_path AS path, name, 'dir' AS kind, summary, 0 AS rank
      FROM dirs
      WHERE ${dirs.clause}
      UNION ALL
      SELECT f.relative_path AS path, f.name, 'file' AS kind, f.summary, 1 AS rank
      FROM global_symbols gs
      JOIN defn_enclosing_ranges der ON der.symbol_id = gs.id
      JOIN documents d ON der.document_id = d.id
      JOIN files f ON f.relative_path = d.relative_path
      WHERE ${symbols.clause}
    )
    GROUP BY path, kind
    ORDER BY MIN(rank), CASE kind WHEN 'file' THEN 0 ELSE 1 END, path
    LIMIT 50
  `

  return { sql, binds: [...files.binds, ...dirs.binds, ...symbols.binds] }
}

export function searchStrategies(tokens: string[]): Array<{
  style: SearchMatchStyle
  combine: SearchTokenCombine
}> {
  if (tokens.length === 1) {
    return [
      { style: "prefix", combine: "and" },
      { style: "substring", combine: "and" },
    ]
  }
  return [
    { style: "prefix", combine: "and" },
    { style: "substring", combine: "and" },
    { style: "prefix", combine: "or" },
    { style: "substring", combine: "or" },
  ]
}
