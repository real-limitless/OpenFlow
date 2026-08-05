import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.pagerDutyTool";
const CREDS: Record<string, Record<string, unknown>> = {
  pagerDutyApi: { apiToken: "test-token-abc123" },
  pagerDutyOAuth2Api: { accessToken: "test-oauth-token" },
};

interface MockResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const map = new Map<string, string>([["content-type", "application/json"]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function assertRegistered() {
  expect(hasExecutor(TYPE)).toBe(true);
  expect(getExecutor(TYPE)).toBeDefined();
}

function runNode(
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
): Promise<INodeExecutionData[][]> {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({ name: "PagerDuty Tool", type: TYPE, parameters });
  const input: INodeExecutionData[] = inputItems.map((i) => ({ json: i as Record<string, unknown> }));
  const ctx = makeCtx(input, node, opts?.continueOnFail ?? false, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("pagerDutyTool registration", () => {
  it("should have executor registered", () => {
    assertRegistered();
  });
});

describe("pagerDutyTool create incident", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      mockResponse({
        incident: {
          id: "INC-PDT-001",
          type: "incident",
          title: "Database server down",
          status: "triggered",
        },
      }),
    );
  });

  it("should create an incident from parameters", async () => {
    const out = await runNode(
      {
        resource: "incident",
        operation: "create",
        title: "Database server down",
        serviceId: "SERVICE001",
        email: "agent@example.com",
        authentication: "apiToken",
      },
      [{ title: "", serviceId: "" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("INC-PDT-001");
    expect(out[0][0].json.title).toBe("Database server down");
    expect(out[0][0].json.status).toBe("triggered");
  });

  it("should propagate error on API failure", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ error: { message: "Invalid service ID" } }, { status: 400 }),
    );
    await expect(
      runNode(
        {
          resource: "incident",
          operation: "create",
          title: "Test",
          serviceId: "BAD",
          authentication: "apiToken",
        },
        undefined,
        { continueOnFail: false },
      ),
    ).rejects.toThrow(/PagerDuty/);
  });

  it("should emit error item when continueOnFail is true", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ error: { message: "Bad request" } }, { status: 400 }),
    );
    const out = await runNode(
      {
        resource: "incident",
        operation: "create",
        title: "Test",
        serviceId: "BAD",
        authentication: "apiToken",
      },
      undefined,
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
  });
});

describe("pagerDutyTool get incident", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      mockResponse({
        incident: {
          id: "INCIDENT001",
          title: "Production alert",
          status: "triggered",
        },
      }),
    );
  });

  it("should get an incident by ID", async () => {
    const out = await runNode(
      {
        resource: "incident",
        operation: "get",
        incidentId: "INCIDENT001",
        authentication: "apiToken",
      },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("INCIDENT001");
    expect(out[0][0].json.title).toBe("Production alert");
    expect(out[0][0].json.status).toBe("triggered");
  });
});

describe("pagerDutyTool getAll incidents", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      mockResponse({
        incidents: [
          { id: "INC1", title: "First", status: "triggered" },
          { id: "INC2", title: "Second", status: "acknowledged" },
        ],
      }),
    );
  });

  it("should return matching incidents", async () => {
    const out = await runNode(
      {
        resource: "incident",
        operation: "getAll",
        authentication: "apiToken",
      },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("INC1");
    expect(out[0][1].json.id).toBe("INC2");
  });

  it("should return empty array when none match", async () => {
    fetchMock.mockResolvedValue(mockResponse({ incidents: [] }));
    const out = await runNode(
      {
        resource: "incident",
        operation: "getAll",
        authentication: "apiToken",
      },
    );
    expect(out[0]).toHaveLength(0);
  });
});

describe("pagerDutyTool get user", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      mockResponse({
        user: { id: "USER001", name: "Alice", email: "alice@example.com" },
      }),
    );
  });

  it("should get a user by ID", async () => {
    const out = await runNode(
      {
        resource: "user",
        operation: "get",
        authentication: "apiToken",
      },
      [{ userId: "USER001" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name).toBe("Alice");
    expect(out[0][0].json.email).toBe("alice@example.com");
  });
});

describe("pagerDutyTool missing credential error", () => {
  it("should fail before API call when no credential is configured", async () => {
    await expect(
      runNode(
        {
          resource: "incident",
          operation: "get",
          authentication: "apiToken",
        },
        [{ incidentId: "INC001" }],
        { credentials: {} },
      ),
    ).rejects.toThrow(/PagerDuty/);
  });
});
