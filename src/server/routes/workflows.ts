import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { parseWorkflowJson } from "../../lib/workflow/schema";
import type { IWorkflow, INodeExecutionData } from "../../lib/workflow/types";
import { enqueueOrRun } from "../execute";
import {
  deserializeJsonFields,
  KNOWN_WORKFLOW_FIELDS,
  serializeJsonFields,
} from "../services/workflow-io";
import { ensureUser, ensureUserWithProject } from "../services/users";
import {
  ensurePersonalProject,
  listAccessibleProjectIds,
  projectIdFromRequest,
  requireProjectPermission,
  type ProjectRole,
} from "../services/projects";
import {
  listSharedResourceIds,
  requireResourceAccess,
  type SharePermission,
} from "../services/shares";
import { environmentIdFromRequest } from "../services/environments";

function minShareForRole(minRole: ProjectRole): SharePermission {
  return minRole === "viewer" ? "view" : "edit";
}

async function loadWorkflowIfAllowed(
  id: string,
  userId: string,
  minRole: ProjectRole,
) {
  const row = await prisma.workflow.findUnique({ where: { id } });
  if (!row) return { status: 404 as const, error: "Not found" as const };
  const access = await requireResourceAccess(
    "workflow",
    id,
    userId,
    minShareForRole(minRole),
    row.projectId,
  );
  if (!access.ok) {
    return { status: 404 as const, error: "Not found" as const };
  }
  return { row, access };
}

export default function workflowsRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/workflows", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    await ensurePersonalProject(userId);

    const filterProjectId = projectIdFromRequest(c);
    let projectIds: string[];
    if (filterProjectId) {
      const access = await requireProjectPermission(filterProjectId, userId, "viewer");
      if (!access.ok) return c.json({ error: access.error }, access.status);
      projectIds = [filterProjectId];
    } else {
      projectIds = await listAccessibleProjectIds(userId, "viewer");
    }

    const sharedIds = filterProjectId
      ? []
      : await listSharedResourceIds("workflow", userId, "view");

    const rows = await prisma.workflow.findMany({
      where: {
        OR: [
          { projectId: { in: projectIds } },
          ...(sharedIds.length > 0 ? [{ id: { in: sharedIds } }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        active: true,
        nodes: true,
        projectId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const sharedSet = new Set(sharedIds);
    const list = rows.map((r) => ({
      id: r.id,
      name: r.name,
      active: r.active,
      projectId: r.projectId,
      shared: sharedSet.has(r.id) && !projectIds.includes(r.projectId),
      nodeCount: (JSON.parse(r.nodes) as unknown[]).length,
      updatedAt: r.updatedAt.toISOString(),
    }));

    return c.json(list);
  });

  app.get("/api/v1/workflows/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const result = await loadWorkflowIfAllowed(id, userId, "viewer");
    if ("error" in result) return c.json({ error: result.error }, result.status);
    return c.json(deserializeJsonFields(result.row as unknown as Record<string, unknown>));
  });

  app.post("/api/v1/workflows", async (c) => {
    const userId = c.get("userId");
    const { projectId: personalId } = await ensureUserWithProject(userId);

    const body = await c.req.json();
    const requestedProjectId =
      (typeof body.projectId === "string" && body.projectId) ||
      projectIdFromRequest(c) ||
      personalId;

    const access = await requireProjectPermission(requestedProjectId, userId, "editor");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const parsed = parseWorkflowJson(body);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const wf = parsed.workflow!;
    const clientId =
      typeof wf.id === "string" && wf.id.length > 0 && wf.id !== "draft" ? wf.id : undefined;

    if (clientId) {
      const existing = await prisma.workflow.findUnique({ where: { id: clientId } });
      if (existing) {
        const edit = await requireProjectPermission(existing.projectId, userId, "editor");
        if (!edit.ok) return c.json({ error: "Not found" }, 404);
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
          where: { id: clientId },
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
      }
    }

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
        ...(clientId ? { id: clientId } : {}),
        userId,
        projectId: requestedProjectId,
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
    const userId = c.get("userId");
    const { projectId: personalId } = await ensureUserWithProject(userId);
    const { id } = c.req.param();
    const body = await c.req.json();
    const parsed = parseWorkflowJson(body, id);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const wf = parsed.workflow!;
    const existing = await prisma.workflow.findUnique({ where: { id } });
    if (existing) {
      const edit = await requireProjectPermission(existing.projectId, userId, "editor");
      if (!edit.ok) return c.json({ error: "Not found" }, 404);
    }

    const projectId =
      existing?.projectId ??
      (typeof body.projectId === "string" && body.projectId
        ? body.projectId
        : projectIdFromRequest(c) || personalId);

    if (!existing) {
      const createAccess = await requireProjectPermission(projectId, userId, "editor");
      if (!createAccess.ok) return c.json({ error: createAccess.error }, createAccess.status);
    }

    const data = serializeJsonFields({
      name: wf.name,
      active: wf.active,
      versionId: wf.versionId ?? existing?.versionId ?? crypto.randomUUID(),
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

    const row = existing
      ? await prisma.workflow.update({
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
        })
      : await prisma.workflow.create({
          data: {
            id,
            userId,
            projectId,
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
    const userId = c.get("userId");
    const { id } = c.req.param();
    const result = await loadWorkflowIfAllowed(id, userId, "editor");
    if ("error" in result) return c.json({ error: result.error }, result.status);

    await prisma.workflow.delete({ where: { id } });
    return c.body(null, 204);
  });

  app.patch("/api/v1/workflows/:id/activate", async (c) => {
    const userId = c.get("userId");
    const workflowId = c.req.param("id");
    const { active } = (await c.req.json()) as { active: boolean };

    const result = await loadWorkflowIfAllowed(workflowId, userId, "editor");
    if ("error" in result) return c.json({ error: "Workflow not found" }, 404);
    const workflow = result.row;

    const nodes: any[] = (() => {
      try {
        return JSON.parse(workflow.nodes);
      } catch {
        return [];
      }
    })();

    if (active) {
      const webhookNodes = nodes.filter((n: any) => n.type === "n8n-nodes-base.webhook");
      for (const node of webhookNodes) {
        const path = node.parameters?.path ?? node.name.toLowerCase().replace(/\s+/g, "-");
        const method = (node.parameters?.httpMethod as string) ?? "POST";
        await prisma.webhookRoute.upsert({
          where: { path },
          create: { workflowId, nodeId: node.id, path, method, active: true },
          update: { workflowId, active: true },
        });
      }

      const scheduleNodes = nodes.filter((n: any) => n.type === "n8n-nodes-base.scheduleTrigger");
      for (const node of scheduleNodes) {
        const cronExpr = (node.parameters?.rule?.interval?.[0]?.field as string) ?? "0 * * * *";
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

  app.post("/api/v1/workflows/:id/execute", async (c) => {
    const { id } = c.req.param();
    const userId = c.get("userId");
    const { projectId: personalId } = await ensureUserWithProject(userId);

    let body: {
      pinData?: Record<string, INodeExecutionData[]>;
      workflow?: IWorkflow;
      environmentId?: string;
      /** Trigger / node name to start from (partial run). */
      startNode?: string;
    } = {};
    try {
      body = await c.req.json();
    } catch {
      /* no body is fine */
    }
    const environmentId = body.environmentId || environmentIdFromRequest(c);
    const startNode =
      typeof body.startNode === "string" && body.startNode.trim()
        ? body.startNode.trim()
        : undefined;

    let snapshot: IWorkflow | undefined = body.workflow
      ? { ...body.workflow, id: body.workflow.id || id }
      : undefined;

    let projectId = personalId;
    let ownerUserId = userId;

    if (snapshot) {
      const existing = await prisma.workflow.findUnique({ where: { id } });
      if (existing) {
        const access = await requireProjectPermission(existing.projectId, userId, "viewer");
        if (!access.ok) return c.json({ error: "Workflow not found" }, 404);
        projectId = existing.projectId;
        ownerUserId = existing.userId;
        const canEdit = await requireProjectPermission(existing.projectId, userId, "editor");
        if (!canEdit.ok) {
          // viewer: execute without saving snapshot
          snapshot = deserializeJsonFields(existing as unknown as Record<string, unknown>);
        } else {
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
          await prisma.workflow.update({
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
        }
      } else {
        const createAccess = await requireProjectPermission(personalId, userId, "editor");
        if (!createAccess.ok) return c.json({ error: createAccess.error }, createAccess.status);
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
        await prisma.workflow.create({
          data: {
            id,
            userId,
            projectId: personalId,
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
      }
    } else {
      const result = await loadWorkflowIfAllowed(id, userId, "viewer");
      if ("error" in result) return c.json({ error: "Workflow not found" }, 404);
      snapshot = deserializeJsonFields(result.row as unknown as Record<string, unknown>);
      projectId = result.row.projectId;
      ownerUserId = result.row.userId;
    }

    const execution = await prisma.execution.create({
      data: {
        workflowId: id,
        status: "running",
        mode: "manual",
      },
    });

    const pinData = body.pinData ?? snapshot.pinData;
    await enqueueOrRun(
      id,
      execution.id,
      "manual",
      pinData,
      snapshot,
      ownerUserId,
      projectId,
      environmentId,
      startNode,
    );

    return c.json({ executionId: execution.id }, 202);
  });

  app.get("/api/v1/workflows/:id/executions", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const result = await loadWorkflowIfAllowed(id, userId, "viewer");
    if ("error" in result) return c.json({ error: "Not found" }, 404);

    const executions = await prisma.execution.findMany({
      where: { workflowId: id },
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return c.json(
      executions.map((e) => ({
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
