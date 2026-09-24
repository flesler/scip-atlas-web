import { readReleaseFromMeta } from "./release.js"

export type ShortcutRow = {
  keys: string
  action: string
}

export type ShortcutSection = {
  title: string
  rows: ShortcutRow[]
}

export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "General",
    rows: [
      { keys: "?", action: "Show or hide this panel" },
      { keys: "Ctrl/Cmd F", action: "Focus search" },
      { keys: "a–z", action: "Type to search from anywhere" },
    ],
  },
  {
    title: "Explorer tree",
    rows: [
      { keys: "↑ / ↓", action: "Move among siblings (not into children)" },
      { keys: "Page Up / Down", action: "Move by 5 rows" },
      { keys: "←", action: "Collapse dir or go to parent" },
      { keys: "→", action: "Expand dir or first child" },
    ],
  },
  {
    title: "DB view",
    rows: [
      { keys: "← / →", action: "Previous / next page of rows" },
      { keys: "↑ / ↓", action: "Previous / next table" },
    ],
  },
]

function renderSection(section: ShortcutSection): HTMLElement {
  const block = document.createElement("section")
  block.className = "shortcuts-section"
  const title = document.createElement("h3")
  title.textContent = section.title
  block.appendChild(title)

  const list = document.createElement("dl")
  list.className = "shortcuts-list"
  for (const row of section.rows) {
    const dt = document.createElement("dt")
    dt.innerHTML = row.keys
      .split(" / ")
      .map((key) => `<kbd>${key}</kbd>`)
      .join('<span class="shortcuts-key-sep">/</span>')
    const dd = document.createElement("dd")
    dd.textContent = row.action
    list.appendChild(dt)
    list.appendChild(dd)
  }
  block.appendChild(list)
  return block
}

function renderShortcutsBody(): HTMLElement {
  const body = document.createElement("div")
  body.className = "shortcuts-body"
  for (const section of SHORTCUT_SECTIONS) {
    body.appendChild(renderSection(section))
  }
  return body
}

const RELEASE_NOTEBOOK_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M4.5 1A1.5 1.5 0 0 0 3 2.5v11A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 11.5 1h-7z"/><path fill="currentColor" d="M5 1v14"/><path fill="currentColor" fill-opacity=".45" d="M7 4h5v1H7zm0 2.5h5v1H7zm0 2.5h4v1H7z"/></svg>'

function mountReleaseButton(dialog: HTMLElement) {
  const release = readReleaseFromMeta()
  if (!release) {
    return
  }
  const button = document.createElement("button")
  button.type = "button"
  button.className = "shortcuts-release-btn"
  button.innerHTML = RELEASE_NOTEBOOK_ICON
  button.title = `Release: ${release}`
  button.setAttribute("aria-label", `Copy release SHA ${release}`)
  button.addEventListener("click", () => {
    void navigator.clipboard.writeText(release)
  })
  dialog.appendChild(button)
  dialog.classList.add("shortcuts-dialog--has-release")
}

export function mountShortcutsInline(parent: HTMLElement): HTMLDivElement {
  const inline = document.createElement("div")
  inline.className = "shortcuts-inline"
  inline.setAttribute("aria-label", "Keyboard shortcuts")

  const heading = document.createElement("h2")
  heading.className = "shortcuts-inline-title"
  heading.textContent = "Keyboard shortcuts"
  inline.appendChild(heading)
  inline.appendChild(renderShortcutsBody())
  parent.appendChild(inline)
  return inline
}

export function mountShortcutsFab(
  root: HTMLElement,
  handlers: {
    onClick: () => void
    onMouseEnter: () => void
    onMouseLeave: () => void
  },
): HTMLButtonElement {
  const fab = document.createElement("button")
  fab.type = "button"
  fab.className = "shortcuts-fab"
  fab.setAttribute("aria-label", "Keyboard shortcuts")
  fab.setAttribute("aria-expanded", "false")
  fab.title = "Keyboard shortcuts (?). Click to pin; hover to preview."
  fab.textContent = "?"
  fab.addEventListener("click", handlers.onClick)
  fab.addEventListener("mouseenter", handlers.onMouseEnter)
  fab.addEventListener("mouseleave", handlers.onMouseLeave)
  root.appendChild(fab)
  return fab
}

export function mountShortcutsOverlay(root: HTMLElement, onClose: () => void): HTMLDivElement {
  const overlay = document.createElement("div")
  overlay.className = "shortcuts-overlay"
  overlay.hidden = true
  overlay.setAttribute("role", "dialog")
  overlay.setAttribute("aria-modal", "true")
  overlay.setAttribute("aria-label", "Keyboard shortcuts")

  const dialog = document.createElement("div")
  dialog.className = "shortcuts-dialog"

  const header = document.createElement("div")
  header.className = "shortcuts-header"
  const heading = document.createElement("h2")
  heading.textContent = "Keyboard shortcuts"
  const close = document.createElement("button")
  close.type = "button"
  close.className = "shortcuts-close"
  close.setAttribute("aria-label", "Close shortcuts")
  close.title = "Close"
  close.textContent = "×"
  close.addEventListener("click", onClose)
  header.appendChild(heading)
  header.appendChild(close)
  dialog.appendChild(header)
  dialog.appendChild(renderShortcutsBody())
  mountReleaseButton(dialog)

  overlay.appendChild(dialog)
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      onClose()
    }
  })
  root.appendChild(overlay)
  return overlay
}

export function setShortcutsOverlayOpen(overlay: HTMLElement, open: boolean) {
  overlay.hidden = !open
}
