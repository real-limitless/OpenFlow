import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleCloudStorage";
const CREDS = { googleCloudStorageOAuth2Api: { accessToken: "tok_gcs" } };

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

type Handler = (
  url: string,
  method: string,
  body?: unknown,
) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;
let lastUrl: string;
let lastMethod: string;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  lastUrl = "";
  lastMethod = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      lastBody = body;
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      return handler(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean; binaryItems?: INodeExecutionData[] },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleCloudStorageOAuth2Api: { name: "googleCloudStorageOAuth2Api" } },
  });
  const items: INodeExecutionData[] = (opts?.binaryItems) ? opts.binaryItems : inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleCloudStorage executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("bucket create", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/b?")) {
        return mockResponse({
          kind: "storage#bucket",
          name: "n8n-test-bucket-42",
          id: "n8n-test-bucket-42",
          storageClass: "STANDARD",
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "bucket",
        operation: "create",
        projectId: "={{ $json.projectId }}",
        name: "={{ $json.bucketName }}",
      },
      [{ projectId: "my-project", bucketName: "n8n-test-bucket-42" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      kind: "storage#bucket",
      name: "n8n-test-bucket-42",
    });
    expect(lastUrl).toContain("project=my-project");
    expect((lastBody as Record<string, unknown>)?.name).toBe("n8n-test-bucket-42");
  });

  it("object list", async () => {
    installFetch((url, method) => {
      if (method === "GET" && (url.includes("/o?") || url.includes("/o"))) {
        return mockResponse({
          kind: "storage#objects",
          items: [
            { kind: "storage#object", name: "file1.csv", bucket: "my-bucket" },
            { kind: "storage#object", name: "file2.csv", bucket: "my-bucket" },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "object",
        operation: "getAll",
        bucketName: "={{ $json.bucket }}",
      },
      [{ bucket: "my-bucket" }],
    );

    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as Record<string, unknown>;
    expect(result.kind).toBe("storage#objects");
    const items = result.items as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items[0].kind).toBe("storage#object");
    expect(items[1].kind).toBe("storage#object");
  });

  it("object upload with binary data", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/upload/storage")) {
        return mockResponse({
          kind: "storage#object",
          name: "uploads/report.csv",
          bucket: "my-bucket",
          contentType: "text/csv",
          size: "27",
        });
      }
      return mockResponse({});
    });

    const binaryItems: INodeExecutionData[] = [
      {
        json: { bucket: "my-bucket", key: "uploads/report.csv" },
        binary: {
          file: {
            data: "bmFtZSxlbWFpbA0KQWxpY2UsYUBleGFtcGxlLmNvbQ==",
            mimeType: "text/csv",
            fileName: "report.csv",
          },
        },
      },
    ];

    const out = await run(
      {
        resource: "object",
        operation: "create",
        bucketName: "={{ $json.bucket }}",
        objectName: "={{ $json.key }}",
        binaryData: true,
        binaryPropertyName: "file",
      },
      [],
      { binaryItems },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      name: "uploads/report.csv",
      bucket: "my-bucket",
    });
  });

  it("bucket delete", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/b/")) {
        return mockResponse({ kind: "storage#bucket", name: "temp-bucket-to-delete" });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "bucket",
        operation: "delete",
        name: "={{ $json.bucketName }}",
      },
      [{ bucketName: "temp-bucket-to-delete" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.bucketName).toBe("temp-bucket-to-delete");
  });

  it("continue on fail", async () => {
    installFetch(() => mockResponse({ error: { message: "Bucket not found" } }, 404));

    const out = await run(
      {
        resource: "bucket",
        operation: "get",
        name: "nonexistent-bucket",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("Bucket not found") });
  });

  it("object get returns metadata", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/o/")) {
        return mockResponse({
          kind: "storage#object",
          name: "my-file.txt",
          bucket: "my-bucket",
          contentType: "text/plain",
          size: "1024",
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "object",
        operation: "get",
        bucketName: "my-bucket",
        objectName: "my-file.txt",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      kind: "storage#object",
      name: "my-file.txt",
      bucket: "my-bucket",
    });
  });
});