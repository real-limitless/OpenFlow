import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { agentMayManageVariables } from "../services/agent-policy";
import {
  createVariable,
  deleteVariable,
  isVariableServiceError,
  listVariablesMeta,
  updateVariable,
} from "../services/variables";
import {
  environmentIdFromRequest,
} from "../services/environments";
import { projectIdFromRequest } from "../services/projects";
import { ensureUserWithProject } from "../services/users";

export default function variablesRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/variables", async (c) => {
    const userId = c.get("userId");
    const { projectId: personalId } = await ensureUserWithProject(userId);
    const scope = (c.req.query("scope") ?? "project").trim() as "project" | "instance";
    const projectId = projectIdFromRequest(c) || personalId;
    const layer = (c.req.query("layer") ?? "all").trim() as "base" | "env" | "all";
    const envRef = environmentIdFromRequest(c);

    const result = await listVariablesMeta(userId, {
      scope: scope === "instance" ? "instance" : "project",
      projectId,
      environmentId: envRef,
      layer,
    });
    if (isVariableServiceError(result)) {
      return c.json({ error: result.error }, result.status as 403);
    }
    return c.json(result);
  });

  app.post("/api/v1/variables", async (c) => {
    const userId = c.get("userId");
    const authKind = c.get("authKind");
    const scopes = c.get("scopes");
    if (!agentMayManageVariables({ authKind, scopes })) {
      return c.json(
        {
          error:
            "Missing scope openflow:variables. Opt in when minting the API key / OAuth / temporary MCP token.",
        },
        403,
      );
    }

    const { projectId: personalId } = await ensureUserWithProject(userId);
    const body = await c.req.json<{
      key?: string;
      value?: unknown;
      scope?: string;
      projectId?: string;
      environmentId?: string | null;
      secret?: boolean;
    }>();

    const result = await createVariable(userId, {
      key: body.key ?? "",
      value: body.value,
      scope: body.scope === "instance" ? "instance" : "project",
      projectId: body.projectId || projectIdFromRequest(c) || personalId,
      environmentId: body.environmentId,
      secret: body.secret,
    });
    if (isVariableServiceError(result)) {
      return c.json({ error: result.error }, result.status as 400);
    }
    return c.json(result, 201);
  });

  app.put("/api/v1/variables/:id", async (c) => {
    const userId = c.get("userId");
    const authKind = c.get("authKind");
    const scopes = c.get("scopes");
    if (!agentMayManageVariables({ authKind, scopes })) {
      return c.json(
        {
          error:
            "Missing scope openflow:variables. Opt in when minting the API key / OAuth / temporary MCP token.",
        },
        403,
      );
    }

    const { id } = c.req.param();
    const body = await c.req.json<{
      key?: string;
      value?: unknown;
      secret?: boolean;
    }>();

    const result = await updateVariable(userId, id, body);
    if (isVariableServiceError(result)) {
      return c.json({ error: result.error }, result.status as 404);
    }
    return c.json(result);
  });

  app.delete("/api/v1/variables/:id", async (c) => {
    const userId = c.get("userId");
    const authKind = c.get("authKind");
    const scopes = c.get("scopes");
    if (!agentMayManageVariables({ authKind, scopes })) {
      return c.json(
        {
          error:
            "Missing scope openflow:variables. Opt in when minting the API key / OAuth / temporary MCP token.",
        },
        403,
      );
    }

    const { id } = c.req.param();
    const result = await deleteVariable(userId, id);
    if (isVariableServiceError(result)) {
      return c.json({ error: result.error }, result.status as 404);
    }
    return c.body(null, 204);
  });
}
