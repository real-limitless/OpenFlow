import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const OCR_API = "https://api.mistral.ai/v1/ocr";

export const mistralAiExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];
  const model = String(node.parameters.model ?? "mistral-ocr-latest");
  const documentType = String(node.parameters.documentType ?? "document_url");
  const inputType = String(node.parameters.inputType ?? "binary");
  const continueOnFail = ctx.continueOnFail();
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const batch = options.batch === true || options.batch === "true";
  const batchSize = Number(options.batchSize) || 10;
  const deleteFiles = options.deleteFiles === true || options.deleteFiles === "true";

  let apiKey: string | undefined;

  if (batch) {
    apiKey = await resolveApiKey(ctx);
    return processBatch(apiKey, model, documentType, inputType, batchSize, deleteFiles, items, continueOnFail);
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const documentPayload = buildDocumentPayload(inputType, documentType, item, node);
      if (!apiKey) apiKey = await resolveApiKey(ctx);
      const result = await callMistralOcr(apiKey, model, documentPayload);
      const extracted = extractOcrResult(result);
      out.push({
        json: { ...item.json, extractedText: extracted },
        binary: item.binary,
        pairedItem,
      });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...item.json, error: message }, binary: item.binary, pairedItem });
    }
  }

  return [out];
};

async function resolveApiKey(ctx: { getCredential(name: string): Promise<unknown> }): Promise<string> {
  const cred = await ctx.getCredential("mistralCloudApi");
  const apiKey = cred ? String((cred as Record<string, unknown>).apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("Mistral AI: mistralCloudApi credential is not configured");
  }
  return apiKey;
}

function buildDocumentPayload(
  inputType: string,
  documentType: string,
  item: INodeExecutionData,
  node: { parameters: Record<string, unknown> },
): Record<string, unknown> {
  if (inputType === "url") {
    const url = String(node.parameters.url ?? "");
    if (!url) throw new Error("Mistral AI: URL is required when inputType is 'url'");
    return { type: documentType, documentUrl: url };
  }

  const binaryProperty = String(node.parameters.binaryProperty ?? "data");
  const binary = item.binary?.[binaryProperty];
  if (!binary) {
    throw new Error(`Mistral AI: No binary data found in property '${binaryProperty}'`);
  }
  const data = typeof binary.data === "string" ? binary.data : Buffer.from(binary.data).toString("base64");
  return { type: documentType === "image_url" ? "image_url" : "document_url", documentUrl: `data:${binary.mimeType ?? "application/octet-stream"};base64,${data}` };
}

async function processBatch(
  apiKey: string,
  model: string,
  _documentType: string,
  _inputType: string,
  _batchSize: number,
  _deleteFiles: boolean,
  items: INodeExecutionData[],
  continueOnFail: boolean,
): Promise<INodeExecutionData[][]> {
  const out: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      out.push({
        json: { ...item.json, extractedText: "[batch processing - TODO]" },
        binary: item.binary,
        pairedItem,
      });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...item.json, error: message }, binary: item.binary, pairedItem });
    }
  }

  return [out];
}

async function callMistralOcr(
  apiKey: string,
  model: string,
  document: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resp = await fetch(OCR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, document }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 401) throw new Error(`Mistral AI: Authentication failed (401) — ${text}`);
    if (resp.status === 429) throw new Error(`Mistral AI: Rate limit exceeded (429) — ${text}`);
    throw new Error(`Mistral AI: OCR API failed (${resp.status}) — ${text}`);
  }

  const data = await resp.json();
  return data as Record<string, unknown>;
}

function extractOcrResult(response: Record<string, unknown>): string {
  if (typeof response.text === "string") return response.text;
  if (response.pages && Array.isArray(response.pages)) {
    return response.pages.map((p: unknown) => {
      if (p && typeof p === "object") return String((p as Record<string, unknown>).text ?? "");
      return String(p);
    }).filter(Boolean).join("\n");
  }
  return JSON.stringify(response);
}
