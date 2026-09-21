const SVG_NS = "http://www.w3.org/2000/svg"

function svgIcon(pathD: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("class", "tree-icon")
  svg.setAttribute("width", "14")
  svg.setAttribute("height", "14")
  svg.setAttribute("viewBox", "0 0 16 16")
  svg.setAttribute("aria-hidden", "true")
  const path = document.createElementNS(SVG_NS, "path")
  path.setAttribute("d", pathD)
  path.setAttribute("fill", "currentColor")
  svg.appendChild(path)
  return svg
}

export function createTreeIcon(kind: "dir" | "file", expanded = false): SVGSVGElement {
  if (kind === "file") {
    return svgIcon("M4 1.5h5.2L13 4.8V14.5H4V1.5zm5.5 1.1V4.5H11.4L9.5 2.6z")
  }
  if (expanded) {
    return svgIcon("M2 4.5h12v8.5H2V4.5zm0-1.5h5.2L8.7 4.5H14V3H2z")
  }
  return svgIcon("M2 3h5.2L8.7 5.5H14v8.5H2V3z")
}
