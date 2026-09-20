export const SQL = {
  roots: `
    SELECT d.relative_path, d.parent_path,
           c.author_name AS last_author_name, c.commit_time AS last_commit_time,
           c.subject AS last_subject, d.summary
    FROM dirs d
    LEFT JOIN commits c ON c.sha = d.commit_sha
    WHERE d.parent_path = ''
    ORDER BY d.relative_path
  `,
  childDirs: `
    SELECT d.relative_path, d.parent_path,
           c.author_name AS last_author_name, c.commit_time AS last_commit_time,
           c.subject AS last_subject, d.summary
    FROM dirs d
    LEFT JOIN commits c ON c.sha = d.commit_sha
    WHERE d.parent_path = ?
    ORDER BY d.relative_path
  `,
  childFiles: `
    SELECT f.relative_path, c.author_name, c.commit_time, c.subject, f.summary
    FROM files f
    JOIN commits c ON c.sha = f.commit_sha
    WHERE f.relative_path LIKE ?
      AND instr(substr(f.relative_path, length(?) + 2), '/') = 0
    ORDER BY f.relative_path
  `,
  rootFiles: `
    SELECT f.relative_path, c.author_name, c.commit_time, c.subject, f.summary
    FROM files f
    JOIN commits c ON c.sha = f.commit_sha
    WHERE instr(f.relative_path, '/') = 0
    ORDER BY f.relative_path
  `,
  fileOverlay: `
    SELECT f.relative_path, c.author_name, c.commit_time, c.subject, f.summary
    FROM files f
    JOIN commits c ON c.sha = f.commit_sha
    WHERE f.relative_path = ?
  `,
  dirOverlay: `
    SELECT d.relative_path,
           c.author_name AS last_author_name, c.commit_time AS last_commit_time,
           c.subject AS last_subject, d.summary
    FROM dirs d
    LEFT JOIN commits c ON c.sha = d.commit_sha
    WHERE d.relative_path = ?
  `,
  definedSymbols: `
    SELECT gs.display_name, gs.symbol, der.start_line, der.end_line
    FROM global_symbols gs
    JOIN defn_enclosing_ranges der ON der.symbol_id = gs.id
    JOIN documents d ON der.document_id = d.id
    WHERE d.relative_path = ?
      AND gs.symbol NOT LIKE '%/'
    ORDER BY der.start_line, gs.symbol
  `,
  deps: `
    SELECT DISTINCT def_d.relative_path
    FROM mentions m
    JOIN chunks c ON m.chunk_id = c.id
    JOIN global_symbols gs ON m.symbol_id = gs.id
    JOIN defn_enclosing_ranges der ON der.symbol_id = gs.id
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
    SELECT path, kind, name, summary
    FROM search_docs_fts
    WHERE search_docs_fts MATCH ?
    LIMIT 50
  `,
  tableNames: `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
  chunkColumns: `PRAGMA table_info(chunks)`,
} as const;
