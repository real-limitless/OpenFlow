export const DEFAULT_API_KEY_MAX_TTL_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60_000;

export function apiKeyMaxTtlDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.API_KEY_MAX_TTL_DAYS;
  if (raw == null || String(raw).trim() === "") return DEFAULT_API_KEY_MAX_TTL_DAYS;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_API_KEY_MAX_TTL_DAYS;
  return n;
}

export function apiKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, 8);
}

export type ApiKeyExpiryResult = { ok: true; expiresAt: Date } | { ok: false; error: string };

/**
 * Missing expiresAt receives the configured maximum lifetime.
 * A value later than now + API_KEY_MAX_TTL_DAYS is rejected.
 */
export function resolveApiKeyExpiry(
  input: string | null | undefined,
  now = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): ApiKeyExpiryResult {
  const days = apiKeyMaxTtlDays(env);
  const latest = now.getTime() + days * DAY_MS;
  if (input == null || input === "") {
    return { ok: true, expiresAt: new Date(latest) };
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "invalid expiresAt" };
  }
  if (parsed.getTime() <= now.getTime()) {
    return { ok: false, error: "expiresAt must be in the future" };
  }
  if (parsed.getTime() > latest + CLOCK_SKEW_MS) {
    return { ok: false, error: `expiresAt exceeds the maximum lifetime of ${days} days` };
  }
  return { ok: true, expiresAt: parsed };
}
