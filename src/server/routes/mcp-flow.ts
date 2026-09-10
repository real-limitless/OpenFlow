import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { agentMayManageCredentials } from "../services/agent-policy";
import { projectIdFromRequest } from "../services/projects";
import {
  deleteMcpFlowConnection,
  loadMcpFlowCredential,
  publicConnection,
  saveMcpFlowConnection,
} from "../services/mcp-flow-connection";
import { connectMcpFlow } from "../../lib/nodes/mcp-flow/gateway";

function requireUserId(c: { get: (k: "userId") => string | undefined }): string | null {
  try {
    const id = c.get("userId");
    return id && String(id).length > 0 ? String(id) : null;
  } catch {
    return null;
  }
}

function credentialsForbidden() {
  return {
    error:
      "Missing scope openflow:credentials. Opt in when minting the API key / OAuth / temporary MCP token.",
  };
}

async function sessionFor(
  userId: string,
  credentialId: string | undefined,
  projectId: string | undefined,
) {
  const loaded = await loadMcpFlowCredential(userId, { credentialId, projectId });
  if ("error" in loaded) return loaded;
  try {
    const session = await connectMcpFlow({
      url: loaded.data.url,
      apiKey: loaded.data.apiKey,
    });
    return { session, loaded };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      status: 502 as const,
    };
  }
}

export default function mcpFlowRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/mcp-flow/connection", async (c) => {
    const userId = requireUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const loaded = await loadMcpFlowCredential(userId, {
      credentialId: c.req.query("credentialId") ?? undefined,
      projectId: projectIdFromRequest(c),
    });
    if ("error" in loaded) {
      if (loaded.status === 404) return c.json({ connected: false });
      return c.json({ error: loaded.error }, loaded.status as 400);
    }
    return c.json({ connected: true, credential: publicConnection(loaded) });
  });

  app.put("/api/v1/mcp-flow/connection", async (c) => {
    const userId = requireUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    if (!agentMayManageCredentials({ authKind: c.get("authKind"), scopes: c.get("scopes") })) {
      return c.json(credentialsForbidden(), 403);
    }
    const body = await c.req.json<{ url?: string; apiKey?: string; name?: string }>();
    const result = await saveMcpFlowConnection(userId, {
      url: body.url,
      apiKey: body.apiKey,
      name: body.name,
      projectId: projectIdFromRequest(c),
    });
    if ("error" in result) return c.json({ error: result.error }, result.status as 400);
    return c.json(result);
  });

  app.delete("/api/v1/mcp-flow/connection", async (c) => {
    const userId = requireUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    if (!agentMayManageCredentials({ authKind: c.get("authKind"), scopes: c.get("scopes") })) {
      return c.json(credentialsForbidden(), 403);
    }
    const result = await deleteMcpFlowConnection(userId, {
      credentialId: c.req.query("credentialId") ?? undefined,
      projectId: projectIdFromRequest(c),
    });
    if ("error" in result) return c.json({ error: result.error }, result.status as 400);
    return c.json({ ok: true });
  });

  app.get("/api/v1/mcp-flow/status", async (c) => {
    const userId = requireUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const opened = await sessionFor(
      userId,
      c.req.query("credentialId") ?? undefined,
      projectIdFromRequest(c),
    );
    if ("error" in opened) return c.json({ error: opened.error }, opened.status as 400);
    const project = c.req.query("project")?.trim();
    try {
      if (project) await opened.session.mfUseProject(project);
      const status = await opened.session.mfStatus();
      return c.json({ status, credential: publicConnection(opened.loaded) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  app.get("/api/v1/mcp-flow/projects", async (c) => {
    const userId = requireUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const opened = await sessionFor(
      userId,
      c.req.query("credentialId") ?? undefined,
      projectIdFromRequest(c),
    );
    if ("error" in opened) return c.json({ error: opened.error }, opened.status as 400);
    try {
      const items = await opened.session.mfListProjects();
      return c.json({ items });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  app.get("/api/v1/mcp-flow/backends", async (c) => {
    const userId = requireUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const opened = await sessionFor(
      userId,
      c.req.query("credentialId") ?? undefined,
      projectIdFromRequest(c),
    );
    if ("error" in opened) return c.json({ error: opened.error }, opened.status as 400);
    const project = c.req.query("project")?.trim();
    try {
      if (project) await opened.session.mfUseProject(project);
      const listed = await opened.session.mfListBackends();
      return c.json({ items: listed.backends, project: listed.project });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  app.get("/api/v1/mcp-flow/tools", async (c) => {
    const userId = requireUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const opened = await sessionFor(
      userId,
      c.req.query("credentialId") ?? undefined,
      projectIdFromRequest(c),
    );
    if ("error" in opened) return c.json({ error: opened.error }, opened.status as 400);
    const project = c.req.query("project")?.trim();
    const backend = c.req.query("backend")?.trim();
    try {
      const items = await opened.session.discoverTools({
        project: project || undefined,
        backends: backend ? [backend] : [],
        includeMetaTools: false,
      });
      return c.json({ items });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });
}
