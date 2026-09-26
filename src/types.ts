export type TreeNode = {
  path: string;
  kind: "dir" | "file";
  summary?: string | null;
};

export type SymbolRow = {
  display_name: string;
  start_line: number;
  end_line: number;
};

export type OverlayInfo = {
  author_name: string;
  commit_time: number;
  message: string;
  summary: string | null;
  commit_sha: string;
};

export type PathDetails = {
  path: string;
  kind: "file" | "dir";
  overlay: OverlayInfo | null;
  symbols: SymbolRow[];
  owners: string[];
  deps: string[];
  rdeps: string[];
};

export type FileDetails = PathDetails;

export type InspectTable = {
  name: string;
  type: string;
  rowCount: number;
};

export type InspectColumn = {
  name: string;
  type: string;
  notnull: number;
  pk: number;
};

export type InspectRows = {
  table: string;
  columns: string[];
  rows: string[][];
  rowCount: number;
  offset: number;
  limit: number;
};

export type SearchHit = {
  path: string;
  kind: "file" | "dir";
  name: string;
  summary: string | null
};

export type RemoteInfo = {
  host: string;
  owner: string;
  repo: string;
  gitHead: string | null;
};

export type HealthInfo = {
  loaded: boolean;
  fileName: string | null;
  tables: string[];
  bytes: number;
  mode: "explorer" | "invalid";
  mentionsPresent: boolean;
  ownersPresent: boolean;
  remote: RemoteInfo | null;
};

export type ViewMode = "explorer" | "db";

export type WorkerRequest =
  | { id: number; type: "load"; bytes: ArrayBuffer; fileName: string }
  | { id: number; type: "tree"; parent: string | null }
  | { id: number; type: "node"; path: string }
  | { id: number; type: "search"; query: string }
  | { id: number; type: "health" }
  | { id: number; type: "inspectTables" }
  | { id: number; type: "inspectSchema"; table: string }
  | { id: number; type: "inspectRows"; table: string; offset?: number; limit?: number };

export type WorkerResponse =
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: string };
