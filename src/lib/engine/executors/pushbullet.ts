import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.pushbullet.com/v2";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function pushbulletRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, API_BASE.endsWith("/") ? API_BASE : `${API_BASE}/`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        "Access-Token": token,
        "Content-Type": "application/json; charset=utf-8",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url.toString(), init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(
        obj.error?.message ?? obj.message ?? obj.error ?? `Pushbullet request failed with status code ${response.status}`,
      );
      throw new Error(errMsg);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export const pushbulletExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("pushbulletOAuth2Api");
  if (!cred) throw new Error("Pushbullet: pushbulletOAuth2Api credential is required");
  const accessToken = String((cred as Record<string, unknown>).accessToken ?? "");
  if (!accessToken) throw new Error("Pushbullet: accessToken is missing in credential");

  const operation = String(node.parameters.operation ?? "create");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: unknown;
      if (operation === "create") {
        result = await handleCreate(accessToken, node, itemJson);
      } else if (operation === "delete") {
        result = await handleDelete(accessToken, node, itemJson);
      } else if (operation === "getAll") {
        result = await handleGetAll(accessToken, node, itemJson);
      } else if (operation === "update") {
        result = await handleUpdate(accessToken, node, itemJson);
      } else {
        throw new Error(`Pushbullet: unsupported operation "${operation}"`);
      }
      if (Array.isArray(result)) {
        for (const r of result) {
          out.push({ json: r, pairedItem });
        }
      } else {
        out.push({ json: result as Record<string, unknown>, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message, type: "api_error" } }, pairedItem });
    }
  }

  return [out];
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", `return (${raw.replace(/^=/, "")})`);
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

async function handleCreate(
  token: string,
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const pushType = String(node.parameters.pushType ?? "note");
  const body: Record<string, unknown> = { type: pushType };

  const title = resolveValue(node.parameters.title, itemJson);
  if (title) body.title = String(title);

  if (pushType === "note" || pushType === "link") {
    const bodyText = resolveValue(node.parameters.body, itemJson);
    if (bodyText) body.body = String(bodyText);
  }

  if (pushType === "link") {
    const url = resolveValue(node.parameters.url, itemJson);
    if (url) body.url = String(url);
  }

  if (pushType === "file") {
    const binaryProperty = String(resolveValue(node.parameters.binaryProperty, itemJson) ?? "data");
    throw new Error(`Pushbullet: file-type pushes require a prior upload-request step; binaryProperty="${binaryProperty}" not yet supported`);
  }

  const target = String(node.parameters.target ?? "");
  if (target === "device") {
    const deviceIden = resolveValue(node.parameters.device_iden, itemJson);
    if (deviceIden) body.device_iden = String(deviceIden);
  } else if (target === "email") {
    const email = resolveValue(node.parameters.email, itemJson);
    if (email) body.email = String(email);
  } else if (target === "channel") {
    const channelTag = resolveValue(node.parameters.channel_tag, itemJson);
    if (channelTag) body.channel_tag = String(channelTag);
  }

  const res = await pushbulletRequest(token, "POST", "pushes", body);
  return asObj(res);
}

async function handleDelete(
  token: string,
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const pushId = String(resolveValue(node.parameters.pushId, itemJson) ?? "");
  if (!pushId) throw new Error("Pushbullet: pushId is required for delete");
  await pushbulletRequest(token, "DELETE", `pushes/${pushId}`);
  return {};
}

async function handleGetAll(
  token: string,
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
  const filter = (filters.filter ?? {}) as Record<string, unknown>;

  const params: Record<string, string> = {};
  const active = filter.active !== undefined ? Boolean(filter.active) : true;
  params.active = String(active);
  const modifiedAfter = resolveValue(filter.modifiedAfter, itemJson);
  if (modifiedAfter) params.modified_after = String(modifiedAfter);

  if (!returnAll) {
    params.limit = String(Math.min(Math.max(1, limit), 500));
  }

  const res = await pushbulletRequest(token, "GET", "pushes", undefined, params);
  const obj = res as Record<string, unknown> | undefined;
  const pushes = (obj?.pushes ?? []) as Record<string, unknown>[];
  const sliced = returnAll ? pushes : pushes.slice(0, limit);
  return [{ pushes: sliced }];
}

async function handleUpdate(
  token: string,
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const pushId = String(resolveValue(node.parameters.pushId, itemJson) ?? "");
  if (!pushId) throw new Error("Pushbullet: pushId is required for update");
  const dismissed = node.parameters.dismissed !== undefined ? Boolean(node.parameters.dismissed) : true;
  const body: Record<string, unknown> = { dismissed };
  const res = await pushbulletRequest(token, "POST", `pushes/${pushId}`, body);
  return asObj(res);
}