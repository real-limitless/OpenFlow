import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const OCR_API = "https://api.mistral.ai/v1/ocr";

interface MistralPage {
  index: number;
  markdown: string;
  images?: Array<{
    id: string;
    top_left_x: number;
    top_left_y: number;
    bottom_right_x: number;
    bottom_right_y: number;
    image_base64: string;
  }>;
  dimensions?: { dpi: number; height: number; width: number };
}

interface MistralOcrResponse {
  model?: string;
  pages?: MistralPage[];
  usage_info?: { pages_processed: number; doc_size_bytes: number | null };
}

export const mistralAiExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];
  const model = String(node.parameters.model ?? "mistral-ocr-latest");
  const documentType = String(node.parameters.documentType ?? "document");
  const inputType = String(node.parameters.inputType ?? "binary");
  const continueOnFail = ctx.continueOnFail();
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const batch = options.batch === true || options.batch === "true";
  const batchSize = Number(options.batchSize) || 50;
  const deleteFilesUnset = options.deleteFiles === undefined || options.deleteFiles === null;
  const deleteFiles = deleteFilesUnset ? batch : (options.deleteFiles === true || options.deleteFiles === "true");

  let apiKey: string | undefined;

  if (batch) {
    apiKey = await resolveApiKey(ctx);
    return processBatch(apiKey, model, documentType, inputType, batchSize, deleteFiles, items, continueOnFail, node.parameters);
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const documentPayload = buildDocumentPayload(inputType, documentType, item, node);
      if (!apiKey) apiKey = await resolveApiKey(ctx);
      const result = await callMistralOcr(apiKey, model, documentPayload);
      const response = normalizeOcrResponse(result, model);
      out.push({
        json: { ...item.json, ...response },
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
  const type = apiDocumentType(documentType);
  const urlKey = type === "image_url" ? "image_url" : "document_url";
  if (inputType === "url") {
    const url = String(node.parameters.url ?? "");
    if (!url) throw new Error("Mistral AI: URL is required when inputType is 'url'");
    return { type, [urlKey]: url };
  }

  const fieldName = String(node.parameters.inputBinaryField ?? node.parameters.binaryProperty ?? node.parameters.binaryPropertyName ?? "data");
  const binary = item.binary?.[fieldName];
  if (!binary) {
    throw new Error(`Mistral AI: No binary data found in property '${fieldName}'`);
  }
  const data = typeof binary.data === "string" ? binary.data : Buffer.from(binary.data).toString("base64");
  return { type, [urlKey]: `data:${binary.mimeType ?? "application/octet-stream"};base64,${data}` };
}

function apiDocumentType(docType: string): string {
  if (docType === "image") return "image_url";
  return "document_url";
}

async function uploadBinaryFile(
  apiKey: string,
  binary: { data: string; mimeType?: string; fileName?: string },
): Promise<string> {
  const raw = typeof binary.data === "string"
    ? new Uint8Array(Buffer.from(binary.data, "base64"))
    : new Uint8Array(binary.data);
  const blob = new Blob([raw], {
    type: binary.mimeType ?? "application/octet-stream",
  });
  const form = new FormData();
  form.append("purpose", "ocr");
  form.append("file", blob, binary.fileName ?? "document.bin");
  const resp = await fetch("https://api.mistral.ai/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Mistral AI: File upload failed (${resp.status}) — ${text}`);
  }
  const data = await resp.json();
  return String((data as Record<string, unknown>).id ?? "");
}

async function processBatch(
  apiKey: string,
  model: string,
  documentType: string,
  inputType: string,
  batchSize: number,
  deleteFiles: boolean,
  items: INodeExecutionData[],
  continueOnFail: boolean,
  nodeParams?: Record<string, unknown>,
): Promise<INodeExecutionData[][]> {
  const uploadedFileIds: string[] = [];
  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const documents: Array<Record<string, unknown>> = [];

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      if (inputType === "binary") {
        const fieldName = String(nodeParams?.inputBinaryField ?? nodeParams?.binaryProperty ?? "data");
        const bin = item.binary?.[fieldName];
        if (bin) {
          const fileId = await uploadBinaryFile(apiKey, bin);
          uploadedFileIds.push(fileId);
          const type = apiDocumentType(documentType);
          documents.push({ type, id: fileId });
        } else {
          const payload = buildDocumentPayload(inputType, documentType, item, { parameters: nodeParams ?? {} });
          documents.push(payload);
        }
      } else {
        const payload = buildDocumentPayload(inputType, documentType, item, { parameters: nodeParams ?? {} });
        documents.push(payload);
      }
    }

    try {
      const result = await callMistralOcrBatch(apiKey, model, documents);
      const response = normalizeOcrResponse(result, model);
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const idx = i + j;
        const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
        out.push({
          json: { ...item.json, ...response },
          binary: item.binary,
          pairedItem,
        });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const idx = i + j;
        const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
        out.push({ json: { ...item.json, error: message }, binary: item.binary, pairedItem });
      }
    }
  }

  if (deleteFiles && uploadedFileIds.length > 0) {
    await deleteUploadedFiles(apiKey, uploadedFileIds);
  }

  return [out];
}

async function callMistralOcrBatch(
  apiKey: string,
  model: string,
  documents: Array<Record<string, unknown>>,
): Promise<MistralOcrResponse> {
  const resp = await fetch(OCR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, document: documents }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 401) throw new Error(`Mistral AI: Authentication failed (401) — ${text}`);
    if (resp.status === 429) throw new Error(`Mistral AI: Rate limit exceeded (429) — ${text}`);
    throw new Error(`Mistral AI: OCR API failed (${resp.status}) — ${text}`);
  }

  const data = await resp.json();
  return data as MistralOcrResponse;
}

async function deleteUploadedFiles(apiKey: string, fileIds: string[]): Promise<void> {
  for (const fileId of fileIds) {
    try {
      await fetch(`https://api.mistral.ai/v1/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch {
      // ignore per-file delete errors
    }
  }
}

async function callMistralOcr(
  apiKey: string,
  model: string,
  document: Record<string, unknown>,
): Promise<MistralOcrResponse> {
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
  return data as MistralOcrResponse;
}

function normalizeOcrResponse(raw: MistralOcrResponse, model: string): Record<string, unknown> {
  return {
    model: raw.model ?? model,
    pages: raw.pages ?? [],
    usage_info: raw.usage_info ?? { pages_processed: 0, doc_size_bytes: null },
  };
}
