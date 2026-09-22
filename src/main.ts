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

const app = document.querySelector<HTMLDivElement>("#app")!;
const state = {
  loaded: false,
  viewMode: "explorer" as ViewMode,
  expanded: new Set<string>(),
  selectedPath: "",
  detailPath: null as string | null,
  searchActive: false,
  searchQuery: "",
  searchHits: [] as SearchHit[],
  searchRestore: null as { expanded: string[]; selectedPath: string; detailPath: string | null } | null,
  selectedTable: null as string | null,
  tableOffset: 0,
  inspectTables: [] as Awaited<ReturnType<typeof fetchInspectTables>>,
  treeCache: new Map<string, TreeNode[]>(),
  error: "",
};

initDbClient(new DbWorker());

app.innerHTML = `
  <header class="toolbar">
    <input
      id="search-input"
      type="search"
      placeholder="Search names"
      title="Find files and folders by name prefix. Enter opens the first match; Esc restores the tree."
      disabled
    />
    <div class="view-toggle" role="tablist" aria-label="View mode">
      <button
        id="view-explorer"
        type="button"
        class="active"
        role="tab"
        aria-selected="true"
        title="Browse the repo tree; select a file to see symbols, imports, and importers."
        disabled
      >Explorer</button>
      <button
        id="view-db"
        type="button"
        role="tab"
        aria-selected="false"
        title="Browse raw SQLite tables in the loaded explorer.db (debug view)."
        disabled
      >DB</button>
    </div>
    <button
      id="download-btn"
      type="button"
      aria-label="Download offline app"
      title="Save this explorer as a single HTML file for offline use (open via file://). Does not include your database—you load explorer.db separately each time."
    >Download offline</button>
  </header>
  <div class="layout layout--awaiting-db">
    <div
      class="load-screen"
      id="load-screen"
      title="Drop explorer.db or explorer.db.gz anywhere on the page to load it."
    >
      <label
        class="button primary load-button"
        title="Choose explorer.db or explorer.db.gz from the pack CLI. Data stays in your browser only; reload the page to switch databases."
      >
        Load explorer DB file
        <input id="db-input" type="file" accept=".db,.gz" hidden />
      </label>
      <p class="meta">or drop explorer.db / explorer.db.gz here</p>
    </div>
    <aside class="panel" id="tree-panel"></aside>
    <main class="detail" id="detail-panel"></main>
  </div>
`;

const dbInput = app.querySelector<HTMLInputElement>("#db-input")!;
const searchInput = app.querySelector<HTMLInputElement>("#search-input")!
const treePanel = app.querySelector<HTMLDivElement>("#tree-panel")!;
const detailPanel = app.querySelector<HTMLDivElement>("#detail-panel")!;
const viewExplorerBtn = app.querySelector<HTMLButtonElement>("#view-explorer")!
const viewDbBtn = app.querySelector<HTMLButtonElement>("#view-db")!
const layoutEl = app.querySelector<HTMLDivElement>(".layout")!;
const loadScreen = app.querySelector<HTMLDivElement>("#load-screen")!;

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

async function autoExpandSingletonChain(parent: string | null): Promise<TreeNode | null> {
  const children = state.treeCache.get(treeCacheKey(parent)) ?? await ensureChildren(parent)
  if (children.length !== 1) {
    return null
  }
  const child = children[0]
  if (child.kind === "dir") {
    state.expanded.add(child.path)
    await ensureChildren(child.path)
    const deeper = await autoExpandSingletonChain(child.path)
    return deeper ?? child
  }
  return child
}

async function runInitialTreeExpand() {
  await ensureChildren(null)
  const leaf = await autoExpandSingletonChain(null)
  if (leaf?.kind === "file") {
    await selectFile(leaf.path)
    return
  }
  if (leaf?.kind === "dir") {
    state.selectedPath = leaf.path
  }
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

async function toggleDir(path: string): Promise<TreeNode | null> {
  if (state.expanded.has(path)) {
    state.expanded.delete(path)
    return null
  }
  state.expanded.add(path)
  await ensureChildren(path)
  return autoExpandSingletonChain(path)
}

function syncExplorerLayout() {
  layoutEl.classList.toggle(
    "layout--tree-only",
    state.viewMode === "explorer" && (!state.detailPath || state.searchActive),
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
    block: "center",
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
        const leaf = await toggleDir(node.path)
        if (leaf?.kind === "file") {
          await selectFile(leaf.path)
          return
        }
        await selectDir(leaf?.path ?? node.path)
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
      <button type="button" class="detail-close" aria-label="Close file panel" title="Close file details and expand the tree to full width.">×</button>
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

function beginSearchIfNeeded() {
  if (state.searchRestore) {
    return
  }
  state.searchRestore = {
    expanded: [...state.expanded],
    selectedPath: state.selectedPath,
    detailPath: state.detailPath,
  }
  state.detailPath = null
  hideDetailPanel()
}

function clearSearch(restore = true) {
  searchInput.value = ""
  state.searchQuery = ""
  state.searchHits = []
  state.searchActive = false
  if (restore && state.searchRestore) {
    state.expanded = new Set(state.searchRestore.expanded)
    state.selectedPath = state.searchRestore.selectedPath
    state.detailPath = state.searchRestore.detailPath
  }
  state.searchRestore = null
}

async function restoreDetailIfOpen() {
  if (!state.detailPath) {
    hideDetailPanel()
    return
  }
  try {
    const details = await fetchNode(state.detailPath)
    if (details.kind === "file") {
      renderDetails(details)
      syncExplorerLayout()
      return
    }
    hideDetailPanel()
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error))
  }
}

async function finishSearchClear(restore = true) {
  clearSearch(restore)
  await render()
  await restoreDetailIfOpen()
}

async function pickSearchHit(hit: SearchHit) {
  clearSearch(true)
  if (hit.kind === "file") {
    await selectFile(hit.path)
    return
  }
  await selectDir(hit.path)
}

function renderSearchResultsList(container: HTMLElement, hits: SearchHit[]) {
  if (!hits.length) {
    container.innerHTML = `<p class="empty">No matches for "${state.searchQuery}".</p>`
    return
  }
  const list = document.createElement("ul")
  list.className = "search-results"
  for (const hit of hits) {
    const item = document.createElement("li")
    const row = document.createElement("button")
    row.type = "button"
    row.className = "search-result-row"
    row.appendChild(createTreeIcon(hit.kind))

    const label = document.createElement("span")
    label.className = "search-result-name"
    label.textContent = hit.name
    row.appendChild(label)

    const path = document.createElement("span")
    path.className = "search-result-path"
    path.textContent = hit.path
    row.appendChild(path)

    if (hit.summary) {
      const summary = document.createElement("span")
      summary.className = "search-result-summary"
      summary.textContent = hit.summary
      summary.title = hit.summary
      row.appendChild(summary)
    }

    row.addEventListener("click", () => {
      void pickSearchHit(hit)
    })
    item.appendChild(row)
    list.appendChild(item)
  }
  container.appendChild(list)
}

let searchTimer: number | undefined
let searchSeq = 0

function scheduleSearch(query: string) {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    void runSearch(query)
  }, 150)
}

async function runSearch(query: string) {
  if (!state.loaded) {
    return
  }
  const seq = ++searchSeq
  state.searchQuery = query
  state.searchActive = true
  beginSearchIfNeeded()
  try {
    const hits = await searchDatabase(query)
    if (seq !== searchSeq) {
      return
    }
    state.searchHits = hits
    state.error = ""
    await render()
  } catch (error) {
    if (seq !== searchSeq) {
      return
    }
    setError(error instanceof Error ? error.message : String(error))
  }
}

function setViewMode(mode: ViewMode) {
  state.viewMode = mode
  viewExplorerBtn.classList.toggle("active", mode === "explorer")
  viewDbBtn.classList.toggle("active", mode === "db")
  viewExplorerBtn.setAttribute("aria-selected", mode === "explorer" ? "true" : "false")
  viewDbBtn.setAttribute("aria-selected", mode === "db" ? "true" : "false")
  searchInput.disabled = !state.loaded || mode === "db"
}

function syncLoadChrome() {
  loadScreen.hidden = state.loaded
  layoutEl.classList.toggle("layout--awaiting-db", !state.loaded)
  searchInput.disabled = !state.loaded || state.viewMode === "db"
  viewExplorerBtn.disabled = !state.loaded
  viewDbBtn.disabled = !state.loaded
}

async function selectTable(table: string, offset = 0) {
  state.selectedTable = table
  state.tableOffset = offset
  state.error = ""
  await render()
}

async function render() {
  syncLoadChrome()
  syncExplorerLayout()

  if (!state.loaded) {
    treePanel.innerHTML = ""
    detailPanel.innerHTML = "";
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
  if (state.searchActive && state.searchQuery) {
    renderSearchResultsList(treePanel, state.searchHits)
    syncExplorerLayout()
    return
  }
  renderTreeNodes(null, treePanel)
}

async function handleFile(file: File) {
  if (state.loaded) {
    return
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith("-wal") || lower.endsWith("-shm")) {
    throw new Error("load explorer.db, not -wal or -shm sidecars");
  }
  const bytes = await file.arrayBuffer();
  await loadDatabase(bytes, file.name);
  state.loaded = true;
  state.treeCache.clear();
  state.inspectTables = [];
  state.expanded.clear();
  state.selectedPath = "";
  state.detailPath = null
  state.searchActive = false;
  state.searchQuery = ""
  state.searchHits = []
  state.searchRestore = null;
  state.selectedTable = null
  state.tableOffset = 0;
  state.error = "";
  syncLoadChrome()
  await runInitialTreeExpand()
  if (!state.detailPath) {
    await render();
  }
}

dbInput.addEventListener("change", () => {
  const file = dbInput.files?.[0];
  if (!file) {
    return;
  }
  void handleFile(file).catch((error) => setError(error instanceof Error ? error.message : String(error)));
});

searchInput.addEventListener("input", () => {
  const query = searchInput.value.trim()
  if (!query) {
    void finishSearchClear(true)
    return
  }
  scheduleSearch(query)
})

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault()
    void finishSearchClear(true)
    return
  }
  if (event.key !== "Enter") {
    return
  }
  event.preventDefault()
  const hits = state.searchHits
  if (!hits.length) {
    const query = searchInput.value.trim()
    if (query) {
      void runSearch(query).then(() => {
        if (state.searchHits[0]) {
          void pickSearchHit(state.searchHits[0])
        }
      })
    }
    return
  }
  void pickSearchHit(hits[0])
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
  if (state.loaded) {
    return
  }
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
    }
  })
  .catch(() => {})
  .finally(() => {
    void render();
  });
