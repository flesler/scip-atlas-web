import {
  fetchHealth,
  fetchInspectTables,
  fetchNode,
  fetchTree,
  initDbClient,
  loadDatabase,
  searchDatabase,
} from "./db-client.js"
import { downloadApp } from "./download.js"
import { joinMeta } from "./format.js"
import { groupInspectTables } from "./inspect.js"
import "./styles.css"
import { createTreeIcon } from "./tree-icons.js"
import { ROOT_TREE_KEY, treeCacheKey } from "./tree.js"
import type { PathDetails, SearchHit, TreeNode, ViewMode } from "./types.js"
import { renderDbDetails, renderDbTableList } from "./ui-db.js"
import DbWorker from "./worker.ts?worker&inline"

const LAST_FILE_KEY = "scip-atlas-web:last-file";

const app = document.querySelector<HTMLDivElement>("#app")!;
const state = {
  loaded: false,
  fileName: "",
  viewMode: "explorer" as ViewMode,
  expanded: new Set<string>(),
  selectedPath: "",
  detailPath: null as string | null,
  searchActive: false,
  selectedTable: null as string | null,
  tableOffset: 0,
  inspectTables: [] as Awaited<ReturnType<typeof fetchInspectTables>>,
  treeCache: new Map<string, TreeNode[]>(),
  error: "",
};

initDbClient(new DbWorker());

app.innerHTML = `
  <header class="toolbar">
    <label class="button primary">
      Load DB
      <input id="db-input" type="file" accept=".db,.gz" hidden />
    </label>
    <input id="search-input" type="search" placeholder="Search names" />
    <div class="view-toggle" role="tablist" aria-label="View mode">
      <button id="view-explorer" type="button" class="active" role="tab" aria-selected="true">Explorer</button>
      <button id="view-db" type="button" role="tab" aria-selected="false">DB</button>
    </div>
    <button id="download-btn" type="button" aria-label="Download this app">Download</button>
    <div class="status" id="status">No database loaded</div>
  </header>
  <div class="layout">
    <aside class="panel" id="tree-panel"></aside>
    <main class="detail" id="detail-panel"></main>
  </div>
`;

const dbInput = app.querySelector<HTMLInputElement>("#db-input")!;
const searchInput = app.querySelector<HTMLInputElement>("#search-input")!;
const statusEl = app.querySelector<HTMLDivElement>("#status")!;
const treePanel = app.querySelector<HTMLDivElement>("#tree-panel")!;
const detailPanel = app.querySelector<HTMLDivElement>("#detail-panel")!;
const viewExplorerBtn = app.querySelector<HTMLButtonElement>("#view-explorer")!
const viewDbBtn = app.querySelector<HTMLButtonElement>("#view-db")!
const layoutEl = app.querySelector<HTMLDivElement>(".layout")!;

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path || "/";
}

function formatTime(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) {
    return "";
  }
  return new Date(epochSeconds * 1000).toLocaleDateString();
}

function formatSymbolRange(startLine: number, endLine: number): string {
  if (endLine > 0) {
    return `${startLine}:${endLine}`
  }
  return String(startLine)
}

function setError(message: string) {
  state.error = message;
  render();
}

async function ensureChildren(parent: string | null): Promise<TreeNode[]> {
  const key = treeCacheKey(parent);
  if (state.treeCache.has(key)) {
    return state.treeCache.get(key)!;
  }
  const nodes = await fetchTree(parent);
  state.treeCache.set(key, nodes);
  return nodes;
}

async function expandAncestors(path: string) {
  const parts = path.split("/");
  let current = "";
  for (let i = 0; i < parts.length - 1; i++) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    state.expanded.add(current);
    await ensureChildren(current);
  }
  if (path.includes("/")) {
    const parent = path.split("/").slice(0, -1).join("/");
    state.expanded.add(parent);
    await ensureChildren(parent);
  } else {
    await ensureChildren(null);
  }
}

async function toggleDir(path: string) {
  if (state.expanded.has(path)) {
    state.expanded.delete(path)
    return
  }
  state.expanded.add(path)
  await ensureChildren(path)
}

function syncExplorerLayout() {
  layoutEl.classList.toggle(
    "layout--tree-only",
    state.viewMode === "explorer" && !state.detailPath && !state.searchActive,
  )
}

function hideDetailPanel() {
  state.detailPath = null
  detailPanel.innerHTML = ""
  syncExplorerLayout()
}

function scrollDetailPanelToTop() {
  detailPanel.scrollTo({ top: 0, behavior: "smooth" })
}

function scrollSelectedTreeItemIntoView() {
  treePanel.querySelector<HTMLElement>(".tree-row.selected")?.scrollIntoView({
    block: "nearest",
    behavior: "smooth",
  })
}

async function selectDir(path: string) {
  state.selectedPath = path
  state.searchActive = false
  state.error = ""
  hideDetailPanel()
  await expandAncestors(path)
  render()
}

async function selectFile(path: string) {
  state.selectedPath = path
  state.detailPath = path
  state.searchActive = false
  state.error = ""
  scrollDetailPanelToTop()
  await expandAncestors(path)
  await render()
  scrollSelectedTreeItemIntoView()
  if (!path || !state.loaded) {
    return
  }
  try {
    const details = await fetchNode(path)
    if (details.kind !== "file") {
      hideDetailPanel()
      return
    }
    renderDetails(details)
    syncExplorerLayout()
    scrollDetailPanelToTop()
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error))
  }
}

function renderTreeNodes(parent: string | null, container: HTMLElement, seen = new Set<string>()) {
  const key = treeCacheKey(parent)
  if (seen.has(key)) {
    return
  }
  seen.add(key);
  const nodes = state.treeCache.get(key) ?? [];
  for (const node of nodes) {
    const item = document.createElement("div");
    item.className = "tree-item";
    const row = document.createElement("button")
    row.type = "button";
    row.className = `tree-row${state.selectedPath === node.path ? " selected" : ""}`;
    row.dataset.path = node.path;
    const labelText = node.path ? basename(node.path) : "/"
    row.setAttribute("aria-label", node.kind === "dir" ? `Directory ${labelText}` : `File ${labelText}`);

    if (node.kind === "dir") {
      const expanded = state.expanded.has(node.path)
      const toggle = document.createElement("span")
      toggle.className = "tree-toggle"
      toggle.setAttribute("aria-hidden", "true")
      toggle.textContent = expanded ? "▾" : "▸";
      row.appendChild(toggle);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "tree-toggle-spacer"
      spacer.setAttribute("aria-hidden", "true");
      row.appendChild(spacer);
    }

    row.appendChild(createTreeIcon(node.kind, node.kind === "dir" && state.expanded.has(node.path)))

    const label = document.createElement("span")
    label.className = "tree-label"
    label.textContent = labelText;
    row.appendChild(label);

    const summary = document.createElement("span")
    summary.className = "tree-summary"
    summary.textContent = node.summary ?? ""
    if (node.summary) {
      summary.title = node.summary
    }
    row.appendChild(summary);

    row.addEventListener("click", async () => {
      if (node.kind === "dir") {
        await toggleDir(node.path)
        await selectDir(node.path)
        return
      }
      await selectFile(node.path)
    });

    item.appendChild(row);

    if (node.kind === "dir" && state.expanded.has(node.path)) {
      const children = document.createElement("div");
      children.className = "tree-children";
      renderTreeNodes(node.path, children, seen);
      item.appendChild(children);
    }

    container.appendChild(item);
  }
}

function renderDetails(details: PathDetails) {
  const overlay = details.overlay;
  const meta = overlay
    ? joinMeta([overlay.author_name, formatTime(overlay.commit_time), overlay.message])
    : "";
  detailPanel.innerHTML = `
    <div class="detail-header">
      <h2>${details.path}</h2>
      <button type="button" class="detail-close" aria-label="Close file panel">×</button>
    </div>
    <p class="meta">file${meta ? ` · ${meta}` : ""}</p>
    ${overlay?.summary ? `<p>${overlay.summary}</p>` : ""}
    <section class="section">
      <h3>Defined symbols</h3>
      ${
        details.symbols.length
          ? `<ul class="link-list">${details.symbols
              .map(
                (symbol) =>
                  `<li>${symbol.display_name} <span class="meta">${formatSymbolRange(symbol.start_line, symbol.end_line)}</span></li>`,
              )
              .join("")}</ul>`
          : `<p class="meta">No symbols indexed for this file.</p>`
      }
    </section>
    <section class="section">
      <h3>Imports</h3>
      ${renderPathList(details.deps)}
    </section>
    <section class="section">
      <h3>Imported by</h3>
      ${renderPathList(details.rdeps)}
    </section>
  `;
  detailPanel.querySelector(".detail-close")?.addEventListener("click", () => {
    hideDetailPanel()
  })
  detailPanel.querySelectorAll("[data-path]").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.getAttribute("data-path");
      if (path) {
        void selectFile(path);
      }
    });
  });
}

function renderPathList(paths: string[]): string {
  if (!paths.length) {
    return `<p class="meta">None found.</p>`;
  }
  return `<ul class="link-list">${paths
    .map((path) => `<li><button type="button" data-path="${path}">${path}</button></li>`)
    .join("")}</ul>`;
}

function renderSearchResults(hits: SearchHit[]) {
  state.searchActive = true
  state.detailPath = null
  if (!hits.length) {
    detailPanel.innerHTML = `<p class="empty">No search results.</p>`;
    return;
  }
  detailPanel.innerHTML = `
    <h2>Search</h2>
    <ul class="search-results">
      ${hits
        .map(
          (hit) => `
        <li>
          <button type="button" data-path="${hit.path}">${hit.name}</button>
          <div class="meta">${hit.kind} · ${hit.path}</div>
        </li>`,
        )
        .join("")}
    </ul>
  `;
  syncExplorerLayout()
  detailPanel.querySelectorAll("[data-path]").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.getAttribute("data-path");
      if (path) {
        void selectFile(path);
      }
    });
  });
}

function setViewMode(mode: ViewMode) {
  state.viewMode = mode
  viewExplorerBtn.classList.toggle("active", mode === "explorer")
  viewDbBtn.classList.toggle("active", mode === "db")
  viewExplorerBtn.setAttribute("aria-selected", mode === "explorer" ? "true" : "false")
  viewDbBtn.setAttribute("aria-selected", mode === "db" ? "true" : "false")
  searchInput.disabled = mode === "db"
}

async function selectTable(table: string, offset = 0) {
  state.selectedTable = table
  state.tableOffset = offset
  state.error = ""
  await render()
}

async function render() {
  statusEl.textContent = state.loaded
    ? `${state.fileName} loaded`
    : localStorage.getItem(LAST_FILE_KEY)
      ? `No database loaded (last: ${localStorage.getItem(LAST_FILE_KEY)})`
      : "No database loaded";

  syncExplorerLayout()

  if (!state.loaded) {
    treePanel.innerHTML = `<p class="empty">Drop explorer.db or explorer.db.gz here or use Load DB.</p>`;
    detailPanel.innerHTML = `<p class="empty">Load a packed explorer.db to browse the repo.</p>`;
    return;
  }

  if (state.viewMode === "db") {
    if (!state.inspectTables.length) {
      state.inspectTables = await fetchInspectTables()
    }
    const tableGroups = groupInspectTables(state.inspectTables)
    const firstTable = tableGroups.find((group) => group.tables.length)?.tables[0]?.name ?? null
    if (!state.selectedTable && firstTable) {
      state.selectedTable = firstTable
      state.tableOffset = 0
    }
    renderDbTableList(treePanel, tableGroups, state.selectedTable, (table) => {
      void selectTable(table, 0)
    })
    if (state.selectedTable) {
      await renderDbDetails(detailPanel, state.selectedTable, state.tableOffset, (nextOffset) => {
        void selectTable(state.selectedTable!, nextOffset)
      })
    } else {
      detailPanel.innerHTML = `<p class="empty">No tables found.</p>`
    }
    return
  }

  if (!state.treeCache.has(ROOT_TREE_KEY)) {
    await ensureChildren(null);
  }

  treePanel.innerHTML = "";
  if (state.error) {
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = state.error;
    treePanel.appendChild(error);
  }
  renderTreeNodes(null, treePanel)
}

async function handleFile(file: File) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith("-wal") || lower.endsWith("-shm")) {
    throw new Error("load explorer.db, not -wal or -shm sidecars");
  }
  const bytes = await file.arrayBuffer();
  const health = await loadDatabase(bytes, file.name);
  state.loaded = true;
  state.fileName = file.name;
  state.treeCache.clear();
  state.inspectTables = [];
  state.expanded.clear();
  state.selectedPath = "";
  state.detailPath = null
  state.searchActive = false;
  state.selectedTable = null
  state.tableOffset = 0;
  state.error = "";
  localStorage.setItem(LAST_FILE_KEY, file.name);
  statusEl.textContent = `${file.name} · ${(health.bytes / (1024 * 1024)).toFixed(1)} MB`;
  await render();
}

dbInput.addEventListener("change", () => {
  const file = dbInput.files?.[0];
  if (!file) {
    return;
  }
  void handleFile(file).catch((error) => setError(error instanceof Error ? error.message : String(error)));
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }
  const query = searchInput.value.trim();
  if (!query || !state.loaded) {
    return;
  }
  void searchDatabase(query)
    .then((hits) => renderSearchResults(hits))
    .catch((error) => setError(error instanceof Error ? error.message : String(error)));
});

viewExplorerBtn.addEventListener("click", () => {
  setViewMode("explorer")
  void render()
})

viewDbBtn.addEventListener("click", () => {
  setViewMode("db")
  void render()
});

app.querySelector("#download-btn")!.addEventListener("click", () => {
  void downloadApp().catch((error) => setError(error instanceof Error ? error.message : String(error)));
});

document.body.addEventListener("dragover", (event) => {
  event.preventDefault();
});

document.body.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }
  void handleFile(file).catch((error) => setError(error instanceof Error ? error.message : String(error)));
});

void fetchHealth()
  .then((health) => {
    if (health.loaded) {
      state.loaded = true;
      state.fileName = health.fileName ?? "";
    }
  })
  .catch(() => {})
  .finally(() => {
    void render();
  });
