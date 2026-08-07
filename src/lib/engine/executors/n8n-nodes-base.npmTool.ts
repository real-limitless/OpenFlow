import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const DEFAULT_REGISTRY = "https://registry.npmjs.org";

export const npmToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "package");
  const operation = ctx.getParam<string>("operation", "getMetadata");
  const continueOnFail = ctx.continueOnFail();

  const credential = await ctx.getCredential("npmApi");
  const registryBase = stripTrailingSlash(
    (credential?.registryUrl as string) || DEFAULT_REGISTRY,
  );
  const accessToken = credential?.accessToken as string | undefined;

  const authHeaders: Record<string, string> = {};
  if (accessToken) {
    authHeaders["Authorization"] = `Bearer ${accessToken}`;
  }

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const packageName = ctx.getParam<string>("packageName", "");
      let result: unknown;

      if (resource === "package") {
        if (operation === "getMetadata") {
          if (!packageName) throw new Error("npm Tool: packageName is required");
          result = await fetchJson(
            `${registryBase}/${encodeURIComponent(packageName)}`,
            authHeaders,
          );
        } else if (operation === "getVersions") {
          if (!packageName) throw new Error("npm Tool: packageName is required");
          const headers = {
            accept: "application/vnd.npm.install-v1+json",
            ...authHeaders,
          };
          result = await fetchJson(
            `${registryBase}/${encodeURIComponent(packageName)}`,
            headers,
          );
        } else if (operation === "search") {
          const query = packageName || "";
          result = await fetchJson(
            `${registryBase}/-/v1/search?text=${encodeURIComponent(query)}`,
            authHeaders,
          );
        } else {
          throw new Error(`npm Tool: unsupported package operation "${operation}"`);
        }
      } else if (resource === "distTag") {
        if (!packageName) throw new Error("npm Tool: packageName is required");
        if (operation === "getAll") {
          result = await fetchJson(
            `${registryBase}/-/package/${encodeURIComponent(packageName)}/dist-tags`,
            authHeaders,
          );
        } else if (operation === "update") {
          const distTag = ctx.getParam<string>("distTag", "");
          const distVersion = ctx.getParam<string>("distVersion", "");
          if (!distTag || !distVersion) {
            throw new Error("npm Tool: distTag and distVersion are required for update");
          }
          const putHeaders: Record<string, string> = {
            "content-type": "application/json",
          };
          if (accessToken) {
            putHeaders["Authorization"] = `Bearer ${accessToken}`;
          }
          result = await fetchJson(
            `${registryBase}/-/package/${encodeURIComponent(packageName)}/dist-tags/${encodeURIComponent(distTag)}`,
            putHeaders,
            "PUT",
            distVersion,
          );
        } else {
          throw new Error(`npm Tool: unsupported distTag operation "${operation}"`);
        }
      } else {
        throw new Error(`npm Tool: unsupported resource "${resource}"`);
      }

      out.push({
        json: result as Record<string, unknown>,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function fetchJson(
  url: string,
  headers: Record<string, string> = {},
  method = "GET",
  body?: string,
): Promise<unknown> {
  const init: RequestInit = {
    method,
    headers: { accept: "application/json", ...headers },
  };
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = body;
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `npm Registry API: HTTP ${res.status} ${res.statusText ?? ""}${text ? ` - ${text.slice(0, 200)}` : ""}`.trim(),
    );
  }
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}
