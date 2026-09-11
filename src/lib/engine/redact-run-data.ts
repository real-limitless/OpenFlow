const SECRET_KEYS = new Set([
  "password",
  "passwd",
  "login_password",
  "api_key",
  "apikey",
  "token",
  "secret",
  "authorization",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "ansible_password",
  "ansible_become_password",
]);

const BEARER = /^(Bearer\s+)\S+/i;
const SK_KEY = /^sk-[A-Za-z0-9_-]{8,}/;
const OF_KEY = /^of[at]?_[A-Za-z0-9_-]{8,}/;

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SECRET_KEYS.has(lower)) return true;
  if (lower.endsWith("password") || lower.endsWith("secret")) return true;
  if (lower.includes("apikey") || lower.includes("api_key")) return true;
  if (lower.startsWith("credential")) return true;
  return false;
}

function redactString(value: string, pii: boolean): string {
  let out = value;
  if (BEARER.test(out)) out = out.replace(BEARER, "$1********");
  if (SK_KEY.test(out) || OF_KEY.test(out)) out = "********";
  if (pii) {
    out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
  }
  return out;
}

export type RedactOptions = {
  /** Also mask email-shaped strings (GDPR-ish run data). */
  pii?: boolean;
};

/** Walk runData (or any JSON) and mask credential-shaped keys and tokens. */
export function redactRunData<T>(value: T, options: RedactOptions = {}): T {
  const pii = Boolean(options.pii);
  if (Array.isArray(value)) {
    return value.map((v) => redactRunData(v, options)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k)) {
        out[k] = "********";
      } else {
        out[k] = redactRunData(v, options);
      }
    }
    return out as T;
  }
  if (typeof value === "string") return redactString(value, pii) as T;
  return value;
}
