import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.apiTemplateIo";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const headersMap = new Map<string, string>([["content-type", "application/json"]]);
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return headersMap.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return headersMap.entries();
      },
      forEach(fn: (v: string, k: string) => void) {
        headersMap.forEach((v, k) => fn(v, k));
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

function installFetch(response?: ReturnType<typeof mockResponse>) {
  nextResponse = response ?? mockResponse({ data: { email: "test@example.com", plan: "free", credits: 100 } });
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
  credentials?: Record<string, Record<string, unknown>>,
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
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
  });
  const ctx = makeCtx(
    toItems(inputItems),
    node,
    { apiTemplateIoApi: { apiKey: "test-key-123" } },
    opts?.continueOnFail ?? false,
  );
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue apiTemplateIo — n8n-nodes-base.apiTemplateIo", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("APITemplate.io");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.apiTemplateIo")).toBe(canonical);
  });

  it("account get returns account metadata", async () => {
    const body = { email: "test@example.com", plan: "free", credits: 100 };
    installFetch(mockResponse(body));
    const out = await run({ resource: "account", operation: "get" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.apiTemplateIo).toBeDefined();
    expect(out[0][0].json.apiTemplateIo).toMatchObject({
      email: "test@example.com",
      plan: "free",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/v2/account");
    expect(calls[0].headers["X-API-Key"]).toBe("test-key-123");
  });

  it("pdf create returns download_url and template_id", async () => {
    const body = { download_url: "https://apitemplate.io/dl/abc", url: "https://apitemplate.io/v/abc", template_id: "tmpl_abc123" };
    installFetch(mockResponse(body));
    const out = await run(
      {
        resource: "pdf",
        operation: "create",
        templateId: "tmpl_abc123",
        data: {},
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.apiTemplateIo).toBeDefined();
    expect(out[0][0].json.apiTemplateIo).toMatchObject({
      url: "https://apitemplate.io/dl/abc",
      download_url: "https://apitemplate.io/dl/abc",
      template_id: "tmpl_abc123",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/v2/render?template_id=tmpl_abc123");
  });

  it("image create returns url and template_id", async () => {
    const body = { url: "https://apitemplate.io/img/def", template_id: "tmpl_def456" };
    installFetch(mockResponse(body));
    const out = await run(
      {
        resource: "image",
        operation: "create",
        templateId: "tmpl_def456",
        data: {},
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.apiTemplateIo).toMatchObject({
      url: "https://apitemplate.io/img/def",
      template_id: "tmpl_def456",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/v2/render-image?template_id=tmpl_def456");
  });

  it("pdf create with data passes template variables", async () => {
    const body = { download_url: "https://apitemplate.io/dl/xyz", url: "https://apitemplate.io/v/xyz", template_id: "tmpl_abc123" };
    installFetch(mockResponse(body));
    const out = await run(
      {
        resource: "pdf",
        operation: "create",
        templateId: "tmpl_abc123",
        data: {
          name: "Alice",
          total: 49.99,
        },
      },
      [{ customerName: "Alice", orderTotal: 49.99 }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.apiTemplateIo).toMatchObject({
      template_id: "tmpl_abc123",
    });
    const parsedBody = JSON.parse(calls[0].body ?? "{}");
    expect(parsedBody.name).toBe("Alice");
    expect(parsedBody.total).toBe(49.99);
    expect(parsedBody.template_id).toBe("tmpl_abc123");
  });

  it("missing templateId throws validation error", async () => {
    await expect(
      run(
        {
          resource: "pdf",
          operation: "create",
        },
        [{}],
      ),
    ).rejects.toThrow(/templateId is required/);
  });

  it("auth failure throws error", async () => {
    installFetch(mockResponse({ error: "Unauthorized" }, 401));
    await expect(
      run({ resource: "account", operation: "get" }, [{}]),
    ).rejects.toThrow(/APITemplate\.io error/);
  });

  it("continueOnFail yields error item instead of throwing", async () => {
    installFetch(mockResponse({ error: "Unauthorized" }, 401));
    const out = await run(
      { resource: "account", operation: "get" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item input produces one output per item", async () => {
    const body = { download_url: "https://apitemplate.io/dl/multi", url: "https://apitemplate.io/v/multi", template_id: "tmpl_multi" };
    installFetch(mockResponse(body));
    const out = await run(
      {
        resource: "pdf",
        operation: "create",
        templateId: "tmpl_multi",
        data: {},
      },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("preserves original item fields in output", async () => {
    const body = { download_url: "https://apitemplate.io/dl/preserve", url: "https://apitemplate.io/v/preserve", template_id: "tmpl_pres" };
    installFetch(mockResponse(body));
    const out = await run(
      {
        resource: "pdf",
        operation: "create",
        templateId: "tmpl_pres",
        data: {},
      },
      [{ id: 42, name: "test" }],
    );
    expect(out[0][0].json.id).toBe(42);
    expect(out[0][0].json.name).toBe("test");
    expect(out[0][0].json.apiTemplateIo).toBeDefined();
  });
});
