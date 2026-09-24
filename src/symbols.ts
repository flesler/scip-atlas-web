export function moduleFileDisplayName(symbol: string): string | null {
  if (!symbol.endsWith("/")) {
    return null
  }
  const ticked = symbol.match(/`([^`]+)`\/?$/)
  if (ticked) {
    let name = ticked[1]
    if (name.endsWith("/")) {
      name = name.slice(0, -1)
    }
    return name.split("/").at(-1) || null
  }
  const segment = symbol.slice(0, -1).split("/").at(-1) ?? ""
  const name = segment.replaceAll("`", "").replace(/\/$/, "")
  return name || null
}

export function isConstructorSymbol(symbol: string): boolean {
  return symbol.includes("`<constructor>`")
}

export function isConstructorParameterSymbol(symbol: string): boolean {
  return symbol.includes("`<constructor>`().(")
}

export function constructorClassDisplayName(symbol: string): string | null {
  const leaf = symbol.split("/").at(-1) ?? ""
  const match = leaf.match(/^(.+?)#`<constructor>`/)
  if (!match) {
    return null
  }
  return match[1].replaceAll("`", "") || null
}

export function classOwnerKey(symbol: string): string | null {
  if (isConstructorSymbol(symbol)) {
    const name = constructorClassDisplayName(symbol)
    return name ? `${name}#` : null
  }
  const leaf = symbol.split("/").at(-1)?.replaceAll("`", "") ?? ""
  if (leaf.endsWith("#") && !leaf.includes("(")) {
    return leaf
  }
  return null
}

export function extractLeafName(symbol: string): string {
  let leaf = symbol.split("/").at(-1)?.replace(/[.#:]+$/, "") ?? "";
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

export function shouldPackDisplayName(displayName: string): boolean {
  return !displayName.startsWith("_")
}

export function symbolDisplayName(symbol: string, displayName: string | null | undefined): string | null {
  if (displayName) {
    return displayName;
  }
  if (symbol.endsWith("/")) {
    return null;
  }
  if (isConstructorSymbol(symbol)) {
    return constructorClassDisplayName(symbol)
  }
  const leaf = extractLeafName(symbol);
  return leaf || null;
}
