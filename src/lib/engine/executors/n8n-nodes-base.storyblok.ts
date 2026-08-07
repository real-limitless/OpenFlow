import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const CONTENT_API_BASE = "https://cdn.storyblok.com/v1/cdn/stories";
const MANAGEMENT_API_BASE = "https://mapi.storyblok.com/v1/spaces";

function getContentToken(cred: Record<string, unknown> | null): string | undefined {
  if (!cred) return undefined;
  return (cred.contentAccessToken ?? cred.apiKey ?? cred.accessToken) as string | undefined;
}

function getManagementToken(cred: Record<string, unknown> | null): string | undefined {
  if (!cred) return undefined;
  return cred.accessToken as string | undefined;
}

function buildContentUrl(
  spaceId: string,
  operation: string,
  storyId: string,
  filters: Record<string, unknown>,
  token: string,
): string {
  const params = new URLSearchParams();
  params.set("token", token);
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") {
      params.set(k, String(v));
    }
  }
  if (operation === "get" && storyId) {
    return `${CONTENT_API_BASE}/${storyId}?${params.toString()}`;
  }
  return `${CONTENT_API_BASE}/?${params.toString()}`;
}

function buildManagementUrl(
  spaceId: string,
  operation: string,
  storyId: string,
  filters: Record<string, unknown>,
): string {
  const base = `${MANAGEMENT_API_BASE}/${spaceId}/stories`;
  if (operation === "getAll") {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") {
        params.set(k, String(v));
      }
    }
    const qs = params.toString();
    return qs ? `${base}/?${qs}` : `${base}/`;
  }
  return `${base}/${storyId}`;
}

function buildManagementHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: token,
  };
}

async function apiFetch(
  url: string,
  headers: Record<string, string>,
  method = "GET",
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { ...headers },
  });
  if (!res.ok) {
    throw new Error(`Storyblok API: HTTP ${res.status} ${res.statusText ?? ""}`.trim());
  }
  return res.json();
}

export const storyblokExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const source = ctx.getParam<string>("source", "content");
  const operation = ctx.getParam<string>("operation", "get");
  const spaceId = ctx.getParam<string>("spaceId", "");
  const rawFilters = ctx.getParam<unknown>("filters", {});
  const continueOnFail = ctx.continueOnFail();
  const credential = await ctx.getCredential("storyblokApi");

  const filters: Record<string, unknown> =
    typeof rawFilters === "string"
      ? (JSON.parse(rawFilters) as Record<string, unknown>)
      : (rawFilters as Record<string, unknown>);

  if (!spaceId || spaceId.trim() === "") {
    throw new Error("Storyblok: spaceId is required");
  }

  const contentToken = getContentToken(credential);
  const managementToken = getManagementToken(credential);

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const storyId = ctx.getParam<string>("storyId", "");

      if (
        source === "content" &&
        (operation === "get" || operation === "getAll")
      ) {
        if (operation === "get" && (!storyId || storyId.trim() === "")) {
          throw new Error("Storyblok: storyId is required for get operation");
        }
        const token = contentToken ?? "";
        const url = buildContentUrl(spaceId, operation, storyId, filters, token);
        const result = await apiFetch(url, {
          Accept: "application/json",
          "Content-Type": "application/json",
        });

        let outputData: Record<string, unknown>;
        if (operation === "get") {
          const data = result as Record<string, unknown>;
          outputData = data;
        } else {
          const data = result as { stories?: unknown[] };
          const stories = data.stories ?? [];
          for (const story of stories) {
            out.push({
              json: story as Record<string, unknown>,
              pairedItem: item.pairedItem ?? { item: i, input: 0 },
            });
          }
          continue;
        }
        out.push({
          json: outputData,
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
      } else if (source === "management") {
        if (operation === "get" || operation === "delete" || operation === "publish" || operation === "unpublish") {
          if (!storyId || storyId.trim() === "") {
            throw new Error("Storyblok: storyId is required");
          }
        }

        const headers = buildManagementHeaders(managementToken ?? "");

        if (operation === "get") {
          const url = buildManagementUrl(spaceId, operation, storyId, filters);
          const result = await apiFetch(url, headers);
          out.push({
            json: result as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: i, input: 0 },
          });
        } else if (operation === "getAll") {
          const url = buildManagementUrl(spaceId, operation, storyId, filters);
          const result = await apiFetch(url, headers);
          const data = result as { stories?: unknown[] };
          const stories = data.stories ?? [];
          for (const story of stories) {
            out.push({
              json: story as Record<string, unknown>,
              pairedItem: item.pairedItem ?? { item: i, input: 0 },
            });
          }
        } else if (operation === "delete") {
          const url = buildManagementUrl(spaceId, operation, storyId, filters);
          const result = await apiFetch(url, headers, "DELETE");
          out.push({
            json: result as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: i, input: 0 },
          });
        } else if (operation === "publish" || operation === "unpublish") {
          if (!storyId || storyId.trim() === "") {
            throw new Error("Storyblok: storyId is required");
          }
          const url = `${MANAGEMENT_API_BASE}/${spaceId}/stories/${storyId}/${operation}`;
          const result = await apiFetch(url, headers);
          out.push({
            json: result as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: i, input: 0 },
          });
        }
      } else {
        throw new Error(
          `Storyblok: unsupported source/operation combination: ${source}/${operation}`,
        );
      }
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
