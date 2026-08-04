import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const MEDIUM_API = "https://api.medium.com/v1";

interface PostResponse {
  data: {
    id: string;
    title: string;
    url: string;
    canonicalUrl: string;
    publishStatus: string;
    license: string;
    licenseUrl: string;
    authorId: string;
    tags: string[];
    content: { subtitle: string; mediumUrl: string };
  };
}

interface PublicationResponse {
  data: Array<{
    id: string;
    name: string;
    description: string;
    url: string;
    imageUrl: string;
    twitterUsername: string;
  }>;
}

export const mediumExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "post");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: { ...itemJson, ...r }, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = (await ctx.getCredential("mediumApi")) ?? (await ctx.getCredential("mediumOAuth2Api"));
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error(
      "Medium: mediumApi or mediumOAuth2Api credential is not configured",
    );
  }
  return accessToken;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (resource === "post" && operation === "create") {
    return createPost(ctx, node, itemJson);
  }
  if (resource === "publication" && operation === "getAll") {
    return listPublications(ctx, node);
  }
  throw new Error(`Medium: unsupported resource/operation "${resource}/${operation}"`);
}

function getParamStr(node: INode, name: string, fallback = ""): string {
  const v = node.parameters[name];
  return v != null ? String(v) : fallback;
}

function getAdditionalField(
  node: INode,
  name: string,
  fallback: unknown = "",
): unknown {
  const add = node.parameters.additionalFields as Record<string, unknown> | undefined;
  if (add && name in add) return add[name];
  return fallback;
}

async function createPost(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const title = getParamStr(node, "title");
  if (!title) {
    throw new Error("Medium: 'title' is required for post creation");
  }
  const content = getParamStr(node, "content");
  if (!content) {
    throw new Error("Medium: 'content' is required for post creation");
  }

  const token = await getToken(ctx);
  const authorId = String(getAdditionalField(node, "authorId", "") ?? "");
  const endpoint = authorId
    ? `${MEDIUM_API}/users/${authorId}/posts`
    : `${MEDIUM_API}/me/posts`;

  const body: Record<string, unknown> = {
    title,
    contentFormat: getParamStr(node, "contentFormat", "markdown"),
    content,
    publishStatus: String(getAdditionalField(node, "publishStatus", "public") ?? "public"),
    notifyFollowers: getAdditionalField(node, "notifyFollowers", true),
  };

  const canonicalUrl = String(getAdditionalField(node, "canonicalUrl", "") ?? "");
  if (canonicalUrl) body.canonicalUrl = canonicalUrl;

  const tags = String(getAdditionalField(node, "tags", "") ?? "");
  if (tags) {
    body.tags = tags.split(",").map((t) => t.trim()).slice(0, 5);
  }

  const license = String(getAdditionalField(node, "license", "") ?? "");
  if (license && license !== "all-rights-reserved") {
    body.license = license;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "OpenFlow",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new Error("Medium: authentication failed — check your API token");
    }
    throw new Error(`Medium API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as PostResponse;
  return json.data as unknown as Record<string, unknown>;
}

async function listPublications(
  ctx: ExecutionContext,
  node: INode,
): Promise<Record<string, unknown>[]> {
  const userId = getParamStr(node, "userId");
  if (!userId) {
    throw new Error("Medium: 'userId' is required to list publications");
  }

  const token = await getToken(ctx);
  const res = await fetch(`${MEDIUM_API}/users/${userId}/publications`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "OpenFlow",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new Error("Medium: authentication failed — check your API token");
    }
    throw new Error(`Medium API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as PublicationResponse;
  return json.data.map((pub) => pub as unknown as Record<string, unknown>);
}
