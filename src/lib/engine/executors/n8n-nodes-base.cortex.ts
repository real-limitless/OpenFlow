import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

function getCredUrl(cred: Record<string, unknown>): string {
  return String(cred.url ?? "").replace(/\/+$/, "");
}

function getCredApiKey(cred: Record<string, unknown>): string {
  return String(cred.apiKey ?? "");
}

function pick<T>(obj: Record<string, unknown>, key: string, fallback: T): T {
  const v = obj[key] as T;
  return v !== undefined ? v : fallback;
}

export const cortexExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "analyzer");
  const operation = String(node.parameters.operation ?? "execute");
  const continueOnFail = ctx.continueOnFail();

  const cred = (await ctx.getCredential("cortexApi")) as Record<string, unknown> | null;
  if (!cred) throw new Error("Cortex: credential 'cortexApi' is not configured");
  const baseUrl = getCredUrl(cred);
  if (!baseUrl) throw new Error("Cortex: credential 'url' is missing");
  const apiKey = getCredApiKey(cred);
  if (!apiKey) throw new Error("Cortex: credential 'apiKey' is missing");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      let url = `${baseUrl}/api`;
      let method = "POST";
      let body: Record<string, unknown> = {};

      if (resource === "analyzer" && operation === "execute") {
        const analyzer = String(node.parameters.analyzer ?? "");
        const observableType = String(node.parameters.observableType ?? "");
        const tlp = node.parameters.tlp !== undefined ? Number(node.parameters.tlp) : 2;
        const additionalFields = (node.parameters.additionalFields as Record<string, unknown>) ?? {};

        let data: Record<string, unknown> = {
          data: observableType === "file" ? undefined : String(node.parameters.observableValue ?? ""),
          dataType: observableType,
          tlp,
        };

        if (observableType === "file") {
          const binaryField = String(node.parameters.binaryPropertyName ?? "data");
          const binaryData = (item.binary ?? {})[binaryField];
          if (binaryData) {
            data.data = binaryData.data ?? binaryData;
            if (binaryData.fileName) data.attachment = binaryData.fileName;
          }
        }

        body = {
          analyzerId: analyzer,
          artifact: data,
          force: pick(additionalFields, "force", false) ? 1 : 0,
        };

        const timeout = pick(additionalFields, "timeout", 3);
        if (timeout > 0) {
          url = `${baseUrl}/api/analyzer/${analyzer}/run?timeout=${encodeURIComponent(String(timeout))}`;
        } else {
          url = `${baseUrl}/api/analyzer/${analyzer}/run`;
        }
      } else if (resource === "job") {
        const jobId = String(node.parameters.jobId ?? "");
        if (!jobId) throw new Error("Cortex: jobId is required");
        method = "GET";
        if (operation === "report") {
          url = `${baseUrl}/api/job/${jobId}/report`;
        } else {
          url = `${baseUrl}/api/job/${jobId}`;
        }
      } else if (resource === "responder" && operation === "execute") {
        const responder = String(node.parameters.responder ?? "");
        const entityType = String(node.parameters.entityType ?? "");
        const jsonObject = !!node.parameters.jsonObject;

        let objectData: Record<string, unknown> = {};
        if (jsonObject) {
          try {
            objectData = JSON.parse(String(node.parameters.objectData ?? "{}"));
          } catch {
            objectData = {};
          }
        } else {
          objectData = { _type: entityType };
        }

        url = `${baseUrl}/api/responder/${responder}/run`;
        body = {
          responderId: responder,
          entityType,
          object: objectData,
        };
      } else {
        throw new Error(`Cortex: unsupported resource/operation: ${resource}/${operation}`);
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      const init: RequestInit = {
        method,
        headers,
        body: method !== "GET" ? JSON.stringify(body) : undefined,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(url, init);
        const text = await response.text();
        let parsed: unknown = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          /* keep text */
        }

        if (response.status < 200 || response.status >= 300) {
          const errMsg =
            parsed && typeof parsed === "object"
              ? String((parsed as Record<string, unknown>).message ?? "") ||
                `Cortex API error: ${response.status}`
              : `Cortex API error: ${response.status}`;
          const err = new Error(errMsg);
          (err as Record<string, unknown>).status = response.status;
          throw err;
        }

        out.push({ json: { cortex: parsed ?? {} }, pairedItem });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};
