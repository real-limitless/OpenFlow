import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

interface CircleCiCredential {
  apiKey: string;
  baseUrl: string;
}

async function getCredential(ctx: ExecutionContext): Promise<CircleCiCredential> {
  const cred = await ctx.getCredential("circleCiApi");
  if (!cred) throw new Error("CircleCI: circleCiApi credential is not configured");

  const credData = cred as Record<string, unknown>;
  const apiKey = String(
    credData.apiKey ?? credData.accessToken ?? credData.token ?? credData.password ?? "",
  );
  if (!apiKey) throw new Error("CircleCI: API key is required in credential");

  const baseUrl = "https://circleci.com";
  return { apiKey, baseUrl };
}

async function circleCiRequest(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Circleci-Token": apiKey,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }

    if (response.status < 200 || response.status >= 300) {
      const msg =
        typeof parsed === "object" && parsed !== null
          ? String(
              (parsed as Record<string, unknown>).message ??
                (parsed as Record<string, unknown>).error ??
                "",
            )
          : "";
      const err = new Error(msg || `CircleCI request failed with status ${response.status}`);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return { status: response.status, data: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function buildProjectPath(provider: string, slug: string): string {
  return `/api/v2/project/${encodeURIComponent(provider)}/${slug}`;
}

type OpResult = { json: Record<string, unknown> };

async function runGetPipeline(
  ctx: ExecutionContext,
  node: INode,
): Promise<OpResult> {
  const { baseUrl, apiKey } = await getCredential(ctx);
  const provider = String(node.parameters.provider ?? "github");
  const slug = String(node.parameters.projectSlug ?? "");
  const number = String(node.parameters.pipelineNumber ?? "");

  if (!slug) throw new Error("CircleCI: project slug is required");
  if (!number) throw new Error("CircleCI: pipeline number is required");

  const path = `${buildProjectPath(provider, slug)}/pipeline/${encodeURIComponent(number)}`;
  const res = await circleCiRequest(baseUrl, apiKey, "GET", path);
  return { json: res.data as Record<string, unknown> };
}

async function runGetAllPipelines(
  ctx: ExecutionContext,
  node: INode,
): Promise<OpResult[]> {
  const { baseUrl, apiKey } = await getCredential(ctx);
  const provider = String(node.parameters.provider ?? "github");
  const slug = String(node.parameters.projectSlug ?? "");
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);

  if (!slug) throw new Error("CircleCI: project slug is required");

  const path = `${buildProjectPath(provider, slug)}/pipeline`;
  const res = await circleCiRequest(baseUrl, apiKey, "GET", path);
  const items = (res.data as Record<string, unknown>)?.items ?? [];
  const pipelines = items as Record<string, unknown>[];
  const results = returnAll ? pipelines : pipelines.slice(0, limit);
  return results.map((p) => ({ json: p }));
}

async function runTriggerPipeline(
  ctx: ExecutionContext,
  node: INode,
): Promise<OpResult> {
  const { baseUrl, apiKey } = await getCredential(ctx);
  const provider = String(node.parameters.provider ?? "github");
  const slug = String(node.parameters.projectSlug ?? "");
  const branch = String(node.parameters.branch ?? "");

  if (!slug) throw new Error("CircleCI: project slug is required");

  const body: Record<string, unknown> = {};
  if (branch) body.branch = branch;

  const path = `${buildProjectPath(provider, slug)}/pipeline`;
  const res = await circleCiRequest(baseUrl, apiKey, "POST", path, body);
  return { json: res.data as Record<string, unknown> };
}

export const circleCiExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "pipeline");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      if (resource !== "pipeline") {
        throw new Error(`CircleCI: unsupported resource "${resource}"`);
      }

      let result: OpResult | OpResult[];
      switch (operation) {
        case "get":
          result = await runGetPipeline(ctx, node);
          break;
        case "getAll":
          result = await runGetAllPipelines(ctx, node);
          break;
        case "trigger":
          result = await runTriggerPipeline(ctx, node);
          break;
        default:
          throw new Error(`CircleCI: unsupported operation "${operation}"`);
      }

      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err instanceof Error && "status" in err
          ? Number((err as Record<string, unknown>).status)
          : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};