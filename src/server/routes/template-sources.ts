import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUser, LOCAL_USER_ID } from "../services/users";
import {
  DEFAULT_TEMPLATE_SOURCE,
  loadTemplateSources,
  normalizeTemplateSource,
  removeLocalSource,
  suggestSourceId,
  upsertLocalSource,
  type TemplateSource,
} from "../../lib/templates/sources";
import {
  getTemplateSyncJobState,
  startTemplateLibrarySyncBackground,
} from "../services/template-library-sync";

async function requireInstanceAdmin(userId: string): Promise<boolean> {
  if (userId === LOCAL_USER_ID || userId === "local") return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === "owner" || user?.role === "admin";
}

export default function templateSourcesRoute(app: Hono<AppEnv>) {
  /** Public: marketplace needs to know if catalog is empty + default source. */
  app.get("/api/v1/template-sources/status", async (c) => {
    const [templateCount, last] = await Promise.all([
      prisma.workflowTemplate.count(),
      prisma.workflowTemplate.findFirst({
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }),
    ]);
    const bySource = await prisma.workflowTemplate.groupBy({
      by: ["sourceId"],
      _count: { _all: true },
    });
    const job = getTemplateSyncJobState();
    return c.json({
      templateCount,
      lastSyncedAt: last?.syncedAt?.toISOString() ?? null,
      countsBySource: Object.fromEntries(
        bySource.map((r) => [r.sourceId, r._count._all]),
      ),
      defaultSource: {
        id: DEFAULT_TEMPLATE_SOURCE.id,
        name: DEFAULT_TEMPLATE_SOURCE.name,
        url: DEFAULT_TEMPLATE_SOURCE.url,
      },
      sync: {
        running: job.running,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        error: job.error,
        lastResult: job.result
          ? {
              totals: job.result.totals,
              finishedAt: job.result.finishedAt,
              sources: job.result.sources.map((s) => ({
                sourceId: s.sourceId,
                processed: s.processed,
                inserted: s.inserted,
                updated: s.updated,
                errors: s.errors,
              })),
            }
          : null,
      },
    });
  });

  app.get("/api/v1/template-sources", async (c) => {
    const userId = c.get("userId");
    if (userId) await ensureUser(userId);

    const sources = await loadTemplateSources({ includeDisabled: true });
    const counts = await prisma.workflowTemplate.groupBy({
      by: ["sourceId"],
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((r) => [r.sourceId, r._count._all]));

    return c.json({
      sources: sources.map((s) => ({
        ...s,
        templateCount: countMap.get(s.id) ?? 0,
        isDefault: s.id === DEFAULT_TEMPLATE_SOURCE.id,
      })),
      defaultSourceId: DEFAULT_TEMPLATE_SOURCE.id,
    });
  });

  app.post("/api/v1/template-sources", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "Authentication required" }, 401);
    await ensureUser(userId);
    if (!(await requireInstanceAdmin(userId))) {
      return c.json({ error: "Only instance admins can manage template libraries" }, 403);
    }

    const body = await c.req.json<{
      id?: string;
      name?: string;
      url?: string;
      dir?: string;
      ref?: string;
      enabled?: boolean;
      priority?: number;
      sync?: boolean;
    }>();

    const url = typeof body.url === "string" ? body.url.trim() : "";
    const dir = typeof body.dir === "string" ? body.dir.trim() : "";
    if (!url && !dir) {
      return c.json({ error: "url or dir is required" }, 400);
    }

    const idRaw =
      (typeof body.id === "string" && body.id.trim()) ||
      suggestSourceId(url || dir || body.name || "custom");
    const normalized = normalizeTemplateSource({
      id: idRaw,
      name: body.name || idRaw,
      url: url || undefined,
      dir: dir || undefined,
      ref: body.ref || "main",
      enabled: body.enabled !== false,
      priority: typeof body.priority === "number" ? body.priority : 50,
    });
    if (!normalized) {
      return c.json(
        { error: "Invalid source (id cannot contain : or /, need url or dir)" },
        400,
      );
    }

    await upsertLocalSource(normalized);

    let syncStarted = false;
    if (body.sync !== false && normalized.enabled) {
      syncStarted = startTemplateLibrarySyncBackground(prisma, {
        sourceId: normalized.id,
      });
    }

    const sources = await loadTemplateSources({ includeDisabled: true });
    return c.json({ source: normalized, sources, syncStarted }, 201);
  });

  app.patch("/api/v1/template-sources/:id", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "Authentication required" }, 401);
    await ensureUser(userId);
    if (!(await requireInstanceAdmin(userId))) {
      return c.json({ error: "Only instance admins can manage template libraries" }, 403);
    }

    const { id } = c.req.param();
    const existing = (await loadTemplateSources({ includeDisabled: true })).find(
      (s) => s.id === id,
    );
    if (!existing) return c.json({ error: "Source not found" }, 404);

    const body = await c.req.json<{
      name?: string;
      url?: string;
      dir?: string;
      ref?: string;
      enabled?: boolean;
      priority?: number;
    }>();

    const next: TemplateSource = {
      ...existing,
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
      url:
        typeof body.url === "string"
          ? body.url.trim() || undefined
          : existing.url,
      dir:
        typeof body.dir === "string"
          ? body.dir.trim() || undefined
          : existing.dir,
      ref:
        typeof body.ref === "string" && body.ref.trim()
          ? body.ref.trim()
          : existing.ref,
      enabled: typeof body.enabled === "boolean" ? body.enabled : existing.enabled,
      priority:
        typeof body.priority === "number" && Number.isFinite(body.priority)
          ? body.priority
          : existing.priority,
    };

    if (!next.url && !next.dir) {
      return c.json({ error: "url or dir is required" }, 400);
    }

    await upsertLocalSource(next);
    return c.json({ source: next });
  });

  app.delete("/api/v1/template-sources/:id", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "Authentication required" }, 401);
    await ensureUser(userId);
    if (!(await requireInstanceAdmin(userId))) {
      return c.json({ error: "Only instance admins can manage template libraries" }, 403);
    }

    const { id } = c.req.param();
    if (id === DEFAULT_TEMPLATE_SOURCE.id) {
      // Disable default rather than delete shipped config
      await upsertLocalSource({
        ...DEFAULT_TEMPLATE_SOURCE,
        enabled: false,
      });
      return c.json({ ok: true, disabled: true, id });
    }

    await removeLocalSource(id);
    const prune = c.req.query("prune") === "1" || c.req.query("prune") === "true";
    let deletedTemplates = 0;
    if (prune) {
      const res = await prisma.workflowTemplate.deleteMany({ where: { sourceId: id } });
      deletedTemplates = res.count;
    }
    return c.json({ ok: true, id, deletedTemplates });
  });

  app.post("/api/v1/template-sources/sync", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "Authentication required" }, 401);
    await ensureUser(userId);
    if (!(await requireInstanceAdmin(userId))) {
      return c.json({ error: "Only instance admins can sync template libraries" }, 403);
    }

    let body: { sourceId?: string; onlyNew?: boolean; limit?: number } = {};
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      body = {};
    }

    const started = startTemplateLibrarySyncBackground(prisma, {
      sourceId: typeof body.sourceId === "string" ? body.sourceId : undefined,
      onlyNew: Boolean(body.onlyNew),
      limit:
        typeof body.limit === "number" && body.limit > 0 ? body.limit : undefined,
    });

    if (!started) {
      return c.json(
        { error: "A sync is already running", sync: getTemplateSyncJobState() },
        409,
      );
    }

    return c.json({
      started: true,
      message:
        "Template library sync started in the background. Poll GET /api/v1/template-sources/status.",
      sync: getTemplateSyncJobState(),
    });
  });
}
