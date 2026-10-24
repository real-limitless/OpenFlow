const SECRET_EXACT = new Set([
  "password",
  "passwd",
  "pass",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "apikey",
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "keyhash",
  "privatekey",
  "clientsecret",
  "session",
  "csrftoken",
  "rawkey",
  "credential",
  "credentials",
  "secretkey",
]);

const REDACTED = "[redacted]";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSecretLogKey(key: string): boolean {
  const n = normalizeKey(key);
  if (!n) return false;
  if (SECRET_EXACT.has(n)) return true;
  return (
    n.includes("password") ||
    n.includes("secret") ||
    n.includes("token") ||
    n.includes("apikey") ||
    n.includes("authorization") ||
    n.includes("cookie") ||
    n.includes("privatekey") ||
    n.includes("keyhash") ||
    n.includes("credential")
  );
}

/** Replace raw API keys and bearer values inside a string. */
export function redactLogString(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/of_[0-9a-f]{16,}/gi, (match) => `${match.slice(0, 8)}[redacted]`);
}

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (value == null) return value;
  if (typeof value === "string") return redactLogString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretLogKey(key)) {
        out[key] = REDACTED;
        continue;
      }
      out[key] = redactForLog(inner, depth + 1);
    }
    return out;
  }
  return String(value);
}
