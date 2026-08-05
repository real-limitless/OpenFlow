import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const REDDIT_API = "https://oauth.reddit.com";

function normalizeId(id: string): string {
  const trimmed = id.trim();
  if (/^(t[1-8]_)?[a-z0-9]+$/i.test(trimmed)) return trimmed;
  return trimmed;
}

async function redditFetch(
  path: string,
  token: string,
  method = "GET",
  body?: URLSearchParams,
): Promise<Record<string, unknown>> {
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

function stripRPrefix(s: string): string {
  return s.replace(/^r\//, "");
}

export const redditToolExecutor: NodeExecutor = async (ctx) => {
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

      if (resource === "Post" && operation === "create") {
        const kind = ctx.getParam<string>("kind", "self");
        const subreddit = stripRPrefix(ctx.getParam<string>("subreddit", ""));
        const title = ctx.getParam<string>("title", "");
        const text = ctx.getParam<string>("text", "");
        const url = ctx.getParam<string>("url", "");
        const resubmit = ctx.getParam<boolean>("resubmit", false);
        const body = new URLSearchParams({
          kind,
          sr: subreddit,
          title,
          ...(kind === "self" ? { text } : { url }),
          resubmit: kind !== "self" ? String(resubmit) : "false",
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
        const subreddit = stripRPrefix(ctx.getParam<string>("subreddit", ""));
        const filters = ctx.getParam<Record<string, unknown>>("filters", {});
        const category = (filters?.category as string) ?? "hot";
        const limit = ctx.getParam<number>("limit", 100);
        const listing = await redditFetch(
          `/r/${subreddit}/${category}?limit=${Math.min(limit, 100)}&raw_json=1`,
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
      } else if (resource === "Post" && operation === "search") {
        const keyword = ctx.getParam<string>("keyword", "");
        const location = ctx.getParam<string>("location", "subreddit");
        const sort = ctx.getParam<string>("sort", "relevance");
        const limit = ctx.getParam<number>("limit", 100);
        const subreddit = ctx.getParam<string>("subreddit", "");
        const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});
        const srPath =
          location === "subreddit" && subreddit
            ? `/r/${stripRPrefix(subreddit)}`
            : "";
        const restrictSr =
          location === "subreddit" && subreddit ? "&restrict_sr=on" : "";
        const listing = await redditFetch(
          `${srPath}/search?q=${encodeURIComponent(keyword)}&sort=${sort}&limit=${Math.min(limit, 100)}&raw_json=1${restrictSr}`,
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
        const commentText = ctx.getParam<string>("commentText", "");
        if (!postId) throw new Error("Reddit: postId is required for creating a comment");
        const thingId = postId.startsWith("t3_") ? postId : `t3_${postId}`;
        const body = new URLSearchParams({ thing_id: thingId, text: commentText });
        result = await redditFetch("/api/comment", token, "POST", body);
      } else if (resource === "Post Comment" && operation === "getAll") {
        const postId = normalizeId(ctx.getParam<string>("postId", ""));
        if (!postId) throw new Error("Reddit: postId is required for get all comments");
        const article = postId.replace(/^t[1-8]_/, "");
        const limit = ctx.getParam<number>("limit", 100);
        const listing = await redditFetch(`/comments/${article}?limit=${Math.min(limit, 100)}&raw_json=1`, token);
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
        const body = new URLSearchParams({
          id: commentId.startsWith("t1_") ? commentId : `t1_${commentId}`,
        });
        result = await redditFetch("/api/del", token, "POST", body);
      } else if (resource === "Post Comment" && operation === "reply") {
        const commentId = normalizeId(ctx.getParam<string>("commentId", ""));
        const replyText = ctx.getParam<string>("replyText", "");
        if (!commentId) throw new Error("Reddit: commentId is required for reply");
        const thingId = commentId.startsWith("t1_") ? commentId : `t1_${commentId}`;
        const body = new URLSearchParams({ thing_id: thingId, text: replyText });
        result = await redditFetch("/api/comment", token, "POST", body);
      } else if (resource === "Profile" && operation === "get") {
        const details = ctx.getParam<string>("details", "identity");
        if (details === "identity") {
          result = await redditFetch("/api/v1/me", token);
        } else if (details === "karma") {
          result = await redditFetch("/api/v1/me/karma", token);
        } else if (details === "trophies") {
          result = await redditFetch("/api/v1/me/trophies", token);
        } else if (details === "friends") {
          result = await redditFetch("/api/v1/me/friends", token);
        } else if (details === "blockedUsers") {
          result = await redditFetch("/api/v1/me/blocked", token);
        } else if (details === "prefs") {
          result = await redditFetch("/api/v1/me/prefs", token);
        } else if (details === "saved") {
          result = await redditFetch("/api/v1/me/saved?raw_json=1", token);
        } else {
          result = await redditFetch("/api/v1/me", token);
        }
      } else if (resource === "Subreddit" && operation === "get") {
        const subreddit = stripRPrefix(ctx.getParam<string>("subreddit", ""));
        const content = ctx.getParam<string>("content", "about");
        if (content === "rules") {
          result = await redditFetch(`/r/${subreddit}/about/rules?raw_json=1`, token);
        } else {
          result = await redditFetch(`/r/${subreddit}/about?raw_json=1`, token);
        }
      } else if (resource === "Subreddit" && operation === "getAll") {
        const filters = ctx.getParam<Record<string, unknown>>("filters", {});
        const keyword = filters?.keyword as string | undefined;
        const trending = filters?.trending as boolean | undefined;
        const limit = ctx.getParam<number>("limit", 100);
        if (trending) {
          result = await redditFetch(`/api/v1/trending?limit=${Math.min(limit, 100)}&raw_json=1`, token);
        } else if (keyword) {
          result = await redditFetch(
            `/api/subreddits/search?q=${encodeURIComponent(keyword)}&limit=${Math.min(limit, 100)}&raw_json=1`,
            token,
          );
        } else {
          result = await redditFetch(`/subreddits/default?limit=${Math.min(limit, 100)}&raw_json=1`, token);
        }
      } else if (resource === "User" && operation === "get") {
        const username = ctx.getParam<string>("username", "").replace(/^u\//, "");
        const userDetails = ctx.getParam<string>("userDetails", "about");
        if (!username) throw new Error("Reddit: username is required for user get");
        if (userDetails === "about") {
          result = await redditFetch(`/user/${username}/about?raw_json=1`, token);
        } else if (userDetails === "overview") {
          result = await redditFetch(`/user/${username}/overview?raw_json=1`, token);
        } else if (userDetails === "submitted") {
          result = await redditFetch(`/user/${username}/submitted?raw_json=1`, token);
        } else if (userDetails === "comments") {
          result = await redditFetch(`/user/${username}/comments?raw_json=1`, token);
        } else if (userDetails === "gilded") {
          result = await redditFetch(`/user/${username}/gilded?raw_json=1`, token);
        } else {
          result = await redditFetch(`/user/${username}/about?raw_json=1`, token);
        }
      } else {
        throw new Error(`Reddit: unsupported resource/operation: ${resource}/${operation}`);
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
