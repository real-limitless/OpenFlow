import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { getMcpGalleryEntry, searchMcpGallery } from "../../lib/nodes/mcp-flow/catalog";

function requireUserId(c: { get: (k: "userId") => string | undefined }): string | null {
  try {
    const id = c.get("userId");
    return id && String(id).length > 0 ? String(id) : null;
  } catch {
    return null;
  }
}

export default function mcpGalleryRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/mcp-gallery", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const q = String(c.req.query("q") ?? c.req.query("query") ?? "").trim();
    const limitRaw = Number(c.req.query("limit") ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    if (!q) {
      return c.json({
        count: 0,
        total: 0,
        items: [],
        message: "Pass q= to search mcp-flow catalog-data.",
      });
    }
    try {
      const result = await searchMcpGallery(q, limit);
      return c.json({
        count: result.items.length,
        total: result.total,
        query: q,
        items: result.items,
        source: result.source,
      });
    } catch (err) {
      return c.json(
        {
          count: 0,
          total: 0,
          items: [],
          query: q,
          error: err instanceof Error ? err.message : String(err),
        },
        200,
      );
    }
  });

  app.get("/api/v1/mcp-gallery/:id", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const id = decodeURIComponent(c.req.param("id") ?? "").trim();
    if (!id) return c.json({ error: "id required" }, 400);
    const entry = await getMcpGalleryEntry(id);
    if (!entry) return c.json({ error: "not found" }, 404);
    return c.json({ entry });
  });
}
