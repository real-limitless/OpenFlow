/**
 * Client address for rate limits and audit logs.
 *
 * Untrusted peers: use the socket remote address. X-Forwarded-For and
 * CF-Connecting-IP are ignored so a caller cannot pick their bucket.
 *
 * Trusted peer (TRUSTED_PROXY_CIDRS matches the socket, or TRUSTED_PROXY_COUNT
 * is set and no CIDR list is configured): prefer CF-Connecting-IP, otherwise
 * the right-most untrusted X-Forwarded-For hop.
 */

export type ClientIpInput = {
  remoteAddress?: string | null;
  forwardedFor?: string | null;
  cfConnectingIp?: string | null;
  /** Overrides TRUSTED_PROXY_COUNT when set. */
  trustedProxyCount?: number;
  /** Overrides TRUSTED_PROXY_CIDRS when set. */
  trustedProxyCidrs?: string[];
};

type HeaderSource = {
  req: { header: (name: string) => string | undefined };
  env?: unknown;
};

export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  if (!v) return null;
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).trim();
  if (v.startsWith("[") && v.includes("]")) v = v.slice(1, v.indexOf("]"));
  const mapped = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped?.[1]) v = mapped[1];
  return v || null;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    n = ((n << 8) | octet) >>> 0;
  }
  return n;
}

function looksLikeIp(value: string): boolean {
  if (ipv4ToInt(value) != null) return true;
  return value.includes(":") && /^[0-9a-fA-F:]+$/.test(value);
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const normalized = normalizeIp(ip);
  const rule = cidr.trim();
  if (!normalized || !rule) return false;
  const [baseRaw, bitsRaw] = rule.split("/");
  const base = normalizeIp(baseRaw);
  if (!base) return false;
  if (bitsRaw === undefined) return normalized === base;
  const bits = Number(bitsRaw);
  const ipInt = ipv4ToInt(normalized);
  const baseInt = ipv4ToInt(base);
  if (ipInt == null || baseInt == null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function parseTrustedProxyCount(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TRUSTED_PROXY_COUNT?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}

export function parseTrustedProxyCidrs(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.TRUSTED_PROXY_CIDRS?.trim();
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function forwardedHops(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => normalizeIp(part))
    .filter((part): part is string => Boolean(part && looksLikeIp(part)));
}

function firstHeaderIp(header: string | null | undefined): string | null {
  const hop = forwardedHops(header)[0];
  return hop ?? null;
}

function immediatePeerTrusted(remote: string | null, count: number, cidrs: string[]): boolean {
  if (!remote) return false;
  if (cidrs.length > 0) return cidrs.some((cidr) => ipInCidr(remote, cidr));
  return count > 0;
}

function rightMostUntrustedHop(hops: string[], count: number, cidrs: string[]): string | null {
  if (hops.length === 0) return null;
  if (cidrs.length > 0) {
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i];
      if (hop && !cidrs.some((cidr) => ipInCidr(hop, cidr))) return hop;
    }
    return null;
  }
  if (count <= 0) return null;
  const idx = hops.length - count;
  if (idx < 0) return null;
  return hops[idx] ?? null;
}

export function resolveClientIp(
  input: ClientIpInput,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const remote = normalizeIp(input.remoteAddress);
  const count = input.trustedProxyCount ?? parseTrustedProxyCount(env);
  const cidrs = input.trustedProxyCidrs ?? parseTrustedProxyCidrs(env);
  const trusted = immediatePeerTrusted(remote, count, cidrs);
  if (trusted) {
    const cf = firstHeaderIp(input.cfConnectingIp);
    if (cf) return cf;
    const hop = rightMostUntrustedHop(forwardedHops(input.forwardedFor), count, cidrs);
    if (hop) return hop;
  }
  return remote ?? "local";
}

export function socketRemoteAddress(source: HeaderSource | { env?: unknown }): string | null {
  const env = (source as { env?: unknown }).env as
    | {
        incoming?: { socket?: { remoteAddress?: string | null } };
        remoteAddress?: string | null;
      }
    | undefined;
  const rawReq = (source as { req?: { raw?: { socket?: { remoteAddress?: string | null } } } }).req
    ?.raw;
  const candidates = [
    env?.incoming?.socket?.remoteAddress,
    env?.remoteAddress,
    rawReq?.socket?.remoteAddress,
  ];
  for (const value of candidates) {
    const ip = normalizeIp(value);
    if (ip) return ip;
  }
  return null;
}

/** Audit capture. Missing socket with no trusted proxy yields null (not a header). */
export function requestIp(c: HeaderSource): string | null {
  const ip = resolveClientIp({
    remoteAddress: socketRemoteAddress(c),
    forwardedFor: c.req.header("x-forwarded-for"),
    cfConnectingIp: c.req.header("cf-connecting-ip"),
  });
  return ip === "local" ? null : ip;
}
