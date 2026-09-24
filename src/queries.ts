import { FILE_PANEL, SYMBOL_ROW, TREE_DIR, TREE_FILE, tableCols } from "./query-columns.js"

export const SQL = {
  roots: `
    SELECT ${tableCols("d", TREE_DIR)}
    FROM dirs d
    WHERE d.parent_path = ''
    ORDER BY d.relative_path
  `,
  childDirs: `
    SELECT ${tableCols("d", TREE_DIR)}
    FROM dirs d
    WHERE d.parent_path = ?
    ORDER BY d.relative_path
  `,
  childFiles: `
    SELECT ${tableCols("f", TREE_FILE)}
    FROM files f
    WHERE f.relative_path LIKE ? || '/%'
      AND instr(substr(f.relative_path, length(?) + 2), '/') = 0
    ORDER BY f.relative_path
  `,
  rootFiles: `
    SELECT ${tableCols("f", TREE_FILE)}
    FROM files f
    WHERE instr(f.relative_path, '/') = 0
    ORDER BY f.relative_path
  `,
  fileOverlay: `
    SELECT f.relative_path, f.summary,
           ct.name AS author_name, c.commit_time, c.message
    FROM files f
    JOIN commits c ON c.sha = f.commit_sha
    JOIN committers ct ON ct.email = c.committer_email
    WHERE f.relative_path = ?
  `,
  definedSymbols: `
    SELECT gs.display_name, der.start_line, der.end_line
    FROM global_symbols gs
    JOIN defn_enclosing_ranges der ON der.symbol_id = gs.id
    JOIN documents d ON der.document_id = d.id
    WHERE d.relative_path = ?
      AND gs.display_name IS NOT NULL
    ORDER BY der.start_line, gs.display_name
  `,
  deps: `
    SELECT DISTINCT def_d.relative_path
    FROM mentions m
    JOIN chunks c ON m.chunk_id = c.id
    JOIN defn_enclosing_ranges der ON der.symbol_id = m.symbol_id
    JOIN documents def_d ON der.document_id = def_d.id
    WHERE c.document_id = (SELECT id FROM documents WHERE relative_path = ?)
      AND m.role != 1
      AND def_d.relative_path != ?
    ORDER BY def_d.relative_path
  `,
  rdeps: `
    SELECT DISTINCT d.relative_path
    FROM mentions m
    JOIN chunks c ON m.chunk_id = c.id
    JOIN documents d ON c.document_id = d.id
    JOIN defn_enclosing_ranges der ON der.symbol_id = m.symbol_id
    JOIN documents def_d ON der.document_id = def_d.id
    WHERE m.role != 1
      AND def_d.relative_path = ?
      AND d.relative_path != ?
    ORDER BY d.relative_path
  `,
  search: `
    SELECT path, name, kind, summary
    FROM (
      SELECT relative_path AS path, name, 'file' AS kind, summary, 0 AS rank
      FROM files
      WHERE name LIKE ? || '%'
      UNION ALL
      SELECT relative_path AS path, name, 'dir' AS kind, summary, 0 AS rank
      FROM dirs
      WHERE name LIKE ? || '%'
      UNION ALL
      SELECT f.relative_path AS path, f.name, 'file' AS kind, f.summary, 1 AS rank
      FROM global_symbols gs
      JOIN defn_enclosing_ranges der ON der.symbol_id = gs.id
      JOIN documents d ON der.document_id = d.id
      JOIN files f ON f.relative_path = d.relative_path
      WHERE gs.display_name LIKE ? || '%'
    )
    GROUP BY path, kind
    ORDER BY MIN(rank), CASE kind WHEN 'file' THEN 0 ELSE 1 END, path
    LIMIT 50
  `,
  tableNames: `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
  chunkColumns: `PRAGMA table_info(chunks)`,
} as const

export { FILE_PANEL, SYMBOL_ROW, TREE_DIR, TREE_FILE }
