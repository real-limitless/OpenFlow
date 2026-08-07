import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.lemlistTool";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { forEach() {}, get() { return "application/json"; }, entries() { return new Map(); } },
    async text() { return text; },
    async json() { return JSON.parse(text); },
  };
}

let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response = mockResponse({ data: [] })) {
  nextResponse = response;
  vi.stubGlobal("fetch", vi.fn(async () => nextResponse));
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
      id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

const CREDS = { lemlistApi: { apiKey: "test-api-key-abc" } };

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
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
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue lemlistTool — n8n-nodes-base.lemlistTool", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Lemlist (AI Tool)");
  });

  it("activity get many — paginated subset", async () => {
    installFetch(mockResponse({
      data: [
        { type: "emailsOpened", campaignId: "camp_1", leadId: "lead_1" },
        { type: "emailsClicked", campaignId: "camp_1", leadId: "lead_2" },
      ],
    }));
    const out = await run({ resource: "activity", operation: "getAll", limit: 2 }, [{}]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("type", "emailsOpened");
  });

  it("campaign get stats", async () => {
    installFetch(mockResponse({
      campaignId: "camp_xyz", sent: 100, opened: 45, clicked: 20, replied: 10,
    }));
    const out = await run(
      { resource: "campaign", operation: "getStats", campaignId: "camp_xyz" },
      [{ json: { campaignId: "camp_xyz" } }],
    );
    expect(out[0][0].json).toHaveProperty("sent", 100);
    expect(out[0][0].json).toHaveProperty("opened", 45);
  });

  it("lead create", async () => {
    installFetch(mockResponse({ _id: "lead_new", email: "prospect@example.com", campaignId: "camp_1" }));
    const out = await run(
      { resource: "lead", operation: "create", campaignId: "camp_1", email: "prospect@example.com" },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("_id");
    expect(out[0][0].json).toHaveProperty("email", "prospect@example.com");
  });

  it("lead get", async () => {
    installFetch(mockResponse({ email: "test@example.com", firstName: "John" }));
    const out = await run(
      { resource: "lead", operation: "get", email: "test@example.com" },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("email", "test@example.com");
  });

  it("lead delete", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run(
      { resource: "lead", operation: "delete", campaignId: "camp_1", email: "test@example.com" },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("success", true);
  });

  it("enrichment enrich lead", async () => {
    installFetch(mockResponse({ leadId: "lead_123", phone: "+1234567890", email: "found@example.com" }));
    const out = await run(
      { resource: "enrichment", operation: "enrichLead", leadId: "lead_123", additionalFields: { findPhone: true, findEmail: true } },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("phone");
    expect(out[0][0].json).toHaveProperty("email");
  });

  it("team get credits", async () => {
    installFetch(mockResponse({ credits: 500, teamId: "team_1" }));
    const out = await run({ resource: "team", operation: "getCredits" }, [{}]);
    expect(out[0][0].json).toHaveProperty("credits", 500);
  });

  it("unsubscribe add", async () => {
    installFetch(mockResponse({ email: "unsub@example.com", addedAt: "2025-01-01" }));
    const out = await run(
      { resource: "unsubscribe", operation: "add", email: "unsub@example.com" },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("email", "unsub@example.com");
  });

  it("throws NodeOperationError for missing campaignId on lead create", async () => {
    await expect(
      run({ resource: "lead", operation: "create", email: "test@example.com", campaignId: "" }, [{ json: {} }]),
    ).rejects.toThrow(/campaignId/);
  });

  it("errors on continueOnFail for missing credential", async () => {
    const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "team", operation: "get" } });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
