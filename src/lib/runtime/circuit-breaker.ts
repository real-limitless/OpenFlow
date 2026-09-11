export type BreakerState = "closed" | "open" | "half_open";

export type CircuitBreakerConfig = {
  enabled: boolean;
  failureThreshold: number;
  cooldownMs: number;
  halfOpenMaxCalls: number;
  ignoreHosts: string[];
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  enabled: true,
  failureThreshold: 5,
  cooldownMs: 30_000,
  halfOpenMaxCalls: 1,
  ignoreHosts: [],
};

export type BreakerSnapshot = {
  key: string;
  kind: "host" | "credential";
  state: BreakerState;
  failures: number;
  openedAt: number | null;
  lastFailureAt: number | null;
  lastStatus: number | null;
  cooldownRemainingMs: number;
};

type Entry = {
  state: BreakerState;
  failures: number;
  openedAt: number | null;
  lastFailureAt: number | null;
  lastStatus: number | null;
  halfOpenInFlight: number;
};

export class CircuitOpenError extends Error {
  readonly key: string;
  readonly retryAfterSec: number;

  constructor(key: string, retryAfterSec: number) {
    super(`Circuit breaker open for ${key} (retry after ${retryAfterSec}s)`);
    this.name = "CircuitOpenError";
    this.key = key;
    this.retryAfterSec = retryAfterSec;
  }
}

export function isTripStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function hostFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.trim().toLowerCase();
    return hostname || null;
  } catch {
    return null;
  }
}

export function breakerKeysForHttp(
  url: string,
  credentials?: Record<string, { id?: string | null } | undefined>,
): string[] {
  const keys: string[] = [];
  const host = hostFromUrl(url);
  if (host) keys.push(`host:${host}`);
  if (credentials) {
    for (const ref of Object.values(credentials)) {
      const id = ref?.id?.trim();
      if (id) keys.push(`credential:${id}`);
    }
  }
  return keys;
}

function kindOf(key: string): "host" | "credential" {
  return key.startsWith("credential:") ? "credential" : "host";
}

function hostOfKey(key: string): string | null {
  return key.startsWith("host:") ? key.slice(5) : null;
}

export class CircuitBreakerRegistry {
  private config: CircuitBreakerConfig;
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG, now: () => number = Date.now) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.now = now;
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config, ignoreHosts: [...this.config.ignoreHosts] };
  }

  setConfig(patch: Partial<CircuitBreakerConfig>): CircuitBreakerConfig {
    const next = { ...this.config, ...patch };
    if (typeof next.failureThreshold === "number") {
      next.failureThreshold = Math.max(1, Math.floor(next.failureThreshold));
    }
    if (typeof next.cooldownMs === "number") {
      next.cooldownMs = Math.max(1000, Math.floor(next.cooldownMs));
    }
    if (typeof next.halfOpenMaxCalls === "number") {
      next.halfOpenMaxCalls = Math.max(1, Math.floor(next.halfOpenMaxCalls));
    }
    if (Array.isArray(patch.ignoreHosts)) {
      next.ignoreHosts = patch.ignoreHosts
        .map((h) => String(h).trim().toLowerCase())
        .filter(Boolean);
    }
    this.config = next;
    return this.getConfig();
  }

  assertAllowed(keys: string[]): void {
    if (!this.config.enabled) return;
    for (const key of this.activeKeys(keys)) {
      const entry = this.touch(key);
      if (entry.state === "open") {
        const remaining = this.remainingMs(entry);
        throw new CircuitOpenError(key, Math.max(1, Math.ceil(remaining / 1000)));
      }
      if (entry.state === "half_open") {
        if (entry.halfOpenInFlight >= this.config.halfOpenMaxCalls) {
          throw new CircuitOpenError(key, 1);
        }
        entry.halfOpenInFlight += 1;
      }
    }
  }

  recordSuccess(keys: string[]): void {
    if (!this.config.enabled) return;
    for (const key of this.activeKeys(keys)) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      entry.failures = 0;
      entry.state = "closed";
      entry.openedAt = null;
      entry.halfOpenInFlight = 0;
      entry.lastStatus = 200;
    }
  }

  recordFailure(keys: string[], status?: number): void {
    if (!this.config.enabled) return;
    const t = this.now();
    for (const key of this.activeKeys(keys)) {
      const entry = this.touch(key);
      entry.failures += 1;
      entry.lastFailureAt = t;
      entry.lastStatus = status ?? null;
      entry.halfOpenInFlight = 0;
      if (entry.state === "half_open" || entry.failures >= this.config.failureThreshold) {
        entry.state = "open";
        entry.openedAt = t;
      }
    }
  }

  list(): BreakerSnapshot[] {
    const t = this.now();
    const out: BreakerSnapshot[] = [];
    for (const key of [...this.entries.keys()].sort()) {
      const entry = this.touch(key);
      out.push({
        key,
        kind: kindOf(key),
        state: entry.state,
        failures: entry.failures,
        openedAt: entry.openedAt,
        lastFailureAt: entry.lastFailureAt,
        lastStatus: entry.lastStatus,
        cooldownRemainingMs: entry.state === "open" ? Math.max(0, (entry.openedAt ?? t) + this.config.cooldownMs - t) : 0,
      });
    }
    return out;
  }

  reset(key?: string): void {
    if (!key) {
      this.entries.clear();
      return;
    }
    this.entries.delete(key);
  }

  private activeKeys(keys: string[]): string[] {
    const ignore = new Set(this.config.ignoreHosts);
    return keys.filter((key) => {
      const host = hostOfKey(key);
      if (host && ignore.has(host)) return false;
      return true;
    });
  }

  private remainingMs(entry: Entry): number {
    const opened = entry.openedAt ?? this.now();
    return Math.max(0, opened + this.config.cooldownMs - this.now());
  }

  private touch(key: string): Entry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        state: "closed",
        failures: 0,
        openedAt: null,
        lastFailureAt: null,
        lastStatus: null,
        halfOpenInFlight: 0,
      };
      this.entries.set(key, entry);
      return entry;
    }
    if (entry.state === "open") {
      const remaining = this.remainingMs(entry);
      if (remaining <= 0) {
        entry.state = "half_open";
        entry.halfOpenInFlight = 0;
      }
    }
    return entry;
  }
}

let singleton: CircuitBreakerRegistry | null = null;

export function getCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!singleton) singleton = new CircuitBreakerRegistry(configFromEnv());
  return singleton;
}

export function resetCircuitBreakerRegistryForTests(registry?: CircuitBreakerRegistry): void {
  singleton = registry ?? new CircuitBreakerRegistry(configFromEnv());
}

export function parseCircuitBreakerConfig(
  raw: unknown,
  env: NodeJS.ProcessEnv = process.env,
): CircuitBreakerConfig {
  const base: CircuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ignoreHosts: [] };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.enabled === "boolean") base.enabled = o.enabled;
    if (typeof o.failureThreshold === "number" && Number.isFinite(o.failureThreshold)) {
      base.failureThreshold = Math.max(1, Math.floor(o.failureThreshold));
    }
    if (typeof o.cooldownMs === "number" && Number.isFinite(o.cooldownMs)) {
      base.cooldownMs = Math.max(1000, Math.floor(o.cooldownMs));
    }
    if (typeof o.halfOpenMaxCalls === "number" && Number.isFinite(o.halfOpenMaxCalls)) {
      base.halfOpenMaxCalls = Math.max(1, Math.floor(o.halfOpenMaxCalls));
    }
    if (Array.isArray(o.ignoreHosts)) {
      base.ignoreHosts = o.ignoreHosts.map((h) => String(h).trim().toLowerCase()).filter(Boolean);
    }
  }
  if (env.OPENFLOW_CIRCUIT_BREAKER === "false" || env.OPENFLOW_CIRCUIT_BREAKER === "0") {
    base.enabled = false;
  } else if (env.OPENFLOW_CIRCUIT_BREAKER === "true" || env.OPENFLOW_CIRCUIT_BREAKER === "1") {
    base.enabled = true;
  }
  const thr = parseInt(env.OPENFLOW_CIRCUIT_FAILURE_THRESHOLD ?? "", 10);
  if (Number.isFinite(thr) && env.OPENFLOW_CIRCUIT_FAILURE_THRESHOLD) {
    base.failureThreshold = Math.max(1, thr);
  }
  const cd = parseInt(env.OPENFLOW_CIRCUIT_COOLDOWN_MS ?? "", 10);
  if (Number.isFinite(cd) && env.OPENFLOW_CIRCUIT_COOLDOWN_MS) {
    base.cooldownMs = Math.max(1000, cd);
  }
  return base;
}

function configFromEnv(): CircuitBreakerConfig {
  return parseCircuitBreakerConfig(null);
}
