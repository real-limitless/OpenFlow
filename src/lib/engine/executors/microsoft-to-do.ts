import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://graph.microsoft.com/v1.0";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function buildUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function apiCall(
  method: string,
  endpoint: string,
  credential: Record<string, unknown> | null,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const token = credential?.accessToken ?? credential?.access_token;
  if (!token) throw new Error("Microsoft To Do: no access token in credential");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${String(token)}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(buildUrl(endpoint), {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.text();
    let parsed: { message?: string } = { message: errBody };
    try {
      parsed = JSON.parse(errBody);
    } catch {}
    throw new Error(
      `Microsoft To Do API error (${res.status}): ${parsed.message ?? errBody}`,
    );
  }

  if (res.status === 204) return {};
  const json = await res.json();
  if (json && typeof json === "object") return json as Record<string, unknown>;
  return {};
}

function buildTaskBody(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const title = resolveValue(params.title, itemJson);
  if (title) body.title = title;

  const af = resolveValue(params.additionalFields, itemJson) as Record<string, unknown> | undefined;
  if (af && typeof af === "object") {
    if (af.bodyContent) {
      body.body = {
        content: af.bodyContent,
        contentType: af.bodyContentType ?? "text",
      };
    }
    if (af.dueDateTime) body.dueDateTime = af.dueDateTime;
    if (af.importance) body.importance = af.importance;
    if (af.isReminderOn != null) body.isReminderOn = Boolean(af.isReminderOn);
    if (af.reminderDateTime) body.reminderDateTime = af.reminderDateTime;
    if (af.startDateTime) body.startDateTime = af.startDateTime;
    if (af.status) body.status = af.status;
    if (af.categories) {
      body.categories = String(af.categories)
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  }

  return body;
}

export const microsoftToDoExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = node.parameters ?? {};
  const resource = String(params.resource ?? "linkedResource");
  const operation = String(params.operation ?? "create");

  const credential =
    (await ctx.getCredential("microsoftToDoOAuth2Api")) ??
    (await ctx.getCredential("microsoftEntraServicePrincipal"));

  for (const item of items) {
    const itemJson = item.json ?? {};

    try {
      if (operation === "getAll") {
        const returnAll = params.returnAll === true;
        const limit = Number(params.limit ?? 50);
        const listId = resolveValue(params.listId, itemJson) as string;

        let endpoint: string;
        if (resource === "list") {
          endpoint = "/me/todo/lists";
        } else if (resource === "task") {
          endpoint = `/me/todo/lists/${listId}/tasks`;
        } else {
          endpoint = `/me/todo/lists/${listId}/tasks/${resolveValue(params.taskId, itemJson)}/linkedResources`;
        }

        const result = await apiCall("GET", endpoint, credential);
        const values = (result.value as Array<Record<string, unknown>>) ?? [];
        const sliced = returnAll ? values : values.slice(0, limit);
        out.push(...sliced.map((v) => ({ json: v })));
        continue;
      }

      if (operation === "create") {
        const listId = resolveValue(params.listId, itemJson) as string;

        if (resource === "list") {
          const displayName = resolveValue(params.displayName, itemJson);
          const result = await apiCall("POST", "/me/todo/lists", credential, {
            displayName,
          });
          out.push({ json: result });
        } else if (resource === "task") {
          const body = buildTaskBody(params, itemJson);
          const result = await apiCall("POST", `/me/todo/lists/${listId}/tasks`, credential, body);
          out.push({ json: result });
        } else {
          const taskId = resolveValue(params.taskId, itemJson) as string;
          const webUrl = resolveValue(params.webUrl, itemJson);
          const displayName = resolveValue(params.displayName, itemJson);
          const result = await apiCall(
            "POST",
            `/me/todo/lists/${listId}/tasks/${taskId}/linkedResources`,
            credential,
            { webUrl, displayName },
          );
          out.push({ json: result });
        }
        continue;
      }

      if (operation === "delete") {
        const listId = resolveValue(params.listId, itemJson) as string;

        if (resource === "list") {
          await apiCall("DELETE", `/me/todo/lists/${listId}`, credential);
        } else if (resource === "task") {
          const taskId = resolveValue(params.taskId, itemJson) as string;
          await apiCall("DELETE", `/me/todo/lists/${listId}/tasks/${taskId}`, credential);
        } else {
          const taskId = resolveValue(params.taskId, itemJson) as string;
          const linkedResourceId = resolveValue(params.linkedResourceId, itemJson) as string;
          await apiCall(
            "DELETE",
            `/me/todo/lists/${listId}/tasks/${taskId}/linkedResources/${linkedResourceId}`,
            credential,
          );
        }
        out.push({ json: itemJson });
        continue;
      }

      if (operation === "get") {
        const listId = resolveValue(params.listId, itemJson) as string;

        if (resource === "list") {
          const result = await apiCall("GET", `/me/todo/lists/${listId}`, credential);
          out.push({ json: result });
        } else if (resource === "task") {
          const taskId = resolveValue(params.taskId, itemJson) as string;
          const result = await apiCall("GET", `/me/todo/lists/${listId}/tasks/${taskId}`, credential);
          out.push({ json: result });
        } else {
          const taskId = resolveValue(params.taskId, itemJson) as string;
          const linkedResourceId = resolveValue(params.linkedResourceId, itemJson) as string;
          const result = await apiCall(
            "GET",
            `/me/todo/lists/${listId}/tasks/${taskId}/linkedResources/${linkedResourceId}`,
            credential,
          );
          out.push({ json: result });
        }
        continue;
      }

      if (operation === "update") {
        const listId = resolveValue(params.listId, itemJson) as string;

        if (resource === "list") {
          const displayName = resolveValue(params.displayName, itemJson);
          await apiCall("PATCH", `/me/todo/lists/${listId}`, credential, {
            displayName,
          });
          const result = await apiCall("GET", `/me/todo/lists/${listId}`, credential);
          out.push({ json: result });
        } else if (resource === "task") {
          const taskId = resolveValue(params.taskId, itemJson) as string;
          const body = buildTaskBody(params, itemJson);
          await apiCall("PATCH", `/me/todo/lists/${listId}/tasks/${taskId}`, credential, body);
          const result = await apiCall("GET", `/me/todo/lists/${listId}/tasks/${taskId}`, credential);
          out.push({ json: result });
        } else {
          const taskId = resolveValue(params.taskId, itemJson) as string;
          const linkedResourceId = resolveValue(params.linkedResourceId, itemJson) as string;
          const webUrl = resolveValue(params.webUrl, itemJson);
          const displayName = resolveValue(params.displayName, itemJson);
          const patchBody: Record<string, unknown> = {};
          if (webUrl) patchBody.webUrl = webUrl;
          if (displayName) patchBody.displayName = displayName;
          await apiCall(
            "PATCH",
            `/me/todo/lists/${listId}/tasks/${taskId}/linkedResources/${linkedResourceId}`,
            credential,
            patchBody,
          );
          const result = await apiCall(
            "GET",
            `/me/todo/lists/${listId}/tasks/${taskId}/linkedResources/${linkedResourceId}`,
            credential,
          );
          out.push({ json: result });
        }
        continue;
      }

      out.push({ json: itemJson });
    } catch (e) {
      if (ctx.continueOnFail()) {
        out.push({
          json: {
            error: {
              message: e instanceof Error ? e.message : String(e),
            },
          },
        });
      } else {
        throw e;
      }
    }
  }

  return [out];
};