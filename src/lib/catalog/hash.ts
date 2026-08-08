import { createHash } from "node:crypto";

/** Stable content hash for incremental reindex. */
export function contentHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n\u0000\n"), "utf8").digest("hex").slice(0, 32);
}

/**
 * Offline feature-hash embedding (no API). Useful for tests and cold start.
 * Not as good as real embeddings but preserves token overlap signal.
 */
export function hashEmbed(text: string, dimensions: number): number[] {
  const vec = new Float64Array(dimensions);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9@./_\-\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) {
    vec[0] = 1;
    return Array.from(vec);
  }
  for (const tok of tokens) {
    const h = createHash("sha256").update(tok).digest();
    const idx = h.readUInt32BE(0) % dimensions;
    const sign = h[4] & 1 ? 1 : -1;
    const weight = 1 + Math.min(3, tok.length / 6);
    vec[idx] += sign * weight;
    // bigrams
    const h2 = createHash("sha256").update(`#${tok}`).digest();
    const idx2 = h2.readUInt32BE(0) % dimensions;
    vec[idx2] += sign * 0.35;
  }
  return l2Normalize(Array.from(vec));
}

export function l2Normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return dot;
}

export function padOrTrim(vec: number[], dimensions: number): number[] {
  if (vec.length === dimensions) return vec;
  if (vec.length > dimensions) return l2Normalize(vec.slice(0, dimensions));
  const out = vec.slice();
  while (out.length < dimensions) out.push(0);
  return l2Normalize(out);
}
