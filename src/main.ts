import {
  fetchHealth,
  fetchInspectTables,
  fetchNode,
  fetchTree,
  initDbClient,
  loadDatabase,
  searchDatabase,
} from "./db-client.js"
import { canDownloadApp, downloadApp } from "./download.js"
import { joinMeta } from "./format.js"
import { flattenInspectTableNames, groupInspectTables } from "./inspect.js"
import { commitUrl, fileBlobUrl, resolveBlobRef } from "./remote-links.js"
import {
  mountShortcutsFab,
  mountShortcutsInline,
  mountShortcutsOverlay,
  setShortcutsOverlayOpen,
} from "./shortcuts-panel.js"
import "./styles.css"
import { createTreeIcon } from "./tree-icons.js"
import { ROOT_TREE_KEY, treeCacheKey } from "./tree.js"
import type { PathDetails, RemoteInfo, SearchHit, TreeNode, ViewMode } from "./types.js"
import { renderDbDetails, renderDbTableList } from "./ui-db.js"
import DbWorker from "./worker.ts?worker&inline"

const PAGE_STEPS = 5;
const GITHUB_REPO_URL = "https://github.com/flesler/scip-atlas-web";

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
  tablePageInfo: null as { rowCount: number; limit: number } | null,
  inspectTables: [] as Awaited<ReturnType<typeof fetchInspectTables>>,
  treeCache: new Map<string, TreeNode[]>(),
  error: "",
  shortcutsOpen: false,
  shortcutsHover: false,
  remote: null as RemoteInfo | null,
};

initDbClient(new DbWorker());

app.innerHTML = `
  <header class="toolbar">
    <input
      id="search-input"
      type="search"
      placeholder="Type to search by name, path (src/foo), or symbols..."
      title="Find files and folders by name or path (path when the query contains /), or symbols. Tries prefix matches first, then substring; multi-word queries try AND then OR. Enter opens the first match; Esc restores the tree."
      disabled
    />
    <div class="view-toggle" role="tablist" aria-label="View mode">
      <button
        id="view-explorer"
        type="button"
        class="active"
        role="tab"
        aria-selected="true"
        title="Browse the repo tree; select a file to see symbols, owners, imports, and importers."
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
    <a
      id="github-link"
      class="toolbar-github-link"
      href="${GITHUB_REPO_URL}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View source on GitHub"
      title="View source on GitHub"
    ><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg></a>
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
const downloadBtn = app.querySelector<HTMLButtonElement>("#download-btn")!
const toolbarEl = app.querySelector<HTMLElement>(".toolbar")!
const layoutEl = app.querySelector<HTMLDivElement>(".layout")!;
const loadScreen = app.querySelector<HTMLDivElement>("#load-screen")!;
const githubLink = app.querySelector<HTMLAnchorElement>("#github-link")!
const shortcutsInline = mountShortcutsInline(loadScreen)
const shortcutsOverlay = mountShortcutsOverlay(app, () => {
  closeShortcutsPanel()
})
const shortcutsFab = mountShortcutsFab(app, {
  onClick: () => {
    state.shortcutsOpen = !state.shortcutsOpen
    if (!state.shortcutsOpen) {
      state.shortcutsHover = false
    }
    syncShortcutsPanel()
  },
  onMouseEnter: () => {
    if (state.shortcutsOpen) {
      return
    }
    state.shortcutsHover = true
    syncShortcutsPanel()
  },
  onMouseLeave: () => {
    if (state.shortcutsOpen) {
      return
    }
    state.shortcutsHover = false
    syncShortcutsPanel()
  },
})

function syncShortcutsPanel() {
  shortcutsFab.hidden = !state.loaded
  const overlayOpen = state.loaded && (state.shortcutsOpen || state.shortcutsHover)
  shortcutsInline.hidden = state.loaded || overlayOpen
  setShortcutsOverlayOpen(shortcutsOverlay, overlayOpen)
  shortcutsOverlay.classList.toggle(
    "shortcuts-overlay--preview",
    state.shortcutsHover && !state.shortcutsOpen,
  )
  shortcutsFab.setAttribute("aria-expanded", overlayOpen ? "true" : "false")
  shortcutsFab.classList.toggle("shortcuts-fab--pinned", state.shortcutsOpen)
  shortcutsFab.classList.toggle("shortcuts-fab--active", overlayOpen)
}

function toggleShortcutsPanel() {
  state.shortcutsOpen = !state.shortcutsOpen
  if (!state.shortcutsOpen) {
    state.shortcutsHover = false
  }
  syncShortcutsPanel()
}

function closeShortcutsPanel() {
  if (!state.shortcutsOpen && !state.shortcutsHover) {
    return false
  }
  state.shortcutsOpen = false
  state.shortcutsHover = false
  syncShortcutsPanel()
  return true
}

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape") {
      return
    }
    if (!closeShortcutsPanel()) {
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
  },
  true,
)

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

function focusSearchWithKey(key: string) {
  searchInput.focus()
  const start = searchInput.selectionStart ?? searchInput.value.length
  const end = searchInput.selectionEnd ?? searchInput.value.length
  searchInput.value = `${searchInput.value.slice(0, start)}${key}${searchInput.value.slice(end)}`
  const cursor = start + key.length
  searchInput.selectionStart = cursor
  searchInput.selectionEnd = cursor
  searchInput.dispatchEvent(new Event("input", { bubbles: true }))
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path || "/";
}

function parentDirPath(path: string): string | null {
  const index = path.lastIndexOf("/")
  if (index < 0) {
    return null
  }
  return path.slice(0, index)
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
    await focusEntry(leaf.path, "file")
    return
  }
  if (leaf?.kind === "dir") {
    await focusEntry(leaf.path, "dir")
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

function isStackedExplorerLayout() {
  return window.matchMedia("(max-width: 900px)").matches && state.viewMode === "explorer"
}

function isMobileDetailOverlay() {
  return (
    isStackedExplorerLayout() &&
    !!state.detailPath &&
    !state.searchActive &&
    state.viewMode === "explorer"
  )
}

function syncToolbarHeight() {
  app.style.setProperty("--app-toolbar-height", `${toolbarEl.offsetHeight}px`)
}

function syncExplorerLayout() {
  const detailOpen =
    state.viewMode === "explorer" && !!state.detailPath && !state.searchActive
  const mobileOverlay = isMobileDetailOverlay()
  syncToolbarHeight()
  layoutEl.classList.toggle(
    "layout--tree-only",
    state.viewMode === "explorer" && (!detailOpen || state.searchActive || mobileOverlay),
  )
  layoutEl.classList.toggle("layout--detail-open", detailOpen && !mobileOverlay)
  layoutEl.classList.toggle("layout--detail-overlay", mobileOverlay)
  layoutEl.classList.toggle("layout--db", state.viewMode === "db")
  detailPanel.classList.toggle("detail--overlay", mobileOverlay)
}

function hideDetailPanel() {
  state.detailPath = null
  detailPanel.innerHTML = ""
  syncExplorerLayout()
}

function listingRows(): HTMLButtonElement[] {
  if (state.searchActive && state.searchQuery) {
    return [...treePanel.querySelectorAll<HTMLButtonElement>(".search-result-row")]
  }
  return [...treePanel.querySelectorAll<HTMLButtonElement>(".tree-row")]
}

function focusListingPath(path: string, options?: { preventScroll?: boolean }) {
  const row = listingRows().find((item) => item.dataset.path === path)
  if (!row) {
    return
  }
  row.focus({ preventScroll: options?.preventScroll ?? false })
  if (!options?.preventScroll) {
    row.scrollIntoView({ block: "center", behavior: "smooth" })
  }
}

function selectedListingEntry(): { path: string; kind: "file" | "dir" } | null {
  const row = listingRows().find((item) => item.dataset.path === state.selectedPath)
  if (!row?.dataset.path || !row.dataset.kind) {
    return null
  }
  return { path: row.dataset.path, kind: row.dataset.kind as "file" | "dir" }
}

function syncPanelForEntry(kind: "file" | "dir", path: string) {
  if (kind === "file") {
    state.detailPath = path
    syncExplorerLayout()
    return
  }
  hideDetailPanel()
}

async function focusEntry(path: string, kind: "file" | "dir", options?: { keepSearch?: boolean }) {
  if (!path || !state.loaded) {
    return
  }
  state.selectedPath = path
  state.error = ""
  if (!options?.keepSearch) {
    state.searchActive = false
  }
  syncPanelForEntry(kind, path)
  await expandAncestors(path)
  await render()
  const mobileFileOverlay = kind === "file" && isMobileDetailOverlay()
  focusListingPath(path, { preventScroll: mobileFileOverlay })
  if (kind === "file" && !mobileFileOverlay) {
    detailPanel.scrollTo({ top: 0, behavior: "smooth" })
  }
}

async function siblingsOf(path: string | null): Promise<TreeNode[]> {
  const parent = path ? parentDirPath(path) : null
  return state.treeCache.get(treeCacheKey(parent)) ?? await ensureChildren(parent)
}

async function focusParentOf(path: string): Promise<boolean> {
  const parent = parentDirPath(path)
  if (!parent) {
    return false
  }
  await focusEntry(parent, "dir")
  return true
}

async function focusNextSiblingOfParent(path: string): Promise<boolean> {
  const parent = parentDirPath(path)
  if (!parent) {
    return false
  }
  const parentSiblings = await siblingsOf(parent)
  const parentIndex = parentSiblings.findIndex((node) => node.path === parent)
  if (parentIndex < 0 || parentIndex >= parentSiblings.length - 1) {
    return false
  }
  const next = parentSiblings[parentIndex + 1]
  await focusEntry(next.path, next.kind)
  return true
}

async function handleTreeArrowLeft() {
  const selected = selectedListingEntry()
  if (!selected) {
    await moveListingSelection(-1)
    return
  }
  if (selected.kind === "dir" && state.expanded.has(selected.path)) {
    state.expanded.delete(selected.path)
    syncPanelForEntry(selected.kind, selected.path)
    await render()
    focusListingPath(selected.path)
    return
  }
  if (await focusParentOf(selected.path)) {
    return
  }
  await moveListingSelection(-1)
}

async function handleTreeArrowRight() {
  let selected = selectedListingEntry()
  if (!selected) {
    const siblings = await siblingsOf(null)
    if (!siblings.length) {
      return
    }
    await focusEntry(siblings[0].path, siblings[0].kind)
    return
  }

  if (selected.kind !== "dir") {
    focusListingPath(selected.path)
    return
  }

  if (!state.expanded.has(selected.path)) {
    state.expanded.add(selected.path)
    await ensureChildren(selected.path)
    await focusEntry(selected.path, "dir")
    return
  }

  const children = await ensureChildren(selected.path)
  if (!children.length) {
    focusListingPath(selected.path)
    return
  }

  const child = children[0]
  await focusEntry(child.path, child.kind)
}

async function moveListingSelection(delta: number) {
  if (state.searchActive && state.searchQuery) {
    if (!state.searchHits.length) {
      return
    }
    let rows = listingRows()
    if (!rows.length) {
      await render()
      rows = listingRows()
      if (!rows.length) {
        return
      }
    }
    let index = rows.findIndex((row) => row.dataset.path === state.selectedPath)
    if (index < 0) {
      index = delta > 0 ? 0 : rows.length - 1
    } else {
      index = Math.max(0, Math.min(rows.length - 1, index + delta))
    }
    const row = rows[index]
    const path = row?.dataset.path
    if (!path) {
      return
    }
    state.selectedPath = path
    await render()
    focusListingPath(path)
    return
  }

  const siblings = await siblingsOf(state.selectedPath || null)
  if (!siblings.length) {
    return
  }

  let index = state.selectedPath
    ? siblings.findIndex((node) => node.path === state.selectedPath)
    : -1
  if (index < 0) {
    const node = delta > 0 ? siblings[0] : siblings[siblings.length - 1]
    await focusEntry(node.path, node.kind)
    return
  }

  const nextIndex = index + delta
  if (nextIndex < 0) {
    await focusParentOf(state.selectedPath)
    return
  }
  if (nextIndex >= siblings.length) {
    if (delta > 0 && state.selectedPath) {
      await focusNextSiblingOfParent(state.selectedPath)
    }
    return
  }

  const node = siblings[nextIndex]
  await focusEntry(node.path, node.kind)
}

function blurSearchForTreeKeys() {
  if (document.activeElement === searchInput) {
    searchInput.blur()
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
    row.dataset.kind = node.kind;
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
      }
      await focusEntry(node.path, node.kind)
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function fileExternalUrl(details: PathDetails): string | null {
  if (!state.remote || !details.overlay) {
    return null
  }
  const ref = resolveBlobRef(state.remote, details.overlay.commit_sha)
  if (!ref) {
    return null
  }
  return fileBlobUrl(state.remote, details.path, ref)
}

function renderDetailMeta(details: PathDetails): string {
  const overlay = details.overlay
  if (!overlay) {
    return ""
  }
  const text = joinMeta([overlay.author_name, formatTime(overlay.commit_time), overlay.message])
  if (!text) {
    return ""
  }
  const escaped = escapeHtml(text)
  if (!state.remote || !overlay.commit_sha) {
    return `<p class="meta">${escaped}</p>`
  }
  const url = commitUrl(state.remote, overlay.commit_sha)
  return `<p class="meta"><a class="detail-meta-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escaped}</a></p>`
}

function renderDetailTitle(details: PathDetails): string {
  const path = escapeHtml(details.path)
  const url = fileExternalUrl(details)
  if (!url) {
    return `<h2>${path}</h2>`
  }
  const label = state.remote?.host.includes("gitlab") ? "Open on GitLab" : "Open on GitHub"
  return `<h2><a class="detail-title-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${label}">${path}</a></h2>`
}

function renderSymbolItem(details: PathDetails, symbol: PathDetails["symbols"][number]): string {
  const range = `<span class="meta">${formatSymbolRange(symbol.start_line, symbol.end_line)}</span>`
  if (!state.remote || !details.overlay) {
    return `<li>${escapeHtml(symbol.display_name)} ${range}</li>`
  }
  const ref = resolveBlobRef(state.remote, details.overlay.commit_sha)
  if (!ref) {
    return `<li>${escapeHtml(symbol.display_name)} ${range}</li>`
  }
  const url = fileBlobUrl(state.remote, details.path, ref, symbol.start_line, symbol.end_line)
  return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(symbol.display_name)}</a> ${range}</li>`
}

function renderDetails(details: PathDetails) {
  const overlay = details.overlay;
  detailPanel.innerHTML = `
    <div class="detail-header">
      ${renderDetailTitle(details)}
      <button type="button" class="detail-close" aria-label="Close file panel" title="Close file details and expand the tree to full width.">×</button>
    </div>
    ${renderDetailMeta(details)}
    ${overlay?.summary ? `<p>${overlay.summary}</p>` : ""}
    ${details.owners.length ? `<section class="section"><h3>Owners</h3>${renderOwnerList(details.owners)}</section>` : ""}
    <section class="section">
      <h3>Defined symbols</h3>
      ${
        details.symbols.length
    ? `<ul class="link-list">${details.symbols.map((symbol) => renderSymbolItem(details, symbol)).join("")}</ul>`
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
        void focusEntry(path, "file");
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

function renderOwnerList(handles: string[]): string {
  return `<ul class="owner-list">${handles.map((handle) => `<li>${handle}</li>`).join("")}</ul>`
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
  await focusEntry(hit.path, hit.kind)
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
    row.className = `search-result-row${state.selectedPath === hit.path ? " selected" : ""}`
    row.dataset.path = hit.path
    row.dataset.kind = hit.kind
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
  syncExplorerLayout()
}

function syncDownloadButton() {
  downloadBtn.hidden = !canDownloadApp()
}

function syncLoadChrome() {
  loadScreen.hidden = state.loaded
  if (!state.loaded) {
    state.shortcutsOpen = false
    state.shortcutsHover = false
  }
  layoutEl.classList.toggle("layout--awaiting-db", !state.loaded)
  searchInput.disabled = !state.loaded || state.viewMode === "db"
  viewExplorerBtn.disabled = !state.loaded
  viewDbBtn.disabled = !state.loaded
  syncDownloadButton()
  syncShortcutsPanel()
}

async function selectTable(table: string, offset = 0) {
  state.selectedTable = table
  state.tableOffset = offset
  state.error = ""
  await render()
}

function scrollSelectedDbTableIntoView() {
  requestAnimationFrame(() => {
    treePanel.querySelector<HTMLButtonElement>(".db-table-row.selected")?.scrollIntoView({ block: "nearest" })
  })
}

async function moveDbTable(delta: number) {
  if (!state.inspectTables.length) {
    state.inspectTables = await fetchInspectTables()
  }
  const names = flattenInspectTableNames(groupInspectTables(state.inspectTables))
  if (!names.length) {
    return
  }
  const index = state.selectedTable ? names.indexOf(state.selectedTable) : -1
  const current = index >= 0 ? index : 0
  const next = current + delta
  if (next < 0 || next >= names.length) {
    return
  }
  await selectTable(names[next], 0)
  scrollSelectedDbTableIntoView()
}

async function moveDbPage(delta: number) {
  if (!state.selectedTable || !state.tablePageInfo) {
    return
  }
  const { rowCount, limit } = state.tablePageInfo
  const nextOffset = state.tableOffset + delta * limit
  if (nextOffset < 0 || nextOffset >= rowCount) {
    return
  }
  await selectTable(state.selectedTable, nextOffset)
}

function handleDbKeydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return
  }
  if (
    event.key !== "ArrowUp" &&
    event.key !== "ArrowDown" &&
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight"
  ) {
    return
  }
  event.preventDefault()
  if (event.key === "ArrowUp") {
    void moveDbTable(-1)
    return
  }
  if (event.key === "ArrowDown") {
    void moveDbTable(1)
    return
  }
  if (event.key === "ArrowLeft") {
    void moveDbPage(-1)
    return
  }
  void moveDbPage(1)
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
    scrollSelectedDbTableIntoView()
    if (state.selectedTable) {
      const data = await renderDbDetails(detailPanel, state.selectedTable, state.tableOffset, (nextOffset) => {
        void selectTable(state.selectedTable!, nextOffset)
      })
      state.tablePageInfo = { rowCount: data.rowCount, limit: data.limit }
    } else {
      state.tablePageInfo = null
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
  if (state.detailPath && !state.searchActive) {
    await restoreDetailIfOpen()
  }
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
  const health = await loadDatabase(bytes, file.name);
  state.loaded = true;
  state.remote = health.remote;
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
  state.shortcutsOpen = false
  state.shortcutsHover = false
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

document.addEventListener("keydown", (event) => {
  if (
    state.loaded &&
    !searchInput.disabled &&
    event.key === "f" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  ) {
    event.preventDefault()
    searchInput.focus()
    searchInput.select()
    return
  }
  if (
    state.loaded &&
    event.key === "?" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    if (isEditableTarget(event.target) && event.target !== searchInput) {
      return
    }
    event.preventDefault()
    toggleShortcutsPanel()
    return
  }
  if (!state.loaded) {
    return
  }
  if (state.viewMode === "db") {
    handleDbKeydown(event)
    return
  }
  if (state.viewMode !== "explorer" || searchInput.disabled) {
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return
  }

  if (
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "PageUp" ||
    event.key === "PageDown" ||
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight"
  ) {
    const fromSearch = event.target === searchInput
    if (fromSearch && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      return
    }
    if (fromSearch || !isEditableTarget(event.target)) {
      event.preventDefault()
      blurSearchForTreeKeys()
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const delta = event.key === "ArrowDown" ? 1 : -1
        void moveListingSelection(delta)
      } else if (event.key === "PageUp" || event.key === "PageDown") {
        const delta = event.key === "PageDown" ? PAGE_STEPS : -PAGE_STEPS
        void moveListingSelection(delta)
      } else if (!state.searchActive || !state.searchQuery) {
        if (event.key === "ArrowLeft") {
          void handleTreeArrowLeft()
        } else {
          void handleTreeArrowRight()
        }
      }
    }
    return
  }

  if (event.key === "Escape") {
    if (event.target === searchInput) {
      return
    }
    if (state.detailPath) {
      event.preventDefault()
      hideDetailPanel()
    }
    return
  }

  if (isEditableTarget(event.target)) {
    return
  }
  if (event.key.length !== 1 || !/^[a-zA-Z]$/.test(event.key)) {
    return
  }
  event.preventDefault()
  focusSearchWithKey(event.key)
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

syncDownloadButton()

downloadBtn.addEventListener("click", () => {
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
      state.loaded = true
      state.remote = health.remote
      state.shortcutsOpen = false
      state.shortcutsHover = false
    }
  })
  .catch(() => {})
  .finally(() => {
    void render();
  });
