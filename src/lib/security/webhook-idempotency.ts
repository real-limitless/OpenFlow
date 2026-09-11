export const IDEMPOTENCY_HEADER = "idempotency-key";
export const IDEMPOTENCY_HEADER_ALT = "x-idempotency-key";

export function defaultIdempotencyWindowSec(): number {
  const n = parseInt(process.env.OPENFLOW_WEBHOOK_IDEMPOTENCY_TTL_SEC ?? "86400", 10);
  return Number.isFinite(n) && n > 0 ? n : 86_400;
}

export function readIdempotencyKey(
  headers: Headers | Record<string, string | undefined>,
): string | null {
  const get = (name: string): string => {
    if (headers instanceof Headers) return headers.get(name) ?? "";
    const direct = headers[name] ?? headers[name.toLowerCase()];
    return typeof direct === "string" ? direct : "";
  };
  const raw = get(IDEMPOTENCY_HEADER) || get(IDEMPOTENCY_HEADER_ALT);
  const key = raw.trim();
  return key.length > 0 ? key.slice(0, 256) : null;
}

export function idempotencyRedisKey(path: string, key: string): string {
  return `openflow:idem:webhook:${path}:${key}`;
}

type Entry = { executionId: string; expiresAt: number };

export class MemoryIdempotencyStore {
  private readonly map = new Map<string, Entry>();

  constructor(private readonly ttlMs: number) {}

  get(storeKey: string, now = Date.now()): string | null {
    const row = this.map.get(storeKey);
    if (!row) return null;
    if (row.expiresAt <= now) {
      this.map.delete(storeKey);
      return null;
    }
    return row.executionId;
  }

  set(storeKey: string, executionId: string, now = Date.now()): void {
    this.map.set(storeKey, { executionId, expiresAt: now + this.ttlMs });
  }
}
