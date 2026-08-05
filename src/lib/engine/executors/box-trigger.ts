import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";

const API_BASE = "https://api.box.com/2.0";

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("boxOAuth2Api");
  const token = cred
    ? String(
        (cred as Record<string, unknown>).accessToken ??
          (cred as Record<string, unknown>).access_token ??
          "",
      )
    : "";
  if (!token) {
    throw new Error("Box Trigger: credential is not configured");
  }
  return token;
}

async function boxApi(
  token: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const errObj =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    throw new Error(
      `Box API error: ${(errObj.message as string) ?? (errObj.error_description as string) ?? res.statusText}`,
    );
  }
  return (parsed ?? {}) as Record<string, unknown>;
}

export const boxTriggerExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);

  // A trigger node receives webhook payloads as input items from the HTTP server.
  // If there are no input items, the node is being activated/deactivated.
  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < inputItems.length; idx++) {
    const item = inputItems[idx];
    const itemJson = item.json ?? {};

    try {
      // The input item carries the raw Box webhook event body.
      // Pass it through as a single output item.
      out.push({
        json: itemJson,
        binary: item.binary,
        pairedItem: { item: idx, input: 0 },
      });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message } });
    }
  }

  return [out];
};

/**
 * Register a webhook with the Box API.
 * POST /webhooks with target, address, triggers.
 */
export async function registerBoxWebhook(
  ctx: ExecutionContext,
  node: INode,
  webhookUrl: string,
): Promise<string> {
  const token = await getToken(ctx);
  const events = (node.parameters.events ?? []) as string[];
  const targetType = String(node.parameters.targetType ?? "file");
  const targetId = String(node.parameters.targetId ?? "");

  if (!targetId) {
    throw new Error("Box Trigger: targetId is required");
  }

  // Check for existing webhook registration to avoid duplicates
  const existing = await boxApi(token, "GET", "/webhooks");
  const entries = (existing.entries as Array<Record<string, unknown>> | undefined) ?? [];
  for (const wh of entries) {
    const whTarget = wh.target as Record<string, unknown> | undefined;
    const whAddress = wh.address as string | undefined;
    if (
      whTarget &&
      String(whTarget.id ?? "") === targetId &&
      String(whTarget.type ?? "") === targetType &&
      whAddress === webhookUrl
    ) {
      // Already registered — return existing ID
      return String(wh.id ?? "");
    }
  }

  const result = await boxApi(token, "POST", "/webhooks", {
    target: { id: targetId, type: targetType },
    address: webhookUrl,
    triggers: events,
  });
  return String(result.id ?? "");
}

/**
 * Delete a webhook from the Box API.
 * DELETE /webhooks/{webhookId}
 */
export async function deleteBoxWebhook(
  ctx: ExecutionContext,
  webhookId: string,
): Promise<void> {
  try {
    const token = await getToken(ctx);
    await boxApi(token, "DELETE", `/webhooks/${webhookId}`);
  } catch (err) {
    // Log but do not fail deactivation
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Box Trigger: failed to delete webhook ${webhookId}: ${message}`);
  }
}
