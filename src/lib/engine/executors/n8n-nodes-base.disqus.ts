import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const DISQUS_API_BASE = "https://disqus.com/api/3.0";

function disqusEndpoint(resource: string, operation: string): string {
  if (resource !== "forum") throw new Error(`Disqus: unsupported resource "${resource}"`);

  switch (operation) {
    case "get":
      return `${DISQUS_API_BASE}/forums/details.json`;
    case "getCategories":
      return `${DISQUS_API_BASE}/forums/listCategories.json`;
    case "getThreads":
      return `${DISQUS_API_BASE}/forums/listThreads.json`;
    case "getPosts":
      return `${DISQUS_API_BASE}/forums/listPosts.json`;
    default:
      throw new Error(`Disqus: unsupported operation "${operation}"`);
  }
}

export const disqusExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "forum");
  const operation = ctx.getParam<string>("operation", "get");
  const forum = ctx.getParam<string>("forum", "");
  const threadId = ctx.getParam<string>("threadId", "");
  const limit = ctx.getParam<number>("limit", 0);
  const cursor = ctx.getParam<string>("cursor", "");
  const continueOnFail = ctx.continueOnFail();

  const credential = await ctx.getCredential("disqusApi");

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      if (!forum) throw new Error("Disqus: forum parameter is required");

      const url = new URL(disqusEndpoint(resource, operation));
      url.searchParams.set("forum", forum);
      if (threadId) url.searchParams.set("thread", threadId);
      if (limit > 0) url.searchParams.set("limit", String(limit));
      if (cursor) url.searchParams.set("cursor", cursor);

      if (credential?.accessToken) {
        url.searchParams.set("access_token", credential.accessToken as string);
      }

      const res = await fetch(url.toString(), {
        headers: { accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(
          `Disqus API: HTTP ${res.status} ${res.statusText ?? ""}`.trim(),
        );
      }

      const body = (await res.json()) as Record<string, unknown>;

      out.push({
        json: body as Record<string, unknown>,
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
