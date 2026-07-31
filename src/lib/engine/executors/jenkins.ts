import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

interface JenkinsCredential {
  baseUrl: string;
  authHeader: string;
}

async function getCredential(ctx: ExecutionContext): Promise<JenkinsCredential> {
  const cred = await ctx.getCredential("jenkinsApi");
  if (!cred) throw new Error("Jenkins: jenkinsApi credential is not configured");

  const credData = cred as Record<string, unknown>;
  const instanceUrl = String(credData.url ?? credData.instanceUrl ?? credData.baseUrl ?? "");
  const username = String(credData.username ?? credData.user ?? "");
  const token = String(credData.token ?? credData.apiToken ?? credData.password ?? "");

  if (!instanceUrl) throw new Error("Jenkins: instance URL is required in credential");
  if (!username || !token) throw new Error("Jenkins: username and API token are required in credential");

  const baseUrl = instanceUrl.replace(/\/+$/, "");
  const encoded = Buffer.from(`${username}:${token}`).toString("base64");

  return { baseUrl, authHeader: `Basic ${encoded}` };
}

async function jenkinsRequest(
  baseUrl: string,
  authHeader: string,
  method: string,
  path: string,
  body?: string | URLSearchParams,
  contentType?: string,
): Promise<{ status: number; data: unknown }> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: authHeader,
  };
  if (contentType) headers["Content-Type"] = contentType;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined) init.body = body;
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }

    if (response.status < 200 || response.status >= 300) {
      const msg = typeof parsed === "object" && parsed !== null
        ? String((parsed as Record<string, unknown>).message ?? (parsed as Record<string, unknown>).error ?? "")
        : "";
      const err = new Error(msg || `Jenkins request failed with status ${response.status}`);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return { status: response.status, data: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function urlEncodePath(job: string): string {
  return job.split("/").map((seg) => encodeURIComponent(seg)).join("/");
}

type OpResult = { json: Record<string, unknown> };

export const jenkinsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "job");
  const operation = String(node.parameters.operation ?? "trigger");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  _itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  if (resource === "build") return runBuildOperation(ctx, node, operation);
  if (resource === "instance") return runInstanceOperation(ctx, node, operation);
  if (resource === "job") return runJobOperation(ctx, node, operation);
  throw new Error(`Jenkins: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function runBuildOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
): Promise<OpResult | OpResult[]> {
  const { baseUrl, authHeader } = await getCredential(ctx);

  if (operation === "list") {
    const job = String(node.parameters.job ?? "");
    if (!job) throw new Error("Jenkins: job is required for build list");
    const path = `/job/${urlEncodePath(job)}/api/json?tree=builds[*]`;
    const res = await jenkinsRequest(baseUrl, authHeader, "GET", path);
    const builds = (res.data as Record<string, unknown>)?.builds ?? [];
    return (builds as Record<string, unknown>[]).map((b) => ({ json: b }));
  }

  throw new Error(`Jenkins: unsupported build operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Instance
// ---------------------------------------------------------------------------

async function runInstanceOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
): Promise<OpResult> {
  const { baseUrl, authHeader } = await getCredential(ctx);

  let path = "";
  switch (operation) {
    case "cancelQuietDown":
      path = "/cancelQuietDown";
      break;
    case "quietDown":
      path = "/quietDown";
      break;
    case "restart":
      path = "/restart";
      break;
    case "safeRestart":
      path = "/safeRestart";
      break;
    case "safeExit":
      path = "/safeExit";
      break;
    case "exit":
      path = "/exit";
      break;
    default:
      throw new Error(`Jenkins: unsupported instance operation "${operation}"`);
  }

  await jenkinsRequest(baseUrl, authHeader, "POST", path);
  return { json: { success: true, operation } };
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

async function runJobOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
): Promise<OpResult> {
  const { baseUrl, authHeader } = await getCredential(ctx);

  if (operation === "trigger") {
    const job = String(node.parameters.job ?? "");
    if (!job) throw new Error("Jenkins: job is required for trigger");
    const path = `/job/${urlEncodePath(job)}/build`;
    const res = await jenkinsRequest(baseUrl, authHeader, "POST", path);
    const location = (res.data as Record<string, unknown>)?.location ?? "";
    return { json: { success: true, operation: "trigger", location: String(location) } };
  }

  if (operation === "triggerWithParameters") {
    const job = String(node.parameters.job ?? "");
    if (!job) throw new Error("Jenkins: job is required for trigger with parameters");
    const raw = node.parameters.buildParameters as Record<string, unknown> ?? {};
    const entries = (raw.parameters as Array<Record<string, unknown>>) ?? [];
    const params = new URLSearchParams();
    for (const entry of entries) {
      const name = String(entry.name ?? "");
      const value = String(entry.value ?? "");
      if (name) params.append(name, value);
    }
    const path = `/job/${urlEncodePath(job)}/buildWithParameters`;
    const bodyStr = params.toString();
    const res = await jenkinsRequest(baseUrl, authHeader, "POST", path, bodyStr, "application/x-www-form-urlencoded");
    const location = (res.data as Record<string, unknown>)?.location ?? "";
    return { json: { success: true, operation: "triggerWithParameters", location: String(location) } };
  }

  if (operation === "copy") {
    const sourceJob = String(node.parameters.sourceJob ?? "");
    const destinationJob = String(node.parameters.destinationJob ?? "");
    if (!sourceJob || !destinationJob) throw new Error("Jenkins: sourceJob and destinationJob are required for copy");
    const path = `/createItem?name=${encodeURIComponent(destinationJob)}&mode=copy&from=${encodeURIComponent(sourceJob)}`;
    await jenkinsRequest(baseUrl, authHeader, "POST", path);
    return { json: { success: true, operation: "copy", job: destinationJob } };
  }

  if (operation === "create") {
    const destinationJob = String(node.parameters.destinationJob ?? node.parameters.job ?? "");
    const jobConfiguration = node.parameters.jobConfiguration;
    if (!destinationJob) throw new Error("Jenkins: job name is required for create");
    if (!jobConfiguration) throw new Error("Jenkins: jobConfiguration is required for create");
    const configXml = typeof jobConfiguration === "string" ? jobConfiguration : JSON.stringify(jobConfiguration);
    const path = `/createItem?name=${encodeURIComponent(destinationJob)}`;
    await jenkinsRequest(baseUrl, authHeader, "POST", path, configXml, "application/xml");
    return { json: { success: true, operation: "create", job: destinationJob } };
  }

  throw new Error(`Jenkins: unsupported job operation "${operation}"`);
}