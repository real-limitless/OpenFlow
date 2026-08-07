import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems, sdkHttpRequest } from "@/sdk";

interface TravisCiCredential {
  apiToken: string;
}

async function getCredential(ctx: ExecutionContext): Promise<TravisCiCredential> {
  const cred = await ctx.getCredential("travisCiApi");
  if (!cred) throw new Error("Travis CI Tool: travisCiApi credential is not configured");

  const credData = cred as Record<string, unknown>;
  const apiToken = String(
    credData.apiToken ?? credData.accessToken ?? credData.token ?? credData.password ?? "",
  );
  if (!apiToken) throw new Error("Travis CI Tool: API token is required in credential");

  return { apiToken };
}

function inferBaseUrl(slug: string): string {
  if (slug.includes("/")) {
    const org = slug.split("/")[0];
    if (org.includes(".") || org === "com") {
      return "https://api.travis-ci.com";
    }
  }
  return "https://api.travis-ci.org";
}

type OpResult = { json: Record<string, unknown> };

async function runGetBuild(ctx: ExecutionContext, slug: string): Promise<OpResult> {
  const { apiToken } = await getCredential(ctx);
  const buildId = String(ctx.getParam("buildId", ""));
  if (!buildId) throw new Error("Travis CI Tool: buildId is required on 'get' operation");

  const baseUrl = inferBaseUrl(slug);
  const res = await sdkHttpRequest({
    method: "GET",
    url: `${baseUrl}/api/v3/build/${encodeURIComponent(buildId)}`,
    headers: { Authorization: `token ${apiToken}`, Accept: "application/json", "Travis-API-Version": "3" },
    timeoutMs: 30000,
  });

  if (res.status < 200 || res.status >= 300) {
    const err = new Error("Travis CI API request failed");
    (err as Record<string, unknown>).status = res.status;
    throw err;
  }

  return { json: res.body as Record<string, unknown> };
}

async function runGetAllBuilds(ctx: ExecutionContext, slug: string): Promise<OpResult[]> {
  const { apiToken } = await getCredential(ctx);
  const returnAll = Boolean(ctx.getParam("returnAll", false));
  const limit = Number(ctx.getParam("limit", 50));
  const filters = ctx.getParam<Record<string, unknown>>("filters", {});

  const baseUrl = inferBaseUrl(slug);
  const params = new URLSearchParams();
  if (filters?.branch) params.set("branch", String(filters.branch));
  if (filters?.eventType) params.set("event_type", String(filters.eventType));

  const qs = params.toString();
  const url = `${baseUrl}/api/v3/repo/${encodeURIComponent(slug)}/builds${qs ? `?${qs}` : ""}`;

  const res = await sdkHttpRequest({
    method: "GET",
    url,
    headers: { Authorization: `token ${apiToken}`, Accept: "application/json", "Travis-API-Version": "3" },
    timeoutMs: 30000,
  });

  if (res.status < 200 || res.status >= 300) {
    const err = new Error("Travis CI API request failed");
    (err as Record<string, unknown>).status = res.status;
    throw err;
  }

  const builds = (res.body as Record<string, unknown>)?.builds as Record<string, unknown>[] ?? [];
  const items = returnAll ? builds : builds.slice(0, limit);
  return items.map((b) => ({ json: b }));
}

async function runCancelBuild(ctx: ExecutionContext, slug: string): Promise<OpResult> {
  const { apiToken } = await getCredential(ctx);
  const buildId = String(ctx.getParam("buildId", ""));
  if (!buildId) throw new Error("Travis CI Tool: buildId is required on 'cancel' operation");

  const baseUrl = inferBaseUrl(slug);
  const res = await sdkHttpRequest({
    method: "POST",
    url: `${baseUrl}/api/v3/build/${encodeURIComponent(buildId)}/cancel`,
    headers: {
      Authorization: `token ${apiToken}`,
      Accept: "application/json",
      "Travis-API-Version": "3",
      "Content-Type": "application/json",
    },
    timeoutMs: 30000,
  });

  if (res.status < 200 || res.status >= 300) {
    const err = new Error("Travis CI API request failed");
    (err as Record<string, unknown>).status = res.status;
    throw err;
  }

  return { json: res.body as Record<string, unknown> };
}

async function runRestartBuild(ctx: ExecutionContext, slug: string): Promise<OpResult> {
  const { apiToken } = await getCredential(ctx);
  const buildId = String(ctx.getParam("buildId", ""));
  if (!buildId) throw new Error("Travis CI Tool: buildId is required on 'restart' operation");

  const baseUrl = inferBaseUrl(slug);
  const res = await sdkHttpRequest({
    method: "POST",
    url: `${baseUrl}/api/v3/build/${encodeURIComponent(buildId)}/restart`,
    headers: {
      Authorization: `token ${apiToken}`,
      Accept: "application/json",
      "Travis-API-Version": "3",
      "Content-Type": "application/json",
    },
    timeoutMs: 30000,
  });

  if (res.status < 200 || res.status >= 300) {
    const err = new Error("Travis CI API request failed");
    (err as Record<string, unknown>).status = res.status;
    throw err;
  }

  return { json: res.body as Record<string, unknown> };
}

async function runTriggerBuild(ctx: ExecutionContext, slug: string): Promise<OpResult> {
  const { apiToken } = await getCredential(ctx);
  const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});

  const baseUrl = inferBaseUrl(slug);
  const body: Record<string, unknown> = {
    request: {} as Record<string, unknown>,
  };

  const request: Record<string, unknown> = {};
  if (additionalFields?.branch) request.branch = additionalFields.branch;
  if (additionalFields?.message) request.message = additionalFields.message;
  if (additionalFields?.config) request.config = additionalFields.config;
  body.request = request;

  const res = await sdkHttpRequest({
    method: "POST",
    url: `${baseUrl}/api/v3/repo/${encodeURIComponent(slug)}/requests`,
    headers: {
      Authorization: `token ${apiToken}`,
      Accept: "application/json",
      "Travis-API-Version": "3",
      "Content-Type": "application/json",
    },
    body,
    timeoutMs: 30000,
  });

  if (res.status < 200 || res.status >= 300) {
    const err = new Error("Travis CI API request failed");
    (err as Record<string, unknown>).status = res.status;
    throw err;
  }

  return { json: res.body as Record<string, unknown> };
}

export const travisCiToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(ctx.getParam("resource", "build"));
  const operation = String(ctx.getParam("operation", "get"));
  const slug = String(ctx.getParam("slug", ""));
  const continueOnFail = ctx.continueOnFail();

  if (resource !== "build") {
    throw new Error(`Travis CI Tool: unsupported resource "${resource}"`);
  }
  if (!slug) throw new Error("Travis CI Tool: slug is required");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: OpResult | OpResult[];
      switch (operation) {
        case "get":
          result = await runGetBuild(ctx, slug);
          break;
        case "getAll":
          result = await runGetAllBuilds(ctx, slug);
          break;
        case "cancel":
          result = await runCancelBuild(ctx, slug);
          break;
        case "restart":
          result = await runRestartBuild(ctx, slug);
          break;
        case "trigger":
          result = await runTriggerBuild(ctx, slug);
          break;
        default:
          throw new Error(`Travis CI Tool: unsupported operation "${operation}"`);
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
