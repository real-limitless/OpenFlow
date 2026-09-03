/** Paths handled by the Hono API instead of the TanStack Start UI. */
export const API_PREFIXES = [
  "/api/",
  "/health",
  "/webhook",
  "/form",
  "/chat",
  "/mcp",
  "/.well-known",
  "/authorize",
  "/register",
  "/token",
];

export function isApiPath(pathname: string): boolean {
  return API_PREFIXES.some((p) => {
    if (p.endsWith("/")) {
      return pathname === p.slice(0, -1) || pathname.startsWith(p);
    }
    return pathname === p || pathname.startsWith(`${p}/`);
  });
}
