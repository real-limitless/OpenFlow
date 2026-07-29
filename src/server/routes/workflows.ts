import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import {
  parseWorkflowJson,
} from "../../lib/workflow/schema";
import type { IWorkflow, INodeExecutionData } from "../../lib/workflow/types";
import { executionQueue } from "../queue";
import { enqueueOrRun } from "../execute";

const JSON_FIELDS = ["nodes", "connections", "settings", "staticData", "pinData", "meta"] as const;

/** All top-level properties that map to dedicated Prisma columns. */
const KNOWN_WORKFLOW_FIELDS = new Set([
  ...JSON_FIELDS,
  "id", "userId", "name", "active", "versionId",
  "createdAt", "updatedAt",
]);

function serializeJsonFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (KNOWN_WORKFLOW_FIELDS.has(key)) {
      if (JSON_FIELDS.includes(key as typeof JSON_FIELDS[number]) && value !== undefined && value !== null && typeof value !== "string") {
        out[key] = JSON.stringify(value);
      } else {
        out[key] = value;
      }
    } else {
      extras[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
  }

  out.extra = Object.keys(extras).length > 0 ? JSON.stringify(extras) : null;
  return out;
}

function deserializeJsonFields(row: Record<string, unknown>): IWorkflow {
  const out: Record<string, unknown> = { ...row };
  for (const key of JSON_FIELDS) {
    if (typeof out[key] === "string") {
      try {
        out[key] = JSON.parse(out[key] as string);
      } catch {
        out[key] = null;
      }
    }
  }
  if (typeof out.extra === "string") {
    try {
      Object.assign(out, JSON.parse(out.extra as string));
    } catch { /* ignore malformed extra */ }
    delete out.extra;
  }
  out.createdAt = (out.createdAt as Date)?.toISOString?.() ?? out.createdAt;
  out.updatedAt = (out.updatedAt as Date)?.toISOString?.() ?? out.updatedAt;
  return out as IWorkflow;
}

export default function workflowsRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/workflows", async (c) => {
    const rows = await prisma.workflow.findMany({
      select: {
        id: true,
        name: true,
        active: true,
        nodes: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const list = rows.map((r: { id: string; name: string; active: boolean; nodes: string; updatedAt: Date }) => ({
      id: r.id,
      name: r.name,
      active: r.active,
      nodeCount: (JSON.parse(r.nodes) as unknown[]).length,
      updatedAt: r.updatedAt.toISOString(),
    }));

    return c.json(list);
  });

  app.get("/api/v1/workflows/:id", async (c) => {
    const { id } = c.req.param();
    const row = await prisma.workflow.findUnique({ where: { id } });
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(deserializeJsonFields(row as unknown as Record<string, unknown>));
  });

  app.post("/api/v1/workflows", async (c) => {
    const body = await c.req.json();
    const parsed = parseWorkflowJson(body);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const wf = parsed.workflow!;
    const data = serializeJsonFields({
      name: wf.name,
      active: wf.active,
      versionId: wf.versionId ?? crypto.randomUUID(),
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings,
      staticData: wf.staticData ?? null,
      pinData: wf.pinData ?? null,
      meta: wf.meta ?? null,
      ...Object.fromEntries(
        Object.entries(wf as Record<string, unknown>).filter(
          ([k]) => !KNOWN_WORKFLOW_FIELDS.has(k),
        ),
      ),
    });

    const row = await prisma.workflow.create({
      data: {
        userId: "local",
        name: data.name as string,
        active: data.active as boolean,
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

  app.put("/api/v1/workflows/:id", async (c) => {
    const { id } = c.req.param();
    const existing = await prisma.workflow.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json();
    const parsed = parseWorkflowJson(body, id);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const wf = parsed.workflow!;
    const data = serializeJsonFields({
      name: wf.name,
      active: wf.active,
      versionId: wf.versionId ?? existing.versionId,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings,
      staticData: wf.staticData ?? null,
      pinData: wf.pinData ?? null,
      meta: wf.meta ?? null,
      ...Object.fromEntries(
        Object.entries(wf as Record<string, unknown>).filter(
          ([k]) => !KNOWN_WORKFLOW_FIELDS.has(k),
        ),
      ),
    });

    const row = await prisma.workflow.update({
      where: { id },
      data: {
        name: data.name as string,
        active: data.active as boolean,
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

    return c.json(deserializeJsonFields(row as unknown as Record<string, unknown>));
  });

  app.delete("/api/v1/workflows/:id", async (c) => {
    const { id } = c.req.param();
    const existing = await prisma.workflow.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    await prisma.workflow.delete({ where: { id } });
    return c.body(null, 204);
  });

  // ─── Activate / Deactivate ──────────────────────────────

  app.patch("/api/v1/workflows/:id/activate", async (c) => {
    const userId = c.get("userId");
    const workflowId = c.req.param("id");
    const { active } = (await c.req.json()) as { active: boolean };

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, userId },
    });
    if (!workflow) return c.json({ error: "Workflow not found" }, 404);

    const nodes: any[] = (() => {
      try { return JSON.parse(workflow.nodes); } catch { return []; }
    })();

    if (active) {
      const webhookNodes = nodes.filter(
        (n: any) => n.type === "n8n-nodes-base.webhook",
      );
      for (const node of webhookNodes) {
        const path =
          node.parameters?.path ??
          node.name.toLowerCase().replace(/\s+/g, "-");
        const method = (node.parameters?.httpMethod as string) ?? "POST";
        await prisma.webhookRoute.upsert({
          where: { path },
          create: { workflowId, nodeId: node.id, path, method, active: true },
          update: { workflowId, active: true },
        });
      }

      const scheduleNodes = nodes.filter(
        (n: any) => n.type === "n8n-nodes-base.scheduleTrigger",
      );
      for (const node of scheduleNodes) {
        const cronExpr =
          (node.parameters?.rule?.interval?.[0]?.field as string) ?? "0 * * * *";
        await prisma.scheduledTrigger.upsert({
          where: { workflowId_nodeId: { workflowId, nodeId: node.id } },
          create: { workflowId, nodeId: node.id, cronExpr, active: true },
          update: { cronExpr, active: true },
        });
      }
    } else {
      await prisma.webhookRoute.updateMany({
        where: { workflowId },
        data: { active: false },
      });
      await prisma.scheduledTrigger.updateMany({
        where: { workflowId },
        data: { active: false },
      });
    }

    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: { active },
    });

    return c.json({ id: updated.id, active: updated.active });
  });

  // ─── Execute workflow ────────────────────────────────────

  app.post("/api/v1/workflows/:id/execute", async (c) => {
    const { id } = c.req.param();
    const userId = c.get("userId");

    let body: {
      pinData?: Record<string, INodeExecutionData[]>;
      workflow?: IWorkflow;
    } = {};
    try {
      body = await c.req.json();
    } catch {
      /* no body is fine */
    }

    // Prefer the canvas snapshot from the client so edits are executed immediately
    // even if autosave hasn't landed yet.
    let snapshot: IWorkflow | undefined = body.workflow
      ? { ...body.workflow, id: body.workflow.id || id }
      : undefined;

    if (snapshot) {
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: `${userId}@local`, passwordHash: "" },
      });

      const data = serializeJsonFields({
        name: snapshot.name,
        active: snapshot.active,
        versionId: snapshot.versionId ?? crypto.randomUUID(),
        nodes: snapshot.nodes,
        connections: snapshot.connections,
        settings: snapshot.settings,
        staticData: snapshot.staticData ?? null,
        pinData: snapshot.pinData ?? null,
        meta: snapshot.meta ?? null,
        ...Object.fromEntries(
          Object.entries(snapshot as Record<string, unknown>).filter(
            ([k]) => !KNOWN_WORKFLOW_FIELDS.has(k),
          ),
        ),
      });

      await prisma.workflow.upsert({
        where: { id },
        create: {
          id,
          userId,
          name: data.name as string,
          active: data.active as boolean,
          versionId: data.versionId as string,
          nodes: data.nodes as string,
          connections: data.connections as string,
          settings: (data.settings as string) ?? null,
          staticData: (data.staticData as string) ?? null,
          pinData: (data.pinData as string) ?? null,
          meta: (data.meta as string) ?? null,
          extra: (data.extra as string) ?? null,
        },
        update: {
          name: data.name as string,
          active: data.active as boolean,
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
    } else {
      const row = await prisma.workflow.findUnique({ where: { id } });
      if (!row) return c.json({ error: "Workflow not found" }, 404);
      snapshot = deserializeJsonFields(row as unknown as Record<string, unknown>);
    }

    const execution = await prisma.execution.create({
      data: {
        workflowId: id,
        status: "running",
        mode: "manual",
      },
    });

    const pinData = body.pinData ?? snapshot.pinData;
    await enqueueOrRun(id, execution.id, "manual", pinData, snapshot);

    return c.json({ executionId: execution.id }, 202);
  });

  // ─── List executions ─────────────────────────────────────

  app.get("/api/v1/workflows/:id/executions", async (c) => {
    const { id } = c.req.param();

    const executions = await prisma.execution.findMany({
      where: { workflowId: id },
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return c.json(
      executions.map((e: { id: string; workflowId: string; status: string; mode: string; startedAt: Date; finishedAt: Date | null; error: string | null }) => ({
        id: e.id,
        workflowId: e.workflowId,
        status: e.status,
        mode: e.mode,
        startedAt: e.startedAt.toISOString(),
        finishedAt: e.finishedAt?.toISOString() ?? null,
        error: e.error ? JSON.parse(e.error) : null,
      })),
    );
  });
}
