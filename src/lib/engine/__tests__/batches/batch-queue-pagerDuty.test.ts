import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.pagerDuty";
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
  const node = makeNode({ name: "PagerDuty", type: TYPE, parameters });
  const input: INodeExecutionData[] = inputItems.map((i) => ({ json: i as Record<string, unknown> }));
  const ctx = makeCtx(input, node, opts?.continueOnFail ?? false, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe("pagerDuty registration", () => {
  it("should have executor registered", () => {
    assertRegistered();
  });
});

// ---------------------------------------------------------------------------
// Create incident
// ---------------------------------------------------------------------------

describe("pagerDuty create incident", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      mockResponse({
        incident: {
          id: "INC123",
          type: "incident",
          title: "Test Incident",
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
        title: "Test Incident",
        serviceId: "SVC123",
        email: "test@example.com",
        authentication: "apiToken",
      },
      [{ title: "", serviceId: "" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("INC123");
    expect(out[0][0].json.title).toBe("Test Incident");
    expect(out[0][0].json.status).toBe("triggered");
  });

  it("should include additionalFields in request body", async () => {
    await runNode(
      {
        resource: "incident",
        operation: "create",
        title: "Incident with details",
        serviceId: "SVC123",
        email: "test@example.com",
        authentication: "apiToken",
        additionalFields: {
          details: "Automated test",
          urgency: "high",
        },
      },
    );
    expect(fetchMock).toHaveBeenCalled();
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body ?? "{}");
    expect(callBody.incident.title).toBe("Incident with details");
    expect(callBody.incident.body.details).toBe("Automated test");
    expect(callBody.incident.urgency).toBe("high");
  });

  it("should use From header with email", async () => {
    await runNode(
      {
        resource: "incident",
        operation: "create",
        title: "Test",
        serviceId: "SVC123",
        email: "operator@example.com",
        authentication: "apiToken",
      },
    );
    expect(fetchMock).toHaveBeenCalled();
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.From).toBe("operator@example.com");
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
          serviceId: "INVALID",
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
        serviceId: "INVALID",
        authentication: "apiToken",
      },
      undefined,
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Get incident
// ---------------------------------------------------------------------------

describe("pagerDuty get incident", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      mockResponse({
        incident: {
          id: "INC999",
          type: "incident",
          title: "Existing Incident",
          status: "acknowledged",
        },
      }),
    );
  });

  it("should get an incident by ID", async () => {
    const out = await runNode(
      {
        resource: "incident",
        operation: "get",
        incidentId: "INC999",
        authentication: "apiToken",
      },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("INC999");
    expect(out[0][0].json.title).toBe("Existing Incident");
    expect(out[0][0].json.status).toBe("acknowledged");
  });
});

// ---------------------------------------------------------------------------
// Update incident
// ---------------------------------------------------------------------------

describe("pagerDuty update incident", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      mockResponse({
        incident: {
          id: "INC456",
          type: "incident",
          title: "Updated Title",
          status: "resolved",
        },
      }),
    );
  });

  it("should update an incident", async () => {
    const out = await runNode(
      {
        resource: "incident",
        operation: "update",
        incidentId: "INC456",
        email: "test@example.com",
        authentication: "apiToken",
        updateFields: {
          title: "Updated Title",
          status: "resolved",
        },
      },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("Updated Title");
    expect(out[0][0].json.status).toBe("resolved");
  });
});

// ---------------------------------------------------------------------------
// GetAll incidents
// ---------------------------------------------------------------------------

describe("pagerDuty getAll incidents", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      mockResponse({
        incidents: [
          { id: "INC1", title: "Incident 1", status: "triggered" },
          { id: "INC2", title: "Incident 2", status: "acknowledged" },
        ],
      }),
    );
  });

  it("should return multiple incidents", async () => {
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
});

// ---------------------------------------------------------------------------
// Log Entry
// ---------------------------------------------------------------------------

describe("pagerDuty log entries", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      mockResponse({
        log_entries: [
          { id: "LE1", type: "log_entry", summary: "Incident created" },
        ],
      }),
    );
  });

  it("should return log entries", async () => {
    const out = await runNode(
      {
        resource: "logEntry",
        operation: "getAll",
        authentication: "apiToken",
      },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("LE1");
  });
});

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

describe("pagerDuty user operations", () => {
  it("should get a user by ID from item json", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        user: { id: "USER1", type: "user", name: "Alice", email: "alice@example.com" },
      }),
    );
    const out = await runNode(
      {
        resource: "user",
        operation: "get",
        authentication: "apiToken",
      },
      [{ userId: "USER1" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name).toBe("Alice");
  });

  it("should get all users", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        users: [
          { id: "U1", name: "Alice" },
          { id: "U2", name: "Bob" },
        ],
      }),
    );
    const out = await runNode(
      {
        resource: "user",
        operation: "getAll",
        authentication: "apiToken",
      },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.name).toBe("Alice");
  });
});
