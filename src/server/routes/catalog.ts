import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { config } from "../../config";
import { suggestNodes, catalogStats, reindexNodeCatalog } from "../../lib/catalog";

function requireUserId(c: { get: (k: "userId") => string | undefined }): string | null {
  try {
    const id = c.get("userId");
    return id && String(id).length > 0 ? String(id) : null;
  } catch {
    return null;
  }
}

export default function catalogRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/catalog/stats", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    try {
      const stats = await catalogStats();
      return c.json({
        enabled: config.catalog.enabled,
        ...stats,
      });
    } catch (err) {
      return c.json(
        {
          enabled: config.catalog.enabled,
          chunkCount: 0,
          error: err instanceof Error ? err.message : String(err),
        },
        200,
      );
    }
  });

  app.post("/api/v1/catalog/suggest-nodes", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      intent?: string;
      query?: string;
      limit?: number;
      includeShell?: boolean;
    };
    const intent = String(body.intent ?? body.query ?? "").trim();
    if (!intent) return c.json({ error: "intent required" }, 400);
    if (intent.length > 2000) return c.json({ error: "intent too long" }, 400);

    try {
      const result = await suggestNodes({
        intent,
        limit: typeof body.limit === "number" ? body.limit : 8,
        includeShell: body.includeShell !== false,
      });
      return c.json(result);
    } catch (err) {
      return c.json(
        {
          mode: "keyword",
          count: 0,
          items: [],
          indexed: false,
          note: err instanceof Error ? err.message : String(err),
        },
        200,
      );
    }
  });

  /** Operator-only style reindex (authenticated user). Prefer CLI in prod. */
  app.post("/api/v1/catalog/reindex", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { forceHash?: boolean };
    try {
      const r = await reindexNodeCatalog({
        forceHash: body.forceHash === true,
      });
      return c.json({ ok: true, ...r });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  });
}
