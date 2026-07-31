import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const SLIDES_API = "https://slides.googleapis.com/v1/presentations";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function extractPresentationId(value: string): string {
  if (!value) return "";
  const urlMatch = value.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  return value.trim();
}

function resolvePresentationId(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return extractPresentationId(String((resolved as Record<string, unknown>).value ?? ""));
  }
  return extractPresentationId(String(resolved ?? ""));
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
    throw new Error(`GoogleSlides: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleSlides: ${credName} has no accessToken`);
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
    throw new Error(`GoogleSlides: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

async function createPresentation(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const title = String(resolveValue(node.parameters.title, itemJson) ?? "Untitled");
  const body: Record<string, unknown> = { title };
  const res = await apiRequest("POST", `${SLIDES_API}`, token, body);
  return asObj(res.body) as Record<string, unknown>;
}

async function getPresentation(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const presentationId = resolvePresentationId(node.parameters.presentationId, itemJson);
  if (!presentationId) throw new Error("GoogleSlides: presentationId is required");
  const res = await apiRequest(
    "GET",
    `${SLIDES_API}/${encodeURIComponent(presentationId)}`,
    token,
  );
  return asObj(res.body) as Record<string, unknown>;
}

async function getPresentationSlides(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const presentationId = resolvePresentationId(node.parameters.presentationId, itemJson);
  if (!presentationId) throw new Error("GoogleSlides: presentationId is required");
  const res = await apiRequest(
    "GET",
    `${SLIDES_API}/${encodeURIComponent(presentationId)}`,
    token,
  );
  const data = asObj(res.body);
  const slides = (data.slides as Array<Record<string, unknown>>) ?? [];
  return slides;
}

async function getPage(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const presentationId = resolvePresentationId(node.parameters.presentationId, itemJson);
  const pageId = String(resolveValue(node.parameters.pageId, itemJson) ?? "");
  if (!presentationId) throw new Error("GoogleSlides: presentationId is required");
  if (!pageId) throw new Error("GoogleSlides: pageId is required");
  const res = await apiRequest(
    "GET",
    `${SLIDES_API}/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageId)}`,
    token,
  );
  return asObj(res.body) as Record<string, unknown>;
}

async function getPageThumbnail(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const presentationId = resolvePresentationId(node.parameters.presentationId, itemJson);
  const pageId = String(resolveValue(node.parameters.pageId, itemJson) ?? "");
  if (!presentationId) throw new Error("GoogleSlides: presentationId is required");
  if (!pageId) throw new Error("GoogleSlides: pageId is required");
  const res = await apiRequest(
    "GET",
    `${SLIDES_API}/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageId)}/thumbnail`,
    token,
  );
  return asObj(res.body) as Record<string, unknown>;
}

async function replaceText(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const presentationId = resolvePresentationId(node.parameters.presentationId, itemJson);
  if (!presentationId) throw new Error("GoogleSlides: presentationId is required");
  const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
  const replacement = String(resolveValue(node.parameters.replacement, itemJson) ?? "");
  const replaceAll = node.parameters.replaceAllMatches !== false;
  const requests: Array<Record<string, unknown>> = [];
  if (replaceAll) {
    requests.push({
      replaceAllText: {
        containsText: { text, matchCase: false },
        replaceText: replacement,
      },
    });
  } else {
    requests.push({
      replaceAllText: {
        containsText: { text, matchCase: false },
        replaceText: replacement,
      },
    });
  }
  const res = await apiRequest(
    "POST",
    `${SLIDES_API}/${encodeURIComponent(presentationId)}:batchUpdate`,
    token,
    { requests },
  );
  return asObj(res.body) as Record<string, unknown>;
}

export const googleSlidesExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "presentation") ?? "presentation");
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "create") ?? "create");
  const continueOnFail = ctx.continueOnFail();
  const runOnce = operation !== "replaceText";
  const loopItems = runOnce ? items.slice(0, 1) : items;
  const effective = loopItems.length > 0 ? loopItems : [{ json: {} }];

  for (let idx = 0; idx < effective.length; idx++) {
    const item = effective[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const token = await getAccessToken(ctx, node);
      let json: Record<string, unknown> | Record<string, unknown>[];

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
          throw new Error(`GoogleSlides: unsupported operation "${operation}" for presentation`);
        }
      } else if (resource === "page") {
        if (operation === "get") {
          json = await getPage(node, itemJson, token);
        } else if (operation === "getThumbnail") {
          json = await getPageThumbnail(node, itemJson, token);
        } else {
          throw new Error(`GoogleSlides: unsupported operation "${operation}" for page`);
        }
      } else {
        throw new Error(`GoogleSlides: unsupported resource "${resource}"`);
      }

      if (Array.isArray(json)) {
        for (const j of json) {
          out.push({ json: j, pairedItem });
        }
      } else {
        out.push({ json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};