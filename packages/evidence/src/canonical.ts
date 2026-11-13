/**
 * Canonical JSON and SHA-256, identical in Node 22+ and every modern browser.
 * Two people who compute the same values get the same bytes, so the same hash.
 */

/** JSON with object keys sorted at every level and no whitespace. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`canonical: non-finite number ${value}`);
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (value === undefined) throw new Error("canonical: undefined is not allowed");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

/** Lowercase hex SHA-256 of a UTF-8 string, using WebCrypto (global in Node 22+ and browsers). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of the canonical JSON of a value. */
export function hashOf(value: unknown): Promise<string> {
  return sha256Hex(canonical(value));
}
