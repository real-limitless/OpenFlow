/** Weak Redis passwords. There is no dev default. */
const WEAK_REDIS_PASSWORDS = new Set([
  "",
  "openflow",
  "redis",
  "password",
  "secret",
  "changeme",
  "change-me",
  "replace-me",
  "replace-with",
]);

export function isWeakRedisPassword(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (WEAK_REDIS_PASSWORDS.has(trimmed.toLowerCase())) return true;
  return /^(replace-me|replace-with|changeme|change-me)/i.test(trimmed);
}

export function buildRedisUrl(opts: { password: string; host?: string; port?: string }): string {
  const host = (opts.host ?? "redis").trim() || "redis";
  const port = (opts.port ?? "6379").trim() || "6379";
  return `redis://:${encodeURIComponent(opts.password)}@${host}:${port}`;
}

/** Password embedded in REDIS_URL. null when the URL cannot be parsed. */
export function redisPasswordFromUrl(url: string | undefined): string | null {
  if (!url) return "";
  try {
    return decodeURIComponent(new URL(url).password);
  } catch {
    return null;
  }
}
