import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.linkedin.com";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const { evaluateExpression } = require("../../expressions/evaluate");
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveString(raw: unknown, itemJson: Record<string, unknown>): string {
  return String(resolveValue(raw, itemJson) ?? "");
}

async function getCredential(
  ctx: ExecutionContext,
  node: INode,
): Promise<{ accessToken: string; baseUrl: string }> {
  const authentication = String(node.parameters.authentication ?? "Standard");
  const credName =
    authentication === "Community Management"
      ? "linkedInCommunityManagementOAuth2Api"
      : "linkedInOAuth2Api";
  const cred = await ctx.getCredential(credName);
  const accessToken = cred ? String((cred as Record<string, unknown>).accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error(`LinkedIn: ${credName} credential is not configured`);
  }
  return {
    accessToken,
    baseUrl: authentication === "Community Management"
      ? "https://api.linkedin.com/v2/communityManagement"
      : "https://api.linkedin.com/v2",
  };
}

function buildAuthorUrn(postAs: string, person: string, organization: string): string {
  if (postAs === "Organization") {
    if (!organization) throw new Error("LinkedIn: organization identifier is required");
    return `urn:li:organization:${organization}`;
  }
  if (!person) throw new Error("LinkedIn: person identifier is required");
  return person.startsWith("urn:li:person:") ? person : `urn:li:person:${person}`;
}

export const linkedInExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await createPost(ctx, node, itemJson, item);
      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function createPost(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<Record<string, unknown>> {
  const { accessToken, baseUrl } = await getCredential(ctx, node);
  const params = node.parameters;

  const postAs = String(params.postAs ?? "Person");
  const person = resolveString(params.person, itemJson);
  const organization = resolveString(params.organization, itemJson);
  const text = resolveString(params.text, itemJson);
  const mediaCategory = String(params.mediaCategory ?? "None");
  const additionalFields = params.additionalFields as Record<string, unknown> | undefined;
  const description = additionalFields
    ? resolveString(additionalFields.description, itemJson)
    : "";
  const binaryPropertyName = resolveString(params.binaryPropertyName ?? "data", itemJson);

  const author = buildAuthorUrn(postAs, person, organization);

  if (mediaCategory === "None") {
    return createTextPost(baseUrl, accessToken, author, text);
  }

  if (mediaCategory === "Article") {
    return createArticlePost(baseUrl, accessToken, author, text, description);
  }

  if (mediaCategory === "Image") {
    return createImagePost(baseUrl, accessToken, author, text, description, item, binaryPropertyName);
  }

  throw new Error(`LinkedIn: unsupported mediaCategory "${mediaCategory}"`);
}

async function apiPost(
  baseUrl: string,
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202404",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`LinkedIn API error (${res.status}): ${text}`);
  }
  return res.json().catch(() => ({}));
}

async function createTextPost(
  baseUrl: string,
  accessToken: string,
  author: string,
  text: string,
): Promise<Record<string, unknown>> {
  const body = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text,
        },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };
  return apiPost(baseUrl, accessToken, "/ugcPosts", body);
}

async function createArticlePost(
  baseUrl: string,
  accessToken: string,
  author: string,
  text: string,
  description: string,
): Promise<Record<string, unknown>> {
  const articleBody: Record<string, unknown> = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text,
        },
        shareMediaCategory: "ARTICLE",
        media: [
          {
            status: "READY",
            description: {
              text: description || text,
            },
            originalUrl: text,
          },
        ],
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };
  return apiPost(baseUrl, accessToken, "/ugcPosts", articleBody);
}

async function createImagePost(
  baseUrl: string,
  accessToken: string,
  author: string,
  text: string,
  description: string,
  item: INodeExecutionData,
  binaryPropertyName: string,
): Promise<Record<string, unknown>> {
  const binaryData = item.binary?.[binaryPropertyName];
  if (!binaryData) {
    throw new Error(`LinkedIn: binary property "${binaryPropertyName}" not found on input item`);
  }

  const mimeType = binaryData.mimeType ?? "image/png";
  const decoded = atob(binaryData.data as string);

  const registerRes = await fetch(
    `${baseUrl}/rest/images?action=initializeUpload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202404",
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: author,
        },
      }),
    },
  );
  if (!registerRes.ok) {
    const text = await registerRes.text().catch(() => "unknown error");
    throw new Error(`LinkedIn image upload error (${registerRes.status}): ${text}`);
  }
  const registerData = (await registerRes.json()) as Record<string, unknown>;
  const value = registerData.value as Record<string, unknown> | undefined;
  const uploadUrl = value?.uploadUrl as string | undefined;
  const imageUrn = value?.image as string | undefined;
  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn: failed to get image upload URL");
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: decoded,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "unknown error");
    throw new Error(`LinkedIn image upload failed (${uploadRes.status}): ${text}`);
  }

  const postBody = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text,
        },
        shareMediaCategory: "IMAGE",
        media: [
          {
            status: "READY",
            description: {
              text: description || text,
            },
            media: imageUrn,
          },
        ],
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };
  return apiPost(baseUrl, accessToken, "/ugcPosts", postBody);
}
