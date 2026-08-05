import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleFirebaseRealtimeDatabase";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
      forEach(fn: (v: string, k: string) => void) {
        map.forEach((v, k) => fn(v, k));
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

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(
  response: ReturnType<typeof mockResponse> = mockResponse({}),
) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return nextResponse;
    }),
  );
}

function uninstallFetch() {
  vi.unstubAllGlobals();
}

describe("batch-queue googleFirebaseRealtimeDatabase — n8n-nodes-base.googleFirebaseRealtimeDatabase", () => {
  beforeEach(() => {
    installFetch(mockResponse({ name: "Alice", age: 30 }));
  });

  afterEach(() => {
    uninstallFetch();
  });

  it("is registered as executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).name).toBe(TYPE);
  });

  it("create: PUTs data to the Firebase path", async () => {
    const out = await runNode(
      TYPE,
      {
        projectId: "my-firebase-project",
        operation: "create",
        path: "/users/user1",
        attributes: "name, age",
      },
      [{ json: { name: "Alice", age: 30 } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://my-firebase-project.firebaseio.com/users/user1.json");
    expect(JSON.parse(calls[0].body!)).toEqual({ name: "Alice", age: 30 });
    expect(out[0][0].json).toEqual({ name: "Alice", age: 30 });
  });

  it("get: GETs data from the Firebase path", async () => {
    installFetch(mockResponse({ name: "Alice", age: 30 }));

    const out = await runNode(
      TYPE,
      {
        projectId: "my-firebase-project",
        operation: "get",
        path: "/users/user1",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://my-firebase-project.firebaseio.com/users/user1.json");
    expect(out[0][0].json).toEqual({ name: "Alice", age: 30 });
  });

  it("delete: DELETEs the Firebase path", async () => {
    installFetch(mockResponse({ name: "Alice", age: 30 }));

    const out = await runNode(
      TYPE,
      {
        projectId: "my-firebase-project",
        operation: "delete",
        path: "/users/user1",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://my-firebase-project.firebaseio.com/users/user1.json");
    expect(out[0][0].json).toEqual({ name: "Alice", age: 30 });
  });

  it("push: POSTs data with auto-generated key", async () => {
    installFetch(mockResponse({ name: "-Nabcdef123" }));

    const out = await runNode(
      TYPE,
      {
        projectId: "my-firebase-project",
        operation: "push",
        path: "/scores",
        attributes: "name, score",
      },
      [{ json: { name: "Bob", score: 95 } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://my-firebase-project.firebaseio.com/scores.json");
    expect(JSON.parse(calls[0].body!)).toEqual({ name: "Bob", score: 95 });
    expect(out[0][0].json).toEqual({ name: "-Nabcdef123" });
  });

  it("update: PATCHes data to the Firebase path", async () => {
    installFetch(mockResponse({ age: 31 }));

    const out = await runNode(
      TYPE,
      {
        projectId: "my-firebase-project",
        operation: "update",
        path: "/users/user1",
        attributes: "age",
      },
      [{ json: { age: 31 } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe("https://my-firebase-project.firebaseio.com/users/user1.json");
    expect(JSON.parse(calls[0].body!)).toEqual({ age: 31 });
    expect(out[0][0].json).toEqual({ age: 31 });
  });

  it("throws when projectId is missing", async () => {
    await expect(
      runNode(TYPE, { operation: "get", path: "/users/user1" }, [{}]),
    ).rejects.toThrow("Project ID is required");
  });

  it("continueOnFail suppresses HTTP errors", async () => {
    installFetch(mockResponse({ error: { message: "Not found" } }, { status: 404 }));

    const out = await runNode(
      TYPE,
      {
        projectId: "my-firebase-project",
        operation: "get",
        path: "/users/nonexistent",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0][0].json).toHaveProperty("error");
  });
});
