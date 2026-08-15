import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { config } from "../../config";
import {
  suggestNodes,
  catalogStats,
  reindexNodeCatalog,
} from "../../lib/catalog";
import { getCatalogMetrics, recordCatalogInsert } from "../../lib/catalog/metrics";

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
      const [stats, metrics] = await Promise.all([catalogStats(), getCatalogMetrics()]);
      return c.json({
        enabled: config.catalog.enabled,
        ...stats,
        metrics,
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
      source?: string;
    };
    const intent = String(body.intent ?? body.query ?? "").trim();
    if (!intent) return c.json({ error: "intent required" }, 400);
    if (intent.length > 2000) return c.json({ error: "intent too long" }, 400);

    try {
      const result = await suggestNodes({
        intent,
        limit: typeof body.limit === "number" ? body.limit : 8,
        includeShell: body.includeShell !== false,
        source: String(body.source ?? "api").slice(0, 40),
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

  /** Record palette/MCP insert of a suggested type (conversion funnel). */
  app.post("/api/v1/catalog/suggest-insert", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      type?: string;
      intent?: string;
      source?: string;
    };
    const type = String(body.type ?? "").trim();
    if (!type) return c.json({ error: "type required" }, 400);
    await recordCatalogInsert({
      type,
      intent: body.intent ? String(body.intent).slice(0, 200) : undefined,
      source: String(body.source ?? "api").slice(0, 40),
    });
    return c.json({ ok: true });
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
