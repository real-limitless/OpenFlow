import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.n8n";

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
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({})) {
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

const CREDS = { n8nApi: { baseUrl: "https://test.app.n8n.cloud/api/v1", apiKey: "n8n_api_key_abc123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue n8n — n8n-nodes-base.n8n", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("n8n");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.n8n")).toBe(canonical);
  });

  it("credential: create", async () => {
    const created = { id: "cred-1", name: "My GitHub Credential", type: "githubApi", createdAt: "2025-01-01T00:00:00Z" };
    installFetch(mockResponse(created));
    const out = await run({
      resource: "credential",
      operation: "create",
      name: "My GitHub Credential",
      credentialType: "githubApi",
      data: '{"accessToken": "ghp_abc123"}',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://test.app.n8n.cloud/api/v1/credentials");
    expect(calls[0].headers["X-N8N-API-KEY"]).toBe("n8n_api_key_abc123");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.name).toBe("My GitHub Credential");
    expect(sentBody.type).toBe("githubApi");
    expect(sentBody.data).toEqual({ accessToken: "ghp_abc123" });
    expect(out[0][0].json).toEqual(created);
  });

  it("execution: getAll with status filter", async () => {
    const executions = {
      data: [
        { id: "exec-1", status: "error", workflowId: "wf-1", startedAt: "2025-01-01T00:00:00Z", stoppedAt: "2025-01-01T01:00:00Z" },
        { id: "exec-2", status: "error", workflowId: "wf-2", startedAt: "2025-01-02T00:00:00Z", stoppedAt: "2025-01-02T01:00:00Z" },
      ],
      nextCursor: "cursor-abc",
    };
    installFetch(mockResponse(executions));
    const out = await run({
      resource: "execution",
      operation: "getAll",
      returnAll: false,
      limit: 10,
      filters: { status: "error" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("executions?");
    expect(calls[0].url).toContain("limit=10");
    expect(calls[0].url).toContain("status=error");
    expect(out[0][0].json).toEqual(executions);
  });

  it("workflow: lifecycle (create → activate → deactivate → delete)", async () => {
    const createdWf = { id: "wf-1", name: "Test Workflow", active: false, nodes: [], connections: {}, settings: {} };
    installFetch(mockResponse(createdWf));
    const out1 = await run({
      resource: "workflow",
      operation: "create",
      workflowObject: '{"name": "Test Workflow", "nodes": [], "connections": {}, "settings": {}}',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/workflows");
    expect(out1[0][0].json.id).toBe("wf-1");
    expect(out1[0][0].json.active).toBe(false);

    const activatedWf = { id: "wf-1", name: "Test Workflow", active: true };
    nextResponse = mockResponse(activatedWf);
    const out2 = await run({
      resource: "workflow",
      operation: "activate",
      workflow: { mode: "byId", value: "wf-1" },
    }, [{ json: { id: "wf-1" } }]);
    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe("POST");
    expect(calls[1].url).toContain("/workflows/wf-1/activate");
    expect(out2[0][0].json.active).toBe(true);

    const deactivatedWf = { id: "wf-1", name: "Test Workflow", active: false };
    nextResponse = mockResponse(deactivatedWf);
    const out3 = await run({
      resource: "workflow",
      operation: "deactivate",
      workflow: { mode: "byId", value: "wf-1" },
    }, [{ json: { id: "wf-1" } }]);
    expect(calls).toHaveLength(3);
    expect(calls[2].method).toBe("POST");
    expect(calls[2].url).toContain("/workflows/wf-1/deactivate");
    expect(out3[0][0].json.active).toBe(false);

    const deletedWf = { id: "wf-1", name: "Test Workflow", active: false };
    nextResponse = mockResponse(deletedWf);
    const out4 = await run({
      resource: "workflow",
      operation: "delete",
      workflow: { mode: "byId", value: "wf-1" },
    }, [{ json: { id: "wf-1" } }]);
    expect(calls).toHaveLength(4);
    expect(calls[3].method).toBe("DELETE");
    expect(calls[3].url).toContain("/workflows/wf-1");
    expect(out4[0][0].json.id).toBe("wf-1");
  });

  it("audit: generate", async () => {
    const auditReport = { credentials: { dangling: [] }, nodes: { unused: [] }, instance: { config: {} } };
    installFetch(mockResponse(auditReport));
    const out = await run({
      resource: "audit",
      operation: "generate",
      categories: ["credentials", "nodes", "instance"],
      daysAbandonedWorkflow: 60,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/audit/generate");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.categories).toEqual(["credentials", "nodes", "instance"]);
    expect(sentBody.daysAbandonedWorkflow).toBe(60);
    expect(out[0][0].json).toEqual(auditReport);
  });

  it("continueOnFail produces error item", async () => {
    installFetch(mockResponse({ message: "Execution not found" }, { status: 404 }));
    const out = await run(
      {
        resource: "execution",
        operation: "delete",
        executionId: "nonexistent-id",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(calls).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toHaveProperty("message");
    expect(out[0][0].json.error).toHaveProperty("statusCode");
    expect(out[0][0].json.error.statusCode).toBe(404);
  });
});