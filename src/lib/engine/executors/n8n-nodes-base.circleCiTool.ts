import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems, sdkHttpRequest } from "@/sdk";

interface CircleCiCredential {
  apiKey: string;
}

async function getCredential(ctx: ExecutionContext): Promise<CircleCiCredential> {
  const cred = await ctx.getCredential("circleCiApi");
  if (!cred) throw new Error("CircleCI Tool: circleCiApi credential is not configured");

  const credData = cred as Record<string, unknown>;
  const apiKey = String(
    credData.apiKey ?? credData.accessToken ?? credData.token ?? credData.password ?? "",
  );
  if (!apiKey) throw new Error("CircleCI Tool: API key is required in credential");

  return { apiKey };
}

function buildProjectPath(provider: string, slug: string): string {
  return `/api/v2/project/${encodeURIComponent(provider)}/${slug}`;
}

type OpResult = { json: Record<string, unknown> };

async function runGetPipeline(ctx: ExecutionContext): Promise<OpResult> {
  const { apiKey } = await getCredential(ctx);
  const provider = String(ctx.getParam("vcs", "github"));
  const slug = String(ctx.getParam("projectSlug", ""));
  const number = Number(ctx.getParam("pipelineNumber", 0));

  if (!slug) throw new Error("CircleCI Tool: project slug is required");
  if (!number) throw new Error("CircleCI Tool: pipeline number is required");

  const path = `${buildProjectPath(provider, slug)}/pipeline/${encodeURIComponent(number)}`;
  const res = await sdkHttpRequest({
    method: "GET",
    url: `https://circleci.com${path}`,
    headers: { "Circleci-Token": apiKey, Accept: "application/json" },
    timeoutMs: 30000,
  });

  if (res.status < 200 || res.status >= 300) {
    const err = new Error("CircleCI API request failed");
    (err as Record<string, unknown>).status = res.status;
    throw err;
  }

  return { json: res.body as Record<string, unknown> };
}

async function runGetAllPipelines(ctx: ExecutionContext): Promise<OpResult[]> {
  const { apiKey } = await getCredential(ctx);
  const provider = String(ctx.getParam("vcs", "github"));
  const slug = String(ctx.getParam("projectSlug", ""));
  const returnAll = Boolean(ctx.getParam("returnAll", false));
  const limit = Number(ctx.getParam("limit", 50));

  if (!slug) throw new Error("CircleCI Tool: project slug is required");

  const branch = ctx.getParam<Record<string, unknown>>("filters", {})?.branch as string | undefined;

  let path = `${buildProjectPath(provider, slug)}/pipeline`;
  if (branch) {
    path += `?branch=${encodeURIComponent(branch)}`;
  }

  const res = await sdkHttpRequest({
    method: "GET",
    url: `https://circleci.com${path}`,
    headers: { "Circleci-Token": apiKey, Accept: "application/json" },
    timeoutMs: 30000,
  });

  if (res.status < 200 || res.status >= 300) {
    const err = new Error("CircleCI API request failed");
    (err as Record<string, unknown>).status = res.status;
    throw err;
  }

  const items = ((res.body as Record<string, unknown>)?.items ?? []) as Record<string, unknown>[];
  const pipelines = returnAll ? items : items.slice(0, limit);
  return pipelines.map((p) => ({ json: p }));
}

async function runTriggerPipeline(ctx: ExecutionContext): Promise<OpResult> {
  const { apiKey } = await getCredential(ctx);
  const provider = String(ctx.getParam("vcs", "github"));
  const slug = String(ctx.getParam("projectSlug", ""));
  const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});

  if (!slug) throw new Error("CircleCI Tool: project slug is required");

  const body: Record<string, unknown> = {};
  if (additionalFields?.branch) body.branch = additionalFields.branch;
  if (additionalFields?.tag) body.tag = additionalFields.tag;

  const path = `${buildProjectPath(provider, slug)}/pipeline`;
  const res = await sdkHttpRequest({
    method: "POST",
    url: `https://circleci.com${path}`,
    headers: {
      "Circleci-Token": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
    timeoutMs: 30000,
  });

  if (res.status < 200 || res.status >= 300) {
    const err = new Error("CircleCI API request failed");
    (err as Record<string, unknown>).status = res.status;
    throw err;
  }

  return { json: res.body as Record<string, unknown> };
}

export const circleCiToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(ctx.getParam("resource", "pipeline"));
  const operation = String(ctx.getParam("operation", "get"));
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      if (resource !== "pipeline") {
        throw new Error(`CircleCI Tool: unsupported resource "${resource}"`);
      }

      let result: OpResult | OpResult[];
      switch (operation) {
        case "get":
          result = await runGetPipeline(ctx);
          break;
        case "getAll":
          result = await runGetAllPipelines(ctx);
          break;
        case "trigger":
          result = await runTriggerPipeline(ctx);
          break;
        default:
          throw new Error(`CircleCI Tool: unsupported operation "${operation}"`);
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
