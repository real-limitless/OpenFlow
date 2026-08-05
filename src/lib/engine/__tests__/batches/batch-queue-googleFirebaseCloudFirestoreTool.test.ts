import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleFirebaseCloudFirestoreTool";

const CREDS = { googleFirebaseCloudFirestoreOAuth2Api: { accessToken: "tok_firestore" } };

interface MockResponseInit {
  status?: number;
  contentType?: string;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      forEach(fn: (v: string, k: string) => void) { map.forEach((v, k) => fn(v, k)); },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
}

let calls: FetchCall[];

function installFetch(response: ReturnType<typeof mockResponse>) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return response;
  }));
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: {
    continueOnFail?: boolean;
    credentials?: Record<string, Record<string, unknown>>;
  },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch(mockResponse({ name: "projects/p/databases/d/documents/c/doc1", createTime: "t1", updateTime: "t2" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue googleFirebaseCloudFirestoreTool — n8n-nodes-base.googleFirebaseCloudFirestoreTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Firebase Cloud Firestore (AI Tool)");
  });

  it("creates a document (simple output)", async () => {
    const out = await run({
      resource: "document",
      operation: "create",
      projectId: "my-project",
      collection: "users",
      columns: '{"name":"Alice"}',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/projects/my-project/databases/(default)/documents/users");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      _id: "doc1",
      _name: "projects/p/databases/d/documents/c/doc1",
    });
  });

  it("gets a document (simple output)", async () => {
    const out = await run({
      resource: "document",
      operation: "get",
      projectId: "my-project",
      collection: "users",
      documentId: "doc1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/documents/users/doc1");
    expect(out[0][0].json).toMatchObject({ _id: "doc1" });
  });

  it("deletes a document", async () => {
    installFetch(mockResponse({}));
    const out = await run({
      resource: "document",
      operation: "delete",
      projectId: "my-project",
      collection: "users",
      documentId: "doc1",
    });

    expect(out[0][0].json).toEqual({ success: true });
  });

  it("lists collections (getAll)", async () => {
    installFetch(mockResponse({ collectionIds: ["users", "posts"] }));
    const out = await run({
      resource: "collection",
      operation: "getAll",
      projectId: "my-project",
      returnAll: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain(":listCollectionIds");
    expect(out[0][0].json).toEqual([
      { name: "projects/my-project/databases/(default)/documents/users" },
      { name: "projects/my-project/databases/(default)/documents/posts" },
    ]);
  });

  it("runs without credentials if projectId is provided (no auth header)", async () => {
    const out = await run(
      { resource: "document", operation: "create", projectId: "p", collection: "c", columns: '{"name":"x"}' },
      [{}],
      { credentials: {} },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json._id).toBeDefined();
  });

  it("continueOnFail emits error item", async () => {
    installFetch(mockResponse({ error: { message: "Not found" } }, { status: 404 }));
    const out = await run(
      { resource: "document", operation: "get", projectId: "p", collection: "c", documentId: "x" },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
