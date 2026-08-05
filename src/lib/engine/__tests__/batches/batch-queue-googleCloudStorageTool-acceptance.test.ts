import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleCloudStorageTool";
const CREDS = { googleCloudStorageOAuth2Api: { accessToken: "tok_gcs_tool" } };

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return text ? JSON.parse(text) : {};
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

function installFetch(h: Handler) {
  handler = h;
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
      return handler(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleCloudStorageOAuth2Api: { name: "googleCloudStorageOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
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

describe("googleCloudStorageTool executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("bucket create", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/b?")) {
        return mockResponse({
          name: "n8n-test-tool-bucket",
          kind: "storage#bucket",
          storageClass: "STANDARD",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "bucket",
      operation: "create",
      projectId: "={{ $json.projectId }}",
      name: "={{ $json.bucketName }}",
    }, [{ projectId: "my-project", bucketName: "n8n-test-tool-bucket" }]);

    expect(out[0][0].json).toMatchObject({
      name: "n8n-test-tool-bucket",
      kind: "storage#bucket",
    });
  });

  it("object list (getAll)", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/b/")) {
        return mockResponse({
          items: [
            { name: "file1.csv", kind: "storage#object" },
            { name: "file2.csv", kind: "storage#object" },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "object",
      operation: "getAll",
      bucketName: "={{ $json.bucket }}",
    }, [{ bucket: "my-tool-bucket" }]);

    const items = out[0][0].json.items as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    for (const item of items) {
      expect(item).toMatchObject({ kind: "storage#object" });
    }
  });

  it("object delete", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/o/test-file.csv")) {
        return mockResponse(null, 204);
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "object",
      operation: "delete",
      bucketName: "={{ $json.bucketName }}",
      objectName: "={{ $json.objectName }}",
    }, [{ bucketName: "my-tool-bucket", objectName: "test-file.csv" }]);

    expect(out[0][0].json).toMatchObject({
      bucketName: "my-tool-bucket",
      objectName: "test-file.csv",
    });
  });

  it("AI agent tool parameter population (bucket create with model-supplied params)", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/b?")) {
        return mockResponse({
          name: "ai-generated-bucket-name",
          kind: "storage#bucket",
          storageClass: "REGIONAL",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "bucket",
      operation: "create",
      name: "ai-generated-bucket-name",
      projectId: "my-gcp-project",
      bucketType: "regional",
    });

    expect(out[0][0].json).toMatchObject({
      name: "ai-generated-bucket-name",
    });
  });

  it("bucket get", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/b/my-bucket")) {
        return mockResponse({
          name: "my-bucket",
          kind: "storage#bucket",
          storageClass: "STANDARD",
          etag: "abc",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "bucket",
      operation: "get",
      name: "my-bucket",
    });

    expect(out[0][0].json).toMatchObject({
      name: "my-bucket",
      kind: "storage#bucket",
    });
  });

  it("continueOnFail returns error json", async () => {
    installFetch(() => mockResponse({ error: { message: "Not Found" } }, 404));
    const out = await run(
      {
        resource: "bucket",
        operation: "get",
        name: "nonexistent",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("Not Found") });
  });
});
