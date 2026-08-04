import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsTextract";

const MOCK_CRED = {
  region: "us-east-1",
  accessKeyId: "AKIA",
  secretAccessKey: "secret",
};

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        const map: Record<string, string> = {
          "content-type": "application/x-amz-json-1.1",
        };
        return map[name.toLowerCase()] ?? null;
      },
      forEach(cb: (v: string, k: string) => void) {
        cb("application/x-amz-json-1.1", "content-type");
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

function installFetch(response: ReturnType<typeof mockResponse>) {
  nextResponse = response;
  calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    const req = init ?? {};
    const hdrs: Record<string, string> = {};
    if (req.headers && typeof req.headers === "object" && !Array.isArray(req.headers)) {
      for (const [k, v] of Object.entries(req.headers as Record<string, string>)) {
        hdrs[k] = v;
      }
    }
    calls.push({
      url: typeof url === "string" ? url : url.toString(),
      method: req.method ?? "GET",
      headers: hdrs,
      body: req.body as string | undefined,
    });
    return nextResponse;
  };
  return () => { globalThis.fetch = orig; };
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCredCtx(
  items: INodeExecutionData[],
  node: INode,
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
    getCredential: async (name) => {
      if (name === "aws") return MOCK_CRED;
      return null;
    },
  });
}

async function runTextract(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCredCtx(items, node, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch(mockResponse({
    documentMetadata: { pages: 1 },
    expenseDocuments: [
      {
        expenseIndex: 0,
        summaryFields: [
          {
            type: { text: "TOTAL" },
            labelDetection: { text: "Total" },
            valueDetection: { text: "$42.50" },
            currency: { code: "USD" },
          },
        ],
        lineItemGroups: [
          {
            lineItemGroupIndex: 0,
            lineItems: [
              {
                lineItemExpenseFields: [
                  { type: { text: "ITEM" }, valueDetection: { text: "Widget" } },
                  { type: { text: "PRICE" }, valueDetection: { text: "$42.50" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  }));
});

afterEach(() => {
  vi.restoreAllMudules?.();
});

function assertFetchHasSigHeaders() {
  expect(calls).toHaveLength(1);
  const hdrs = calls[0].headers;
  expect(hdrs["x-amz-date"]).toBeDefined();
  expect(hdrs["authorization"]).toBeDefined();
  expect(hdrs["authorization"]).toMatch(/^AWS4-HMAC-SHA256 /);
  expect(hdrs["x-amz-content-sha256"]).toBeDefined();
}

describe("awsTextract", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.displayName).toBe("AWS Textract");
  });

  it("analyzes expense from binary input", async () => {
    const [out] = await runTextract(
      {
        documentType: "binary",
        binaryPropertyName: "data",
        region: "us-east-1",
      },
      [
        {
          json: { fileName: "receipt.jpg" },
          binary: {
            data: {
              mimeType: "image/jpeg",
              data: "/9j/4AAQSkZJRg==",
            },
          },
        },
      ],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.documentMetadata).toEqual({ pages: 1 });
    expect(out[0].json.expenseDocuments).toHaveLength(1);
    expect(out[0].json.expenseDocuments[0].expenseIndex).toBe(0);
    expect(out[0].json.expenseDocuments[0].summaryFields[0].type.text).toBe("TOTAL");

    assertFetchHasSigHeaders();
    const body = JSON.parse(calls[0].body!);
    expect(body.Document.Bytes).toBe("/9j/4AAQSkZJRg==");
    expect(body.Document.S3Object).toBeUndefined();
  });

  it("analyzes expense from S3 object input", async () => {
    const [out] = await runTextract(
      {
        documentType: "s3Object",
        bucketName: "my-invoice-bucket",
        keyName: "invoices/2024-01.pdf",
        version: "v1",
        region: "eu-west-1",
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.documentMetadata.pages).toBe(1);

    assertFetchHasSigHeaders();
    const body = JSON.parse(calls[0].body!);
    expect(body.Document.S3Object.Bucket).toBe("my-invoice-bucket");
    expect(body.Document.S3Object.Name).toBe("invoices/2024-01.pdf");
    expect(body.Document.S3Object.Version).toBe("v1");
    expect(body.Document.Bytes).toBeUndefined();
  });

  it("throws on missing binary data", async () => {
    await expect(
      runTextract(
        {
          documentType: "binary",
          binaryPropertyName: "data",
          region: "us-east-1",
        },
        [{ json: {}, binary: {} }],
      ),
    ).rejects.toThrow(/binary property "data" not found/);
  });

  it("outputs error item on continueOnFail", async () => {
    const [out] = await runTextract(
      {
        documentType: "binary",
        binaryPropertyName: "data",
        region: "us-east-1",
      },
      [{ json: {}, binary: {} }],
      true,
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.error).toBeDefined();
    expect(String(out[0].json.error)).toContain("binary property");
  });

  it("throws on S3 object with missing bucketName", async () => {
    await expect(
      runTextract(
        {
          documentType: "s3Object",
          bucketName: "",
          keyName: "file.pdf",
          region: "us-east-1",
        },
        [{}],
      ),
    ).rejects.toThrow(/bucketName and keyName are required/);
  });

  it("includes x-amz-security-token when sessionToken credential is present", async () => {
    const MOCK_CRED_WITH_SESSION: Record<string, string> = {
      region: "us-east-1",
      accessKeyId: "AKIA",
      secretAccessKey: "secret",
      sessionToken: "IQoJb3JpZ2luX2VjEPz",
    };

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { documentType: "binary", binaryPropertyName: "data", region: "us-east-1" },
    });
    const items = toItems([
      { json: {}, binary: { data: { mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg==" } } },
    ]);
    const ctx = makeCredCtx(items, node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue(MOCK_CRED_WITH_SESSION);

    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);

    assertFetchHasSigHeaders();
    expect(calls[0].headers["x-amz-security-token"]).toBe("IQoJb3JpZ2luX2VjEPz");
  });

  it("uses region override", async () => {
    await runTextract(
      {
        documentType: "binary",
        binaryPropertyName: "data",
        region: "eu-central-1",
      },
      [
        {
          json: {},
          binary: { data: { mimeType: "image/png", data: "aaBbCc==" } },
        },
      ],
    );

    assertFetchHasSigHeaders();
    expect(calls[0].url).toContain("textract.eu-central-1.amazonaws.com");
  });

  it("evaluates expression params per item", async () => {
    const [out] = await runTextract(
      {
        documentType: "s3Object",
        bucketName: "={{ $json.bucket }}",
        keyName: "={{ $json.key }}",
        region: "us-east-1",
      },
      [{ json: { bucket: "my-bucket", key: "path/to/doc.pdf" } }],
    );

    expect(out).toHaveLength(1);
    assertFetchHasSigHeaders();
    const body = JSON.parse(calls[0].body!);
    expect(body.Document.S3Object.Bucket).toBe("my-bucket");
    expect(body.Document.S3Object.Name).toBe("path/to/doc.pdf");
  });
});
