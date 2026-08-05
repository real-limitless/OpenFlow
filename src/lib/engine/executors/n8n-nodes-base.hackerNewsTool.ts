import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const ALGOLIA_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date?tags=story";
const ALGOLIA_ITEM_URL = "https://hn.algolia.com/api/v1/items";
const FIREBASE_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item";
const FIREBASE_USER_URL = "https://hacker-news.firebaseio.com/v0/user";

export const hackerNewsToolExecutor: NodeExecutor = async (ctx) => {
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
        result = await fetchAllItems(ctx);
      } else if (resource === "article" && operation === "get") {
        const articleId = resolveParam(ctx, "articleId", item, i);
        if (!articleId || String(articleId).trim() === "") {
          throw new Error("Hacker News Tool: articleId is required");
        }
        result = await fetchArticle(String(articleId));
        if (result === null) {
          throw new Error(`Hacker News Tool: article "${articleId}" not found`);
        }
      } else if (resource === "user" && operation === "get") {
        const userId = resolveParam(ctx, "userId", item, i);
        if (!userId || String(userId).trim() === "") {
          throw new Error("Hacker News Tool: userId is required");
        }
        result = await fetchUser(String(userId));
        if (result === null) {
          throw new Error(`Hacker News Tool: user "${userId}" not found`);
        }
      } else {
        throw new Error(
          `Hacker News Tool: unsupported resource/operation combination: ${resource}/${operation}`,
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

function resolveParam(
  ctx: Parameters<NodeExecutor>[0],
  name: string,
  item: INodeExecutionData,
  idx: number,
): unknown {
  const raw = ctx.getParam(name);
  if (typeof raw === "string" && raw.startsWith("={{") && raw.endsWith("}}")) {
    const resolved = ctx.evaluate(raw, item.json);
    return resolved;
  }
  return raw;
}

async function fetchAllItems(ctx: Parameters<NodeExecutor>[0]): Promise<Record<string, unknown>> {
  const returnAll = ctx.getParam<boolean>("returnAll", false);
  const limit = ctx.getParam<number>("limit", 20);
  const hitsPerPage = returnAll ? 1000 : Math.min(limit, 1000);
  const url = `${ALGOLIA_SEARCH_URL}&hitsPerPage=${hitsPerPage}`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Hacker News API: HTTP ${res.status} ${res.statusText ?? ""}`.trim());
  }
  const body = (await res.json()) as { hits?: unknown[]; nbPages?: number };

  let results = body.hits ?? [];
  if (!returnAll && results.length > limit) {
    results = results.slice(0, limit);
  }

  return { results, nbPages: body.nbPages ?? 1 };
}

async function fetchArticle(id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${ALGOLIA_ITEM_URL}/${encodeURIComponent(id)}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Hacker News API: HTTP ${res.status} ${res.statusText ?? ""}`.trim());
  }
  const raw = (await res.json()) as Record<string, unknown> | null;
  if (!raw) return null;
  return {
    id: raw.id ?? raw.objectID,
    author: raw.author ?? raw.by ?? "",
    title: raw.title ?? "",
    url: raw.url ?? "",
    points: raw.points ?? raw.score ?? 0,
    num_comments: raw.num_comments ?? raw.descendants ?? 0,
    created_at: raw.created_at ?? "",
    children: raw.children ?? raw.kids ?? [],
  };
}

async function fetchUser(id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FIREBASE_USER_URL}/${encodeURIComponent(id)}.json`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Hacker News API: HTTP ${res.status} ${res.statusText ?? ""}`.trim());
  }
  const raw = (await res.json()) as Record<string, unknown> | null;
  if (!raw) return null;
  return {
    username: raw.id ?? "",
    about: raw.about ?? "",
    karma: raw.karma ?? 0,
    created_at: formatTimestamp(raw.created),
    submissions: raw.submitted ?? [],
  };
}

function formatTimestamp(ts: unknown): string {
  if (typeof ts === "number") {
    return new Date(ts * 1000).toISOString();
  }
  return String(ts ?? "");
}
