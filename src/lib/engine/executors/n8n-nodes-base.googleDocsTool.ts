import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const DOCS_API = "https://docs.googleapis.com/v1/documents";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

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
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleDocsOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleDocsTool: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleDocsTool: ${credName} has no accessToken`);
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
    throw new Error(`GoogleDocsTool: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function extractPlainText(doc: Record<string, unknown>): string {
  const body = asObj(doc.body);
  const content = (body.content as Array<Record<string, unknown>>) ?? [];
  let text = "";
  for (const el of content) {
    const paragraph = asObj(el.paragraph);
    const elements = (paragraph.elements as Array<Record<string, unknown>>) ?? [];
    for (const pe of elements) {
      const textRun = asObj(pe.textRun);
      if (typeof textRun.content === "string") text += textRun.content;
    }
  }
  return text;
}

async function createDocument(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
  const bodyContent = String(resolveValue(node.parameters.bodyContent, itemJson) ?? "");

  const driveBody: Record<string, unknown> = {
    name: title || "Untitled",
    mimeType: "application/vnd.google-apps.document",
  };

  const qs = new URLSearchParams({ supportsAllDrives: "true" });
  const res = await apiRequest("POST", `${DRIVE_API}?${qs}`, token, driveBody);
  const data = asObj(res.body);
  const documentId = String(data.id ?? "");

  if (bodyContent) {
    const writeBody = {
      requests: [
        {
          insertText: {
            text: bodyContent,
            endOfSegmentLocation: {},
          },
        },
      ],
    };
    if (documentId) {
      await apiRequest(
        "POST",
        `${DOCS_API}/${encodeURIComponent(documentId)}:batchUpdate`,
        token,
        writeBody,
      );
    }
  }

  let doc: Record<string, unknown> = {};
  if (documentId) {
    const getRes = await apiRequest("GET", `${DOCS_API}/${encodeURIComponent(documentId)}`, token);
    doc = asObj(getRes.body);
  }

  return {
    documentId,
    title: title || "Untitled",
    ...doc,
  };
}

async function getDocument(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = String(resolveValue(node.parameters.documentId, itemJson) ?? "");
  if (!documentId) throw new Error("GoogleDocsTool: documentId is required");

  const res = await apiRequest("GET", `${DOCS_API}/${encodeURIComponent(documentId)}`, token);
  return asObj(res.body);
}

async function updateDocument(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = String(resolveValue(node.parameters.documentId, itemJson) ?? "");
  if (!documentId) throw new Error("GoogleDocsTool: documentId is required");

  const bodyContent = String(resolveValue(node.parameters.bodyContent, itemJson) ?? "");
  const updateMode = String(resolveValue(node.parameters.updateMode, itemJson) ?? "append");

  const requests: Array<Record<string, unknown>> = [];

  if (bodyContent) {
    if (updateMode === "replace") {
      const getRes = await apiRequest("GET", `${DOCS_API}/${encodeURIComponent(documentId)}`, token);
      const doc = asObj(getRes.body);
      const docBody = asObj(doc.body);
      const content = (docBody.content as Array<Record<string, unknown>>) ?? [];
      const endIndex = content.length > 0
        ? Number(content[content.length - 1].endIndex ?? 1)
        : 1;

      if (endIndex > 1) {
        requests.push({
          deleteContentRange: {
            range: { startIndex: 1, endIndex },
          },
        });
      }
    }

    requests.push({
      insertText: {
        text: bodyContent,
        endOfSegmentLocation: {},
      },
    });
  }

  if (requests.length > 0) {
    await apiRequest(
      "POST",
      `${DOCS_API}/${encodeURIComponent(documentId)}:batchUpdate`,
      token,
      { requests },
    );
  }

  const getRes = await apiRequest("GET", `${DOCS_API}/${encodeURIComponent(documentId)}`, token);
  return asObj(getRes.body);
}

export const googleDocsToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "document");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      if (resource !== "document") {
        throw new Error(`GoogleDocsTool: unsupported resource "${resource}"`);
      }
      const token = await getAccessToken(ctx, node);
      let json: Record<string, unknown>;
      if (operation === "create") {
        json = await createDocument(node, itemJson, token);
      } else if (operation === "get") {
        json = await getDocument(node, itemJson, token);
      } else if (operation === "update") {
        json = await updateDocument(node, itemJson, token);
      } else {
        throw new Error(`GoogleDocsTool: unsupported operation "${operation}"`);
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
