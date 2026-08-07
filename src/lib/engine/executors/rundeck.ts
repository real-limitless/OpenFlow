import type { NodeExecutor } from "@/sdk";

interface RundeckCredential {
  url: string;
  token: string;
}

function buildHeaders(token: string): Record<string, string> {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-Rundeck-Auth-Token": token,
  };
}

async function apiRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Rundeck API error: status ${res.status} ${res.statusText} — ${text}`);
  }
  return res.json();
}

export const rundeckExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "job");
  const operation = ctx.getParam<string>("operation", "executeJob");
  const cred = await ctx.getCredential("rundeckApi") as RundeckCredential | null;

  if (!cred) {
    throw new Error("Rundeck credentials are required (rundeckApi)");
  }

  const baseUrl = cred.url.replace(/\/+$/, "");
  const headers = buildHeaders(cred.token);

  if (resource === "job") {
    if (operation === "executeJob") {
      const jobId = ctx.getParam<string>("jobId", "");
      if (!jobId) {
        throw new Error("jobId is required");
      }
      const nodeFilter = ctx.getParam<string>("nodeFilter", "");
      const logLevel = ctx.getParam<string>("logLevel", "INFO");
      const asUser = ctx.getParam<string>("asUser", "");
      const runAtTime = ctx.getParam<string>("runAtTime", "");
      const rawOptions = ctx.getParam<{ options?: Array<{ name: string; value: string }> }>("options", {});
      const optionEntries = rawOptions?.options ?? [];

      const body: Record<string, unknown> = {};
      if (nodeFilter) body.filter = nodeFilter;
      if (logLevel !== "INFO") body.loglevel = logLevel;
      if (asUser) body.asUser = asUser;
      if (runAtTime) body.runAtTime = runAtTime;
      if (optionEntries.length > 0) {
        body.options = Object.fromEntries(
          optionEntries.map((o) => [o.name, o.value]),
        );
      }

      const results: unknown[] = [];
      for (const item of items) {
        const url = `${baseUrl}/api/17/job/${jobId}/run`;
        const result = await apiRequest(url, "POST", headers, body);
        results.push({ json: result });
      }
      return [results];
    }

    if (operation === "getJobMetadata") {
      const jobId = ctx.getParam<string>("jobId", "");
      if (!jobId) {
        throw new Error("jobId is required");
      }

      const results: unknown[] = [];
      for (const item of items) {
        const url = `${baseUrl}/api/17/job/${jobId}`;
        const result = await apiRequest(url, "GET", headers);
        results.push({ json: result });
      }
      return [results];
    }
  }

  throw new Error(`Unsupported resource/operation: ${resource}/${operation}`);
};
