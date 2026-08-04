import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const SLIDES_API = "https://slides.googleapis.com/v1/presentations";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(
    node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2",
  );
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleSlidesOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleSlidesTool: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleSlidesTool: ${credName} has no accessToken`);
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleSlidesTool: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

async function createPresentation(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const title = String(resolveValue(node.parameters.title, itemJson) ?? "Untitled");
  const res = await apiRequest("POST", `${SLIDES_API}`, token, { title });
  return asObj(res.body);
}

async function getPresentation(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const presentationId = String(resolveValue(node.parameters.presentationId, itemJson) ?? "");
  if (!presentationId) throw new Error("GoogleSlidesTool: presentationId is required");
  const res = await apiRequest("GET", `${SLIDES_API}/${encodeURIComponent(presentationId)}`, token);
  return asObj(res.body);
}

async function getPresentationSlides(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const presentationId = String(resolveValue(node.parameters.presentationId, itemJson) ?? "");
  if (!presentationId) throw new Error("GoogleSlidesTool: presentationId is required");
  const res = await apiRequest("GET", `${SLIDES_API}/${encodeURIComponent(presentationId)}`, token);
  const data = asObj(res.body);
  // Spec ("Get slides from a presentation") expects the slides array itself as
  // the item json, not an object wrapping it.
  return (data.slides ?? []) as unknown as Record<string, unknown>;
}

async function replaceText(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const presentationId = String(resolveValue(node.parameters.presentationId, itemJson) ?? "");
  if (!presentationId) throw new Error("GoogleSlidesTool: presentationId is required");
  const oldText = String(resolveValue(node.parameters.oldText, itemJson) ?? "");
  const newText = String(resolveValue(node.parameters.newText, itemJson) ?? "");
  const batchBody = {
    requests: [
      {
        replaceAllText: {
          containsText: { text: oldText, matchCase: false },
          replaceText: newText,
        },
      },
    ],
  };
  await apiRequest(
    "POST",
    `${SLIDES_API}/${encodeURIComponent(presentationId)}:batchUpdate`,
    token,
    batchBody,
  );
  const getRes = await apiRequest("GET", `${SLIDES_API}/${encodeURIComponent(presentationId)}`, token);
  return asObj(getRes.body);
}

async function getPage(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const presentationId = String(resolveValue(node.parameters.presentationId, itemJson) ?? "");
  if (!presentationId) throw new Error("GoogleSlidesTool: presentationId is required");
  const slideId = String(resolveValue(node.parameters.slideId, itemJson) ?? "");
  if (!slideId) throw new Error("GoogleSlidesTool: slideId is required");
  const res = await apiRequest(
    "GET",
    `${SLIDES_API}/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(slideId)}`,
    token,
  );
  return asObj(res.body);
}

async function getThumbnail(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const presentationId = String(resolveValue(node.parameters.presentationId, itemJson) ?? "");
  if (!presentationId) throw new Error("GoogleSlidesTool: presentationId is required");
  const slideId = String(resolveValue(node.parameters.slideId, itemJson) ?? "");
  if (!slideId) throw new Error("GoogleSlidesTool: slideId is required");
  const thumbnailSize = String(resolveValue(node.parameters.thumbnailSize, itemJson) ?? "");
  const qs = thumbnailSize ? `?thumbnailProperties.mimeType=image/png&thumbnailProperties.thumbnailSize=${encodeURIComponent(thumbnailSize)}` : "";
  const res = await apiRequest(
    "GET",
    `${SLIDES_API}/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(slideId)}/thumbnail${qs}`,
    token,
  );
  return asObj(res.body);
}

export const googleSlidesToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "presentation");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const token = await getAccessToken(ctx, node);
      let json: Record<string, unknown>;
      if (resource === "presentation") {
        if (operation === "create") {
          json = await createPresentation(node, itemJson, token);
        } else if (operation === "get") {
          json = await getPresentation(node, itemJson, token);
        } else if (operation === "getSlides") {
          json = await getPresentationSlides(node, itemJson, token);
        } else if (operation === "replaceText") {
          json = await replaceText(node, itemJson, token);
        } else {
          throw new Error(`GoogleSlidesTool: unsupported presentation operation "${operation}"`);
        }
      } else if (resource === "page") {
        if (operation === "get") {
          json = await getPage(node, itemJson, token);
        } else if (operation === "getThumbnail") {
          json = await getThumbnail(node, itemJson, token);
        } else {
          throw new Error(`GoogleSlidesTool: unsupported page operation "${operation}"`);
        }
      } else {
        throw new Error(`GoogleSlidesTool: unsupported resource "${resource}"`);
      }
      out.push({ json, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
