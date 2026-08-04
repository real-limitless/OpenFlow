import type { NodeExecutor, ExecutionContext, SdkHttpResponse } from "@/sdk";
import { requireCredential, sdkHttpRequest } from "@/sdk";

const BANNERBEAR_BASE = "https://api.bannerbear.com/v2";

interface BannerbearCredential {
  apiKey?: string;
}

function resolveValue(
  raw: unknown,
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("={{") || raw.startsWith("=")) {
    return ctx.evaluate(raw, itemJson);
  }
  return raw;
}

async function bbRequest(
  method: string,
  path: string,
  apiKey: string,
  body?: Record<string, unknown>,
): Promise<SdkHttpResponse> {
  const url = `${BANNERBEAR_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await sdkHttpRequest({ method, url, headers, body });
  if (res.status >= 400) {
    throw new Error(`Bannerbear API error (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res;
}

async function imageCreate(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const templateUid = ctx.getParam<string>("templateUid", "");
  if (!templateUid) throw new Error("templateUid is required for Image Create");

  const rawMods = ctx.getParam<unknown>("modifications", []);
  let modifications: Record<string, unknown>[];
  if (typeof rawMods === "string") {
    modifications = JSON.parse(rawMods);
  } else {
    modifications = rawMods as Record<string, unknown>[];
  }
  if (!Array.isArray(modifications)) {
    throw new Error("modifications must be an array");
  }

  const resolvedMods = modifications.map((m) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(m)) {
      out[k] = resolveValue(v, ctx, itemJson);
    }
    return out;
  });

  const body: Record<string, unknown> = {
    template_uid: templateUid,
    modifications: resolvedMods,
  };

  const transparent = ctx.getParam<boolean>("transparent", false);
  const renderPdf = ctx.getParam<boolean>("renderPdf", false);
  const webhookUrl = ctx.getParam<string>("webhookUrl", "");
  const templateVersion = ctx.getParam<number | undefined>("templateVersion", undefined);
  const metadata = ctx.getParam<string>("metadata", "");

  if (transparent) body.transparent = true;
  if (renderPdf) body.render_pdf = true;
  if (webhookUrl) body.webhook_url = webhookUrl;
  if (templateVersion !== undefined) body.template_version = templateVersion;
  if (metadata) body.metadata = metadata;

  const res = await bbRequest("POST", "/images", apiKey, body);
  return res.body as Record<string, unknown>;
}

async function imageGet(
  ctx: ExecutionContext,
  _itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const imageUid = ctx.getParam<string>("imageUid", "");
  if (!imageUid) throw new Error("imageUid is required for Image Get");

  const res = await bbRequest("GET", `/images/${encodeURIComponent(imageUid)}`, apiKey);
  return res.body as Record<string, unknown>;
}

async function templateGet(
  ctx: ExecutionContext,
  _itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const templateUid = ctx.getParam<string>("templateUid", "");
  if (!templateUid) throw new Error("templateUid is required for Template Get");

  const res = await bbRequest("GET", `/templates/${encodeURIComponent(templateUid)}`, apiKey);
  return res.body as Record<string, unknown>;
}

async function templateGetAll(
  _ctx: ExecutionContext,
  _itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<Record<string, unknown>[]> {
  const res = await bbRequest("GET", "/templates", apiKey);
  const body = res.body as Record<string, unknown>[] | { data?: Record<string, unknown>[] };
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  return [];
}

export const bannerbearExecutor: NodeExecutor = async (ctx, _node) => {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "");
  const operation = ctx.getParam<string>("operation", "");
  const continueOnFail = ctx.continueOnFail();

  const cred = await requireCredential(ctx, "bannerbearApi");
  const apiKey = (cred as BannerbearCredential).apiKey ?? "";
  if (!apiKey) {
    if (continueOnFail) {
      return [items.map(() => ({ json: { error: "Missing bannerbearApi API key" } }))];
    }
    throw new Error("Missing bannerbearApi API key");
  }

  const output: Array<Record<string, unknown>> = [];

  if (resource === "Template" && operation === "Get All") {
    try {
      const templates = await templateGetAll(ctx, {}, apiKey);
      return [items.map(() => ({ json: templates as unknown as Record<string, unknown> }))];
    } catch (err) {
      if (continueOnFail) {
        return [items.map(() => ({ json: { error: (err as Error).message } }))];
      }
      throw err;
    }
  }

  for (const item of items) {
    const itemJson = item.json ?? {};
    try {
      let result: unknown;
      if (resource === "Image" && operation === "Create") {
        result = await imageCreate(ctx, itemJson as Record<string, unknown>, apiKey);
      } else if (resource === "Image" && operation === "Get") {
        result = await imageGet(ctx, itemJson as Record<string, unknown>, apiKey);
      } else if (resource === "Template" && operation === "Get") {
        result = await templateGet(ctx, itemJson as Record<string, unknown>, apiKey);
      } else {
        throw new Error(`Unsupported resource/operation: ${resource}/${operation}`);
      }
      output.push({ ...itemJson, ...(result as Record<string, unknown>) });
    } catch (err) {
      if (continueOnFail) {
        output.push({ ...itemJson, error: err instanceof Error ? err.message : String(err) });
      } else {
        throw err;
      }
    }
  }

  return [output.map((json) => ({ json }))];
};
