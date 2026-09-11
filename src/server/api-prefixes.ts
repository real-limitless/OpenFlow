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

export function isApiPath(pathname: string, method = "GET"): boolean {
  // RFC 7591 DCR is POST /register. GET /register is the OpenFlow account page
  // (invite links: /register?invite=…).
  if (pathname === "/register" || pathname.startsWith("/register/")) {
    return method.toUpperCase() === "POST";
  }
  return API_PREFIXES.some((p) => {
    if (p.endsWith("/")) {
      return pathname === p.slice(0, -1) || pathname.startsWith(p);
    }
    return pathname === p || pathname.startsWith(`${p}/`);
  });
}
