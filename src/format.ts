export function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

export function formatDisplayValue(value: unknown): string {
  if (isNullish(value)) {
    return "";
  }
  if (value instanceof Uint8Array) {
    return `[blob ${value.byteLength} bytes]`;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function formatDbCell(value: unknown): string {
  if (isNullish(value)) {
    return "NULL";
  }
  if (value instanceof Uint8Array) {
    return `[blob ${value.byteLength} bytes]`;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return String(value);
}

export function joinMeta(parts: Array<string | number | null | undefined>, separator = " · "): string {
  return parts
    .map((part) => formatDisplayValue(part))
    .filter((part) => part.length > 0)
    .join(separator);
}
