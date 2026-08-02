import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const REDDIT_API = "https://oauth.reddit.com";

function normalizeId(id: string): string {
  const trimmed = id.trim();
  if (/^(t[1-8]_)??[a-z0-9]+$/i.test(trimmed)) return trimmed;
  return trimmed;
}

async function redditFetch(path: string, token: string, method = "GET", body?: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(`${REDDIT_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "user-agent": "OpenFlow/1.0",
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok && !data?.error) {
    throw new Error(`Reddit API: HTTP ${res.status}`);
  }
  if (Array.isArray((data as any)?.json?.errors) && (data as any).json.errors.length > 0) {
    const msgs = (data as any).json.errors.map((e: unknown) => JSON.stringify(e)).join(", ");
    throw new Error(`Reddit API: ${msgs}`);
  }
  return data;
}

async function getToken(ctx: {
  getCredential: (name: string) => Promise<Record<string, string> | null>;
}): Promise<string> {
  const cred = await ctx.getCredential("redditOAuth2Api");
  if (!cred?.accessToken) {
    throw new Error("Reddit: missing or invalid redditOAuth2Api credential (accessToken required)");
  }
  return cred.accessToken;
}

export const redditExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  if (items.length === 0) return [[]];

  const resource = ctx.getParam<string>("resource", "Post");
  const operation = ctx.getParam<string>("operation", "getAll");
  const continueOnFail = ctx.continueOnFail();

  const token = await getToken(ctx as never);

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      if (resource === "Post" && operation === "submit") {
        const subreddit = ctx.getParam<string>("subreddit", "").replace(/^r\//, "");
        const title = ctx.getParam<string>("title", "");
        const postText = ctx.getParam<string>("postText", "");
        const postUrl = ctx.getParam<string>("postUrl", "");
        const nsfw = ctx.getParam<boolean>("nsfw", false);
        const spoiler = ctx.getParam<boolean>("spoiler", false);
        const flairId = ctx.getParam<string>("flairId", "");
        const kind = postUrl ? "link" : "self";
        const body = new URLSearchParams({
          kind,
          sr: subreddit,
          title,
          ...(kind === "self" ? { text: postText } : { url: postUrl }),
          nsfw: String(nsfw),
          spoiler: String(spoiler),
          ...(flairId ? { flair_id: flairId } : {}),
          resubmit: kind === "link" ? "true" : "false",
        });
        result = await redditFetch("/api/submit", token, "POST", body);
      } else if (resource === "Post" && operation === "delete") {
        const postId = normalizeId(ctx.getParam<string>("postId", ""));
        if (!postId) throw new Error("Reddit: postId is required for delete");
        const body = new URLSearchParams({ id: postId.startsWith("t3_") ? postId : `t3_${postId}` });
        result = await redditFetch("/api/del", token, "POST", body);
      } else if (resource === "Post" && operation === "get") {
        const postId = normalizeId(ctx.getParam<string>("postId", ""));
        if (!postId) throw new Error("Reddit: postId is required for get");
        const thingId = postId.startsWith("t3_") ? postId : `t3_${postId}`;
        result = await redditFetch(`/api/info?id=${thingId}`, token);
      } else if (resource === "Post" && operation === "getAll") {
        const subreddit = ctx.getParam<string>("subreddit", "").replace(/^r\//, "");
        const sort = ctx.getParam<string>("sort", "hot");
        const limit = ctx.getParam<number>("limit", 25);
        const listing = await redditFetch(`/r/${subreddit}/${sort}?limit=${limit}&raw_json=1`, token);
        const children = (listing as any)?.data?.children;
        if (Array.isArray(children)) {
          for (const child of children) {
            out.push({
              json: child.data ?? child,
              pairedItem: item.pairedItem ?? { item: i, input: 0 },
            });
          }
        }
        continue;
      } else if (resource === "Post" && operation === "search") {
        const subreddit = ctx.getParam<string>("subreddit", "");
        const query = ctx.getParam<string>("query", "");
        const sort = ctx.getParam<string>("sort", "relevance");
        const limit = ctx.getParam<number>("limit", 25);
        const restrictSr = subreddit ? "&restrict_sr=on" : "";
        const srPath = subreddit ? `/r/${subreddit.replace(/^r\//, "")}` : "";
        const listing = await redditFetch(
          `${srPath}/search?q=${encodeURIComponent(query)}&sort=${sort}&limit=${limit}&raw_json=1${restrictSr}`,
          token,
        );
        const children = (listing as any)?.data?.children;
        if (Array.isArray(children)) {
          for (const child of children) {
            out.push({
              json: child.data ?? child,
              pairedItem: item.pairedItem ?? { item: i, input: 0 },
            });
          }
        }
        continue;
      } else if (resource === "Post Comment" && operation === "create") {
        const postId = normalizeId(ctx.getParam<string>("postId", ""));
        const postText = ctx.getParam<string>("postText", "");
        if (!postId) throw new Error("Reddit: postId is required for creating a comment");
        const thingId = postId.startsWith("t3_") ? postId : `t3_${postId}`;
        const body = new URLSearchParams({ thing_id: thingId, text: postText });
        result = await redditFetch("/api/comment", token, "POST", body);
      } else if (resource === "Post Comment" && operation === "getAll") {
        const postId = normalizeId(ctx.getParam<string>("postId", ""));
        if (!postId) throw new Error("Reddit: postId is required for get all comments");
        const article = postId.replace(/^t[1-8]_/, "");
        const listing = await redditFetch(`/comments/${article}?raw_json=1`, token);
        const listings = Array.isArray(listing) ? listing : [listing];
        for (const l of listings) {
          const children = (l as any)?.data?.children;
          if (Array.isArray(children)) {
            for (const child of children) {
              out.push({
                json: child.data ?? child,
                pairedItem: item.pairedItem ?? { item: i, input: 0 },
              });
            }
          }
        }
        continue;
      } else if (resource === "Post Comment" && operation === "remove") {
        const commentId = normalizeId(ctx.getParam<string>("commentId", ""));
        if (!commentId) throw new Error("Reddit: commentId is required for remove");
        const body = new URLSearchParams({ id: commentId.startsWith("t1_") ? commentId : `t1_${commentId}` });
        result = await redditFetch("/api/del", token, "POST", body);
      } else if (resource === "Post Comment" && operation === "reply") {
        const commentId = normalizeId(ctx.getParam<string>("commentId", ""));
        const postText = ctx.getParam<string>("postText", "");
        if (!commentId) throw new Error("Reddit: commentId is required for reply");
        const thingId = commentId.startsWith("t1_") ? commentId : `t1_${commentId}`;
        const body = new URLSearchParams({ thing_id: thingId, text: postText });
        result = await redditFetch("/api/comment", token, "POST", body);
      } else if (resource === "Profile" && operation === "get") {
        result = await redditFetch("/api/v1/me", token);
      } else if (resource === "Subreddit" && operation === "get") {
        const subreddit = ctx.getParam<string>("subreddit", "").replace(/^r\//, "");
        result = await redditFetch(`/r/${subreddit}/about?raw_json=1`, token);
      } else if (resource === "Subreddit" && operation === "getAll") {
        const limit = ctx.getParam<number>("limit", 25);
        result = await redditFetch(`/subreddits/default?limit=${limit}&raw_json=1`, token);
      } else if (resource === "User" && operation === "get") {
        const userIdentifier = ctx.getParam<string>("userIdentifier", "").replace(/^u\//, "");
        if (!userIdentifier) throw new Error("Reddit: userIdentifier is required for user get");
        result = await redditFetch(`/user/${userIdentifier}/about?raw_json=1`, token);
      } else {
        throw new Error(
          `Reddit: unsupported resource/operation: ${resource}/${operation}`,
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
