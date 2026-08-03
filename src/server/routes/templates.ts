import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { parseWorkflowJson, newId } from "../../lib/workflow/schema";
import type { INode, IWorkflow } from "../../lib/workflow/types";
import {
  deserializeJsonFields,
  KNOWN_WORKFLOW_FIELDS,
  serializeJsonFields,
} from "../services/workflow-io";
import { ensureUserWithProject } from "../services/users";
import {
  projectIdFromRequest,
  requireProjectPermission,
} from "../services/projects";
import {
  parseJsonStringArray,
  scoreTemplateCompatibility,
  type CompatLevel,
} from "../services/template-compat";

const LIST_SELECT = {
  id: true,
  externalId: true,
  name: true,
  description: true,
  imageUrl: true,
  views: true,
  recentViews: true,
  nodeCount: true,
  nodeTypes: true,
  categories: true,
  authorName: true,
  authorUsername: true,
  authorAvatar: true,
  sourceUrl: true,
  readyToDemo: true,
  publishedAt: true,
  syncedAt: true,
} as const;

function snippet(text: string | null | undefined, max = 160): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1) + "…";
}

function mapListItem(row: {
  id: string;
  externalId: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  views: number;
  recentViews: number;
  nodeCount: number;
  nodeTypes: string;
  categories: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatar: string | null;
  sourceUrl: string | null;
  readyToDemo: boolean;
  publishedAt: Date | null;
  syncedAt: Date;
}) {
  const nodeTypes = parseJsonStringArray(row.nodeTypes);
  const categories = parseJsonStringArray(row.categories);
  const compatibility = scoreTemplateCompatibility(nodeTypes);
  return {
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    descriptionSnippet: snippet(row.description),
    imageUrl: row.imageUrl,
    views: row.views,
    recentViews: row.recentViews,
    nodeCount: row.nodeCount,
    nodeTypes,
    categories,
    authorName: row.authorName,
    authorUsername: row.authorUsername,
    authorAvatar: row.authorAvatar,
    sourceUrl: row.sourceUrl,
    readyToDemo: row.readyToDemo,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    syncedAt: row.syncedAt.toISOString(),
    compatibility: {
      level: compatibility.level,
      ratio: compatibility.ratio,
      supportedCount: compatibility.supported.length,
      missingCount: compatibility.missing.length,
      total: compatibility.total,
    },
  };
}

function stripCredentialIds(nodes: INode[]): INode[] {
  return nodes.map((n) => {
    if (!n.credentials || typeof n.credentials !== "object") return n;
    const next: NonNullable<INode["credentials"]> = {};
    for (const [key, val] of Object.entries(n.credentials)) {
      if (val && typeof val === "object") {
        next[key] = {
          name: typeof val.name === "string" && val.name ? val.name : key,
          id: null,
        };
      }
    }
    return { ...n, credentials: next } as INode;
  });
}

export default function templatesRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/templates/facets", async (c) => {
    const rows = await prisma.workflowTemplate.findMany({
      select: { categories: true },
    });
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const cat of parseJsonStringArray(r.categories)) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    const categories = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const total = await prisma.workflowTemplate.count();
    return c.json({ total, categories });
  });

  app.get("/api/v1/templates", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    const category = (c.req.query("category") ?? "").trim();
    const sort = c.req.query("sort") === "recent" ? "recent" : "popular";
    const compat = (c.req.query("compat") ?? "any") as CompatLevel | "any";
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      48,
      Math.max(1, parseInt(c.req.query("pageSize") ?? "24", 10) || 24),
    );

    // When filtering by category or compat we may need a broader fetch then filter.
    // Category is stored as JSON array string — use contains for simple match.
    const where: {
      AND?: Array<Record<string, unknown>>;
    } = {};
    const and: Array<Record<string, unknown>> = [];
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { nodeTypes: { contains: q } },
        ],
      });
    }
    if (category) {
      // Match "CategoryName" inside JSON string array
      and.push({ categories: { contains: category } });
    }
    if (and.length) where.AND = and;

    const orderBy =
      sort === "recent"
        ? [{ publishedAt: "desc" as const }, { syncedAt: "desc" as const }]
        : [{ views: "desc" as const }, { name: "asc" as const }];

    // Compat filter requires post-filter; fetch more when needed
    const needsCompatFilter = compat === "ready" || compat === "partial" || compat === "limited";

    if (!needsCompatFilter) {
      const [total, rows] = await Promise.all([
        prisma.workflowTemplate.count({ where }),
        prisma.workflowTemplate.findMany({
          where,
          select: LIST_SELECT,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return c.json({
        page,
        pageSize,
        total,
        items: rows.map(mapListItem),
      });
    }

    // Compat path: load candidates in batches (cap for safety)
    const CAP = 2000;
    const rows = await prisma.workflowTemplate.findMany({
      where,
      select: LIST_SELECT,
      orderBy,
      take: CAP,
    });
    const mapped = rows.map(mapListItem).filter((item) => item.compatibility.level === compat);
    const total = mapped.length;
    const start = (page - 1) * pageSize;
    const items = mapped.slice(start, start + pageSize);
    return c.json({ page, pageSize, total, items, capped: rows.length >= CAP });
  });

  app.get("/api/v1/templates/:id", async (c) => {
    const { id } = c.req.param();
    const row = await prisma.workflowTemplate.findUnique({
      where: { id },
      select: { ...LIST_SELECT, description: true },
    });
    if (!row) return c.json({ error: "Not found" }, 404);
    const base = mapListItem(row);
    const nodeTypes = parseJsonStringArray(row.nodeTypes);
    const full = scoreTemplateCompatibility(nodeTypes);
    return c.json({
      ...base,
      description: row.description,
      compatibility: {
        level: full.level,
        ratio: full.ratio,
        total: full.total,
        supported: full.supported,
        missing: full.missing,
        supportedCount: full.supported.length,
        missingCount: full.missing.length,
      },
    });
  });

  app.get("/api/v1/templates/:id/workflow", async (c) => {
    const { id } = c.req.param();
    const row = await prisma.workflowTemplate.findUnique({
      where: { id },
      select: { workflowJson: true, name: true },
    });
    if (!row) return c.json({ error: "Not found" }, 404);
    try {
      return c.json(JSON.parse(row.workflowJson));
    } catch {
      return c.json({ error: "Invalid stored workflow" }, 500);
    }
  });

  app.post("/api/v1/templates/:id/import", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const { projectId: personalId } = await ensureUserWithProject(userId);
    let body: { projectId?: string; nameSuffix?: boolean } = {};
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      body = {};
    }

    const requestedProjectId =
      (typeof body.projectId === "string" && body.projectId) ||
      projectIdFromRequest(c) ||
      personalId;

    const access = await requireProjectPermission(requestedProjectId, userId, "editor");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const { id } = c.req.param();
    const tpl = await prisma.workflowTemplate.findUnique({ where: { id } });
    if (!tpl) return c.json({ error: "Not found" }, 404);

    let raw: unknown;
    try {
      raw = JSON.parse(tpl.workflowJson);
    } catch {
      return c.json({ error: "Invalid stored workflow" }, 500);
    }

    const parsed = parseWorkflowJson(raw, newId("wf"));
    if (!parsed.ok || !parsed.workflow) {
      return c.json({ error: parsed.error ?? "Could not parse template" }, 400);
    }

    const wf: IWorkflow = {
      ...parsed.workflow,
      id: newId("wf"),
      name: body.nameSuffix === false ? parsed.workflow.name : `${parsed.workflow.name}`,
      active: false,
      nodes: stripCredentialIds(parsed.workflow.nodes as INode[]),
      versionId: crypto.randomUUID(),
    };

    const data = serializeJsonFields({
      name: wf.name,
      active: false,
      versionId: wf.versionId,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings ?? {},
      staticData: wf.staticData ?? null,
      pinData: wf.pinData ?? null,
      meta: {
        ...(typeof wf.meta === "object" && wf.meta ? wf.meta : {}),
        templateId: tpl.id,
        templateSource: tpl.sourceUrl,
        importedFromTemplate: true,
      },
      ...Object.fromEntries(
        Object.entries(wf as Record<string, unknown>).filter(
          ([k]) => !KNOWN_WORKFLOW_FIELDS.has(k) && k !== "meta",
        ),
      ),
    });

    const row = await prisma.workflow.create({
      data: {
        id: wf.id,
        userId,
        projectId: requestedProjectId,
        name: data.name as string,
        active: false,
        versionId: data.versionId as string,
        nodes: data.nodes as string,
        connections: data.connections as string,
        settings: (data.settings as string) ?? null,
        staticData: (data.staticData as string) ?? null,
        pinData: (data.pinData as string) ?? null,
        meta: (data.meta as string) ?? null,
        extra: (data.extra as string) ?? null,
      },
    });

    return c.json(deserializeJsonFields(row as unknown as Record<string, unknown>), 201);
  });
}
