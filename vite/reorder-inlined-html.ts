import type { Plugin } from "vite"

export function reorderInlinedHtml(html: string): string {
  const styleMatch = html.match(/<style[^>]*>[\s\S]*?<\/style>/)
  const scriptMatch = html.match(/<script[^>]*>[\s\S]*?<\/script>/)
  if (!styleMatch || !scriptMatch) {
    throw new Error("reorder-inlined-html: expected one inlined <style> and <script>")
  }

  const titleMatch = html.match(/<title>[^<]*<\/title>/)
  const title = titleMatch?.[0] ?? "<title>SCIP Atlas Explorer</title>"

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${title}
    ${styleMatch[0]}
  </head>
  <body>
    <div id="app"></div>
    ${scriptMatch[0]}
  </body>
</html>
`
}

/** vite-plugin-singlefile inlines assets in place and cannot choose tag order. */
export function reorderSingleFileHtml(): Plugin {
  return {
    name: "reorder-singlefile-html",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "asset" && chunk.fileName.endsWith(".html")) {
          chunk.source = reorderInlinedHtml(chunk.source as string)
        }
      }
      for (const name of Object.keys(bundle)) {
        if (!name.endsWith(".html")) {
          delete bundle[name]
        }
      }
    },
  }
}
