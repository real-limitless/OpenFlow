import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleFirebaseCloudFirestore";
const CREDS = { googleFirebaseCloudFirestoreOAuth2Api: { accessToken: "tok_firestore" } };

const DOC_NAME = "projects/my-project/databases/(default)/documents/messages/doc1";
const DOC_BODY = {
  name: DOC_NAME,
  fields: { title: { stringValue: "Hello" }, count: { integerValue: 42 } },
  createTime: "2026-01-01T00:00:00Z",
  updateTime: "2026-01-01T00:00:00Z",
};

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: new Map(),
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

type Handler = (url: string, method: string, body?: unknown) => ReturnType<typeof mockResponse>;
let handler: Handler;

function installFetch(h: Handler) {
  handler = h;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    let body: unknown;
    if (init?.body && typeof init.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    return handler(String(url), init?.method ?? "GET", body);
  }));
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
    credentials: { googleFirebaseCloudFirestoreOAuth2Api: { name: "googleFirebaseCloudFirestoreOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
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

describe("googleFirebaseCloudFirestore executor", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("creates a document (simple output)", async () => {
    installFetch((url, method, body) => {
      if (method === "PATCH" && url.includes("doc1")) {
        return mockResponse(DOC_BODY);
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "document",
      operation: "create",
      projectId: "my-project",
      database: "(default)",
      collection: "messages",
      documentId: "doc1",
      columns: JSON.stringify({ title: "Hello", count: 42 }),
      simple: true,
    }, [{}]);
    expect(out[0][0].json).toMatchObject({
      _id: "doc1",
      _name: DOC_NAME,
      _createTime: "2026-01-01T00:00:00Z",
      _updateTime: "2026-01-01T00:00:00Z",
    });
  });

  it("gets a document by ID (simple output)", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("doc1")) {
        return mockResponse(DOC_BODY);
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "document",
      operation: "get",
      projectId: "my-project",
      collection: "messages",
      documentId: "doc1",
      simple: true,
    }, [{}]);
    expect(out[0][0].json).toMatchObject({
      _id: "doc1",
      _name: DOC_NAME,
    });
  });

  it("deletes a document", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("doc1")) {
        return mockResponse({});
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "document",
      operation: "delete",
      projectId: "my-project",
      collection: "messages",
      documentId: "doc1",
    }, [{}]);
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("queries documents (simple output)", async () => {
    let queryUrl = "";
    installFetch((url, method) => {
      if (method === "POST" && url.includes("runQuery")) {
        queryUrl = url;
        return mockResponse([
          { document: DOC_BODY },
        ]);
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "document",
      operation: "query",
      projectId: "my-project",
      query: JSON.stringify({ structuredQuery: { from: [{ collectionId: "messages" }], limit: 10 } }),
      simple: true,
    }, [{}]);
    expect(queryUrl).toContain("/documents:runQuery");
    const results = out[0][0].json as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(results)).toBe(true);
    expect(results[0]).toMatchObject({ _id: "doc1", _name: DOC_NAME });
  });

  it("lists root collections", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("listCollectionIds")) {
        return mockResponse({ collectionIds: ["messages", "users"] });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "collection",
      operation: "getAll",
      projectId: "my-project",
      returnAll: true,
    }, [{}]);
    const results = out[0][0].json as unknown as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ name: expect.stringContaining("messages") });
  });

  it("throws on missing projectId", async () => {
    await expect(
      run({
        resource: "document",
        operation: "create",
        collection: "messages",
      }, [{}]),
    ).rejects.toThrow("Project ID is required");
  });

  it("continueOnFail emits error item", async () => {
    installFetch(() => mockResponse({ error: { message: "permission denied" } }, 403));
    const out = await run({
      resource: "document",
      operation: "get",
      projectId: "my-project",
      collection: "messages",
      documentId: "doc1",
    }, [{}], { continueOnFail: true });
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("permission denied") });
  });
});
