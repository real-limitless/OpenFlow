import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { getExecutor } from "@/lib/engine/node-runtime";

beforeAll(() => {
  seedBuiltinExecutors();
  seedBuiltinDescriptions();
});

const TYPE = "n8n-nodes-base.mistralAi";
const MISTRAL_CRED = { apiKey: "sk-test-key" };
const OCR_URL = "https://api.mistral.ai/v1/ocr";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

const FAKE_OCR_RESPONSE = {
  model: "mistral-ocr-latest",
  pages: [
    {
      index: 0,
      markdown: "# Hello\n\nExtracted text content.",
      images: [],
      dimensions: { dpi: 200, height: 2200, width: 1700 },
    },
  ],
  usage_info: { pages_processed: 1, doc_size_bytes: null },
};

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>> = { mistralCloudApi: MISTRAL_CRED },
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runNodeWithFetch(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = { mistralCloudApi: MISTRAL_CRED },
  continueOnFail = false,
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

let fetchCalls: Array<{ url: string; body?: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), body: typeof init?.body === "string" ? init.body : undefined });
      const key = String(url);
      if (!(key in routes)) {
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue mistralAi — n8n-nodes-base.mistralAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Mistral AI");
  });

  it("resolves the executor under the canonical type string", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(hasExecutor("nodes-base.mistralAi")).toBe(true);
  });

  it("throws when credential is missing", async () => {
    await expect(
      runNode(
        TYPE,
        {
          resource: "document",
          operation: "extractText",
          inputType: "url",
          url: "https://example.com/doc.pdf",
        },
        [{}],
      ),
    ).rejects.toThrow(/mistralCloudApi credential is not configured/);
  });

  it("throws when inputType is binary and no binary property matches", async () => {
    await expect(
      runNode(
        TYPE,
        {
          resource: "document",
          operation: "extractText",
          inputType: "binary",
          inputBinaryField: "data",
        },
        [{}],
      ),
    ).rejects.toThrow(/No binary data found in property 'data'/);
  });

  it("throws when inputType is binary with wrong property name", async () => {
    await expect(
      runNode(
        TYPE,
        {
          resource: "document",
          operation: "extractText",
          inputType: "binary",
          inputBinaryField: "nonexistent",
        },
        [{ json: {}, binary: { doc: { mimeType: "application/pdf", data: "pdfdata" } } }],
      ),
    ).rejects.toThrow(/No binary data found in property 'nonexistent'/);
  });

  it("throws when inputType is url and no url param is given", async () => {
    await expect(
      runNode(
        TYPE,
        {
          resource: "document",
          operation: "extractText",
          inputType: "url",
        },
        [{}],
      ),
    ).rejects.toThrow(/Mistral AI: URL is required when inputType is 'url'/);
  });

  it("preserves original json properties in output on error with continueOnFail", async () => {
    const out = await runNode(
      TYPE,
      {
        resource: "document",
        operation: "extractText",
        inputType: "binary",
        inputBinaryField: "data",
      },
      [{ json: { fileRef: "invoice" }, binary: {} }],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.fileRef).toBe("invoice");
    expect(out[0][0].json.error).toBeDefined();
    expect(out[0][0].json.error).toContain("No binary data found in property 'data'");
  });

  it("calls OCR API with binary data and returns normalized response", async () => {
    installFetch({ [OCR_URL]: FAKE_OCR_RESPONSE });
    const out = await runNodeWithFetch(
      {
        resource: "document",
        operation: "extractText",
        inputType: "binary",
        inputBinaryField: "file",
      },
      [{ json: {}, binary: { file: { mimeType: "application/pdf", data: "base64pdf" } } }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.pages).toBeDefined();
    expect(Array.isArray(json.pages)).toBe(true);
    expect(json.pages).toHaveLength(1);
    expect((json.pages as Array<Record<string, unknown>>)[0].markdown).toContain("Extracted text");
    expect(json.model).toBe("mistral-ocr-latest");
    expect(json.usage_info).toBeDefined();
  });

  it("calls OCR API with URL input and returns normalized response", async () => {
    installFetch({ [OCR_URL]: FAKE_OCR_RESPONSE });
    const out = await runNodeWithFetch(
      {
        resource: "document",
        operation: "extractText",
        inputType: "url",
        url: "https://arxiv.org/pdf/2201.04234",
      },
      [{}],
    );
    expect(out[0][0].json.pages).toBeDefined();
    expect(Array.isArray(out[0][0].json.pages)).toBe(true);
  });

  it("batch processing groups items into one API call (multi-doc batch OCR)", async () => {
    const filesApiUrl = "https://api.mistral.ai/v1/files";
    const allCalls: Array<{ url: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        allCalls.push({ url: String(url), body: typeof init?.body === "string" ? init.body : undefined });
        if (String(url) === filesApiUrl) {
          return mockJsonResponse({ id: "f-id" });
        }
        if (String(url) === OCR_URL) {
          return mockJsonResponse(FAKE_OCR_RESPONSE);
        }
        return mockJsonResponse(null, 404);
      }),
    );
    fetchCalls = [];
    const out = await runNodeWithFetch(
      {
        resource: "document",
        operation: "extractText",
        inputType: "binary",
        inputBinaryField: "file",
        options: { batch: true, batchSize: 50, deleteFiles: false },
      },
      [
        { json: {}, binary: { file: { mimeType: "application/pdf", data: "base64-1" } } },
        { json: {}, binary: { file: { mimeType: "application/pdf", data: "base64-2" } } },
      ],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.pages).toBeDefined();
    expect(out[0][1].json.pages).toBeDefined();
    // 2 file uploads + 1 OCR batch call
    const ocrCall = allCalls.find((c) => c.url === OCR_URL);
    expect(ocrCall).toBeDefined();
    const body = JSON.parse(ocrCall!.body ?? "{}");
    expect(Array.isArray(body.document)).toBe(true);
    expect(body.document).toHaveLength(2);
    // items reference uploaded file IDs
    expect(body.document[0].id).toBe("f-id");
    expect(body.document[1].id).toBe("f-id");
  });

  it("batch processing with deleteFiles=true sends DELETE requests after batch", async () => {
    const filesApiUrl = "https://api.mistral.ai/v1/files";
    const fileDeleteCalls: string[] = [];
    let fileUploaded = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr === filesApiUrl && init?.method === "POST") {
          fileUploaded = true;
          return mockJsonResponse({ id: "uploaded-file-1" });
        }
        if (urlStr.startsWith(`${filesApiUrl}/`)) {
          fileDeleteCalls.push(urlStr);
          return mockJsonResponse(null, 200);
        }
        if (urlStr === OCR_URL) {
          return mockJsonResponse(FAKE_OCR_RESPONSE);
        }
        return mockJsonResponse(null, 404);
      }),
    );
    fetchCalls = [];
    const out = await runNodeWithFetch(
      {
        resource: "document",
        operation: "extractText",
        inputType: "binary",
        inputBinaryField: "file",
        options: { batch: true, batchSize: 50, deleteFiles: true },
      },
      [
        { json: {}, binary: { file: { mimeType: "application/pdf", data: "base64-1" } } },
      ],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pages).toBeDefined();
    expect(fileUploaded).toBe(true);
    expect(fileDeleteCalls).toHaveLength(1);
    expect(fileDeleteCalls[0]).toBe(`${filesApiUrl}/uploaded-file-1`);
  });

  it("uses image_url key when documentType is image", async () => {
    let requestBody: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requestBody = typeof init?.body === "string" ? init.body : undefined;
        return mockJsonResponse(FAKE_OCR_RESPONSE);
      }),
    );
    fetchCalls = [];
    const out = await runNodeWithFetch(
      {
        resource: "document",
        operation: "extractText",
        inputType: "binary",
        inputBinaryField: "file",
        documentType: "image",
      },
      [{ json: {}, binary: { file: { mimeType: "image/png", data: "base64img" } } }],
    );
    expect(out[0][0].json.pages).toBeDefined();
    expect(requestBody).toBeDefined();
    const parsed = JSON.parse(requestBody!);
    expect(parsed.document.type).toBe("image_url");
    expect(parsed.document.image_url).toBeDefined();
    expect(parsed.document.document_url).toBeUndefined();
  });

  it("returns snake_case response keys (usage_info, pages_processed)", async () => {
    installFetch({
      [OCR_URL]: {
        model: "mistral-ocr-latest",
        pages: [{ index: 0, markdown: "test", images: [], dimensions: { dpi: 200, height: 2200, width: 1700 } }],
        usage_info: { pages_processed: 1, doc_size_bytes: null },
      },
    });
    const out = await runNodeWithFetch(
      {
        resource: "document",
        operation: "extractText",
        inputType: "binary",
        inputBinaryField: "file",
      },
      [{ json: {}, binary: { file: { mimeType: "application/pdf", data: "base64pdf" } } }],
    );
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.usage_info).toBeDefined();
    expect((json.usage_info as Record<string, unknown>).pages_processed).toBe(1);
    expect((json.usage_info as Record<string, unknown>).doc_size_bytes).toBeNull();
    expect((json as Record<string, unknown>).usageInfo).toBeUndefined();
  });

  it("continueOnFail with bad URL emits error item", async () => {
    installFetch({});
    const out = await runNodeWithFetch(
      {
        resource: "document",
        operation: "extractText",
        inputType: "url",
        url: "https://nonexistent.example/document.pdf",
        options: { continueOnFail: true },
      },
      [{}],
      { mistralCloudApi: MISTRAL_CRED },
      true,
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
    expect(out[0][0].json.error).toContain("404");
  });
});
