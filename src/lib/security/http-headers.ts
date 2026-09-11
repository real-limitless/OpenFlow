export type CorsMode = "allowlist" | "try-out-reflect";

export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function defaultCorsMode(opts: { authDisabled: boolean; nodeEnv: string }): CorsMode {
  if (opts.authDisabled || opts.nodeEnv !== "production") return "try-out-reflect";
  return "allowlist";
}

export function resolveCorsOrigin(
  requestOrigin: string | undefined,
  allowlist: string[],
  mode: CorsMode,
): string | null {
  if (!requestOrigin) return null;
  if (allowlist.includes("*")) return requestOrigin;
  if (allowlist.some((o) => o === requestOrigin)) return requestOrigin;
  if (mode === "try-out-reflect" && allowlist.length === 0) return requestOrigin;
  return null;
}

export function securityHeaderMap(opts: {
  https: boolean;
  frameable: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-DNS-Prefetch-Control": "off",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
  if (!opts.frameable) {
    headers["X-Frame-Options"] = "SAMEORIGIN";
  }
  if (opts.https) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

export function isFrameablePath(path: string): boolean {
  return path.startsWith("/form") || path.startsWith("/chat");
}

export function isHttpsRequest(url: string, forwardedProto: string | undefined): boolean {
  if (forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https") return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
