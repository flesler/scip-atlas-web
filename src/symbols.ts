export function extractLeafName(symbol: string): string {
  let leaf = symbol.split("/").at(-1)?.replace(/[.#]+$/, "") ?? "";
  if (leaf.endsWith("()")) {
    leaf = leaf.slice(0, -2);
  }
  if (leaf.includes(":")) {
    leaf = leaf.split(":").at(-1) ?? leaf;
  }
  if (leaf.includes("#")) {
    leaf = leaf.split("#").at(-1) ?? leaf;
  }
  leaf = leaf.replaceAll("`", "");
  if (leaf.startsWith("<get>") || leaf.startsWith("<set>")) {
    leaf = leaf.slice(5);
  }
  return leaf;
}

export function symbolDisplayName(symbol: string, displayName: string | null | undefined): string | null {
  if (displayName) {
    return displayName;
  }
  if (symbol.endsWith("/")) {
    return null;
  }
  const leaf = extractLeafName(symbol);
  return leaf || null;
}
