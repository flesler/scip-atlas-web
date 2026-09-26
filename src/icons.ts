import fileSvg from "./svg/file.svg?raw"
import folderOpenSvg from "./svg/folder-open.svg?raw"
import folderSvg from "./svg/folder.svg?raw"
import githubSvg from "./svg/github.svg?raw"
import notebookSvg from "./svg/notebook.svg?raw"
import openLinkSvg from "./svg/open-link.svg?raw"

const icons = {
  file: fileSvg,
  folder: folderSvg,
  "folder-open": folderOpenSvg,
  github: githubSvg,
  notebook: notebookSvg,
  "open-link": openLinkSvg,
} as const

export type IconName = keyof typeof icons

type IconOptions = {
  size?: number
  className?: string
}

function parseSvg(raw: string, options: IconOptions = {}): SVGSVGElement {
  const doc = new DOMParser().parseFromString(raw.trim(), "image/svg+xml")
  const svg = doc.documentElement
  if (options.size) {
    svg.setAttribute("width", String(options.size))
    svg.setAttribute("height", String(options.size))
  }
  if (options.className) {
    svg.setAttribute("class", options.className)
  }
  svg.setAttribute("aria-hidden", "true")
  return document.importNode(svg, true) as unknown as SVGSVGElement
}

export function createIcon(name: IconName, options: IconOptions = {}): SVGSVGElement {
  return parseSvg(icons[name], options)
}

export function iconHtml(name: IconName, options: IconOptions = {}): string {
  return createIcon(name, options).outerHTML
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
}

/** Inline link with open-link icon; `textHtml` must already be escaped. */
export function externalLinkHtml(
  href: string,
  textHtml: string,
  options: { className?: string; title?: string; iconSize?: number } = {},
): string {
  const icon = iconHtml("open-link", { size: options.iconSize ?? 12, className: "external-link-icon" })
  const className = ["external-link", options.className].filter(Boolean).join(" ")
  const titleAttr = options.title ? ` title="${escapeAttr(options.title)}"` : ""
  return `<a class="${className}" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${textHtml}<span class="external-link-icon-wrap" aria-hidden="true">${icon}</span></a>`
}

export function createTreeIcon(kind: "dir" | "file", expanded = false): SVGSVGElement {
  if (kind === "file") {
    return createIcon("file", { size: 14, className: "tree-icon" })
  }
  if (expanded) {
    return createIcon("folder-open", { size: 14, className: "tree-icon" })
  }
  return createIcon("folder", { size: 14, className: "tree-icon" })
}
