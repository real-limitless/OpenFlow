import { config } from "../../config";

/** Resolve public origin for OAuth issuer / MCP resource metadata. */
export function publicOrigin(c: {
  req: { url: string; header: (n: string) => string | undefined };
}): string {
  if (config.publicUrl) return config.publicUrl;
  const proto =
    c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(c.req.url).protocol.replace(":", "") ||
    "http";
  const host =
    c.req.header("x-forwarded-host")?.split(",")[0]?.trim() ||
    c.req.header("host") ||
    new URL(c.req.url).host;
  return `${proto}://${host}`;
}

export function mcpResourceUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/mcp`;
}
