import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const ALGOLIA_URL = "https://hn.algolia.com/api/v1/search_by_date?tags=story";
const FIREBASE_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item";
const FIREBASE_USER_URL = "https://hacker-news.firebaseio.com/v0/user";

export const hackerNewsExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "all");
  const operation = ctx.getParam<string>("operation", "getAll");
  const continueOnFail = ctx.continueOnFail();

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      if (resource === "all" && operation === "getAll") {
        result = await fetchAlgoliaAll();
      } else if (resource === "article" && operation === "get") {
        const articleId = ctx.getParam<string>("articleId", "");
        if (!articleId || articleId.trim() === "") {
          throw new Error("Hacker News: articleId is required");
        }
        result = await fetchFirebaseItem(articleId);
        if (result === null) {
          throw new Error(`Hacker News: article "${articleId}" not found`);
        }
      } else if (resource === "user" && operation === "get") {
        const userId = ctx.getParam<string>("userId", "");
        if (!userId || userId.trim() === "") {
          throw new Error("Hacker News: userId is required");
        }
        result = await fetchFirebaseUser(userId);
        if (result === null) {
          throw new Error(`Hacker News: user "${userId}" not found`);
        }
      } else {
        throw new Error(
          `Hacker News: unsupported resource/operation combination: ${resource}/${operation}`,
        );
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

async function fetchAlgoliaAll(): Promise<Record<string, unknown>> {
  const res = await fetch(ALGOLIA_URL, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Hacker News API: HTTP ${res.status} ${res.statusText ?? ""}`.trim());
  }
  const body = (await res.json()) as { hits?: unknown[] };
  return { hits: body.hits ?? [] };
}

async function fetchFirebaseItem(id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FIREBASE_ITEM_URL}/${id}.json`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Hacker News API: HTTP ${res.status} ${res.statusText ?? ""}`.trim());
  }
  return (await res.json()) as Record<string, unknown> | null;
}

async function fetchFirebaseUser(id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FIREBASE_USER_URL}/${id}.json`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Hacker News API: HTTP ${res.status} ${res.statusText ?? ""}`.trim());
  }
  return (await res.json()) as Record<string, unknown> | null;
}