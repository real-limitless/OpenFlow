import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const DEFAULT_HOST = "graph.facebook.com";
const VIDEO_HOST = "graph-video.facebook.com";

const METHOD_OPTIONS = ["GET", "POST", "DELETE"] as const;

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function buildUrl(params: {
  host: string;
  graphApiVersion: string;
  node: string;
  edge: string;
}): string {
  const host = params.host === "Video" ? VIDEO_HOST : DEFAULT_HOST;
  let base = `https://${host}`;
  if (params.graphApiVersion) {
    base += `/${params.graphApiVersion}`;
  }
  const nodePath = params.node.replace(/^\//, "");
  base += `/${nodePath}`;
  if (params.edge) {
    base += `/${params.edge}`;
  }
  return base;
}

async function getAccessToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("facebookGraphApi");
  if (!cred) {
    throw new Error("Facebook Graph API: credential 'facebookGraphApi' is not configured");
  }
  const token = String(cred.accessToken ?? cred.appAccessToken ?? "");
  if (!token) {
    throw new Error("Facebook Graph API: accessToken is missing in credential");
  }
  return token;
}

export const facebookGraphApiExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const method = String(resolveValue(node.parameters.method ?? "GET", itemJson)).toUpperCase();
      const host = String(node.parameters.host ?? "Default");
      const graphApiVersion = String(resolveValue(node.parameters.graphApiVersion ?? "", itemJson));
      const fbNode = String(resolveValue(node.parameters.node ?? "", itemJson));
      const edge = String(resolveValue(node.parameters.edge ?? "", itemJson));
      const sendBinaryFile = node.parameters.sendBinaryFile === true;
      const inputBinaryField = String(resolveValue(node.parameters.inputBinaryField ?? "data", itemJson));

      if (!fbNode) {
        throw new Error("Facebook Graph API: 'node' parameter is required");
      }
      if (!METHOD_OPTIONS.includes(method as typeof METHOD_OPTIONS[number])) {
        throw new Error(`Facebook Graph API: unsupported method '${method}'`);
      }

      const url = buildUrl({ host, graphApiVersion, node: fbNode, edge });
      const accessToken = await getAccessToken(ctx);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
      };

      let body: string | undefined;
      if (method === "POST" && sendBinaryFile) {
        const binaryData = item.binary?.[inputBinaryField];
        if (binaryData?.data) {
          const buffer = Buffer.from(binaryData.data, "base64");
          body = buffer.toString("binary");
          headers["Content-Type"] = binaryData.mimeType ?? "application/octet-stream";
        }
      }

      const fetchInit: RequestInit = {
        method,
        headers,
      };
      if (body !== undefined) {
        fetchInit.body = body;
      }

      const response = await fetch(url, fetchInit);
      const responseText = await response.text();

      let responseJson: unknown = responseText;
      try {
        responseJson = responseText ? JSON.parse(responseText) : null;
      } catch {
        // keep as text
      }

      if (!response.ok) {
        const errMsg =
          responseJson && typeof responseJson === "object"
            ? (responseJson as Record<string, unknown>)?.error?.message ?? responseText
            : responseText;
        throw new Error(`Facebook Graph API: ${response.status} ${errMsg}`);
      }

      const outputJson = responseJson && typeof responseJson === "object"
        ? (responseJson as Record<string, unknown>)
        : { data: responseText };

      const outputItem: INodeExecutionData = {
        json: outputJson,
        pairedItem,
      };

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.startsWith("video/") || contentType.startsWith("image/") || contentType.startsWith("audio/")) {
        const binaryData = responseText;
        outputItem.binary = {
          data: {
            data: Buffer.from(binaryData).toString("base64"),
            mimeType: contentType,
            fileName: "response",
          },
        };
      }

      out.push(outputItem);
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({
        json: { error: { message, code: 500 } },
        pairedItem,
      });
    }
  }

  return [out];
};