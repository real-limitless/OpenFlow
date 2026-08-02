import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.toolHttpRequest";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "content-type") return ct;
        return null;
      },
      entries() {
        return new Map([["content-type", ct]]).entries();
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

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url: string, _init?: RequestInit) => {
    return mockResponse({ userId: 1, id: 1, title: "delectus aut autem", completed: false });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("batch-queue langchain-tool-http-request — @n8n/n8n-nodes-langchain.toolHttpRequest", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("HTTP Request Tool");
  });

  it("produces an ai_tool handle with the correct shape", async () => {
    const out = await runNode(
      TYPE,
      {
        method: "GET",
        url: "https://jsonplaceholder.typicode.com/todos/1",
        authentication: "none",
        inputs: [],
        outputs: ["ai_tool"],
      },
      [],
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const handle = out[0][0].json;
    expect(handle).toHaveProperty("name");
    expect(handle).toHaveProperty("description");
    expect(handle).toHaveProperty("inputSchema");
    expect(handle).toHaveProperty("invoke");
    expect(typeof handle.invoke).toBe("function");
  });

  it("tool invoke method makes the HTTP request and returns content", async () => {
    const out = await runNode(
      TYPE,
      {
        method: "GET",
        url: "https://jsonplaceholder.typicode.com/todos/1",
        authentication: "none",
        inputs: [],
        outputs: ["ai_tool"],
      },
      [],
    );

    const handle = out[0][0].json;
    const result = await handle.invoke({});
    expect(result.content).toContain("delectus aut autem");
    expect(result.isError).toBeUndefined();
  });

  it("tool invoke respects method and URL from args override", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "https://jsonplaceholder.typicode.com/posts" && init?.method === "POST") {
        return mockResponse({ id: 101, title: "foo", body: "bar", userId: 1 });
      }
      return mockResponse({});
    });

    const out = await runNode(
      TYPE,
      {
        method: "GET",
        url: "https://jsonplaceholder.typicode.com/todos/1",
        authentication: "none",
        inputs: [],
        outputs: ["ai_tool"],
      },
      [],
    );

    const handle = out[0][0].json;
    const result = await handle.invoke({
      url: "https://jsonplaceholder.typicode.com/posts",
      method: "POST",
      body: JSON.stringify({ title: "foo", body: "bar", userId: 1 }),
    });
    expect(result.content).toContain("101");
  });

  it("non-2xx response returns error when continueOnFail is set", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return mockResponse("Not Found", { status: 404, contentType: "text/plain" });
    });

    const out = await runNode(
      TYPE,
      {
        method: "GET",
        url: "https://jsonplaceholder.typicode.com/nonexistent",
        authentication: "none",
        continueOnFail: true,
        inputs: [],
        outputs: ["ai_tool"],
      },
      [],
      { continueOnFail: true },
    );

    const handle = out[0][0].json;
    const result = await handle.invoke({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("HTTP 404");
  });

  it("non-2xx response throws when continueOnFail is not set", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return mockResponse("Not Found", { status: 404, contentType: "text/plain" });
    });

    const out = await runNode(
      TYPE,
      {
        method: "GET",
        url: "https://jsonplaceholder.typicode.com/nonexistent",
        authentication: "none",
        inputs: [],
        outputs: ["ai_tool"],
      },
      [],
    );

    const handle = out[0][0].json;
    await expect(handle.invoke({})).rejects.toThrow(/HTTP Request failed/);
  });

  it("resolves the same executor under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
