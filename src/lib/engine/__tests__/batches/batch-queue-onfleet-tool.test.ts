import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.onfleetTool";

let fetchCalls: Array<{ url: string; method: string; body?: string }> = [];

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Map(),
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function installFetch(responses: Array<ReturnType<typeof mockResponse>>) {
  const queue = [...responses];
  fetchCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return queue.shift() ?? mockResponse({});
  }));
}

async function runNodeTest(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  continueOnFail = false,
) {
  const node = makeNode({ name: "Onfleet Tool", type: TYPE, parameters });
  const items: INodeExecutionData[] = inputItems.map((i) => ({ json: i }));
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
  };
  const ctx = createExecutionContext({
    node,
    workflow: workflow as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async () => ({ apiKey: "test-key-123" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  return executor(ctx, node);
}

describe("Onfleet Tool node", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("executor is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("description is registered", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc?.name).toBe(TYPE);
    expect(desc?.displayName).toBe("Onfleet (AI Tool)");
    expect(desc?.credentials).toContainEqual({ name: "onfleetApi", required: true });
  });

  it("Create a task via AI agent tool", async () => {
    installFetch([mockResponse({
      id: "task-1",
      shortId: "t1",
      trackingURL: "https://onfleet.com/track/t1",
      state: 1,
      destination: { id: "dest-1" },
      recipients: [{ id: "rec-1", name: "Blas Silkovich" }],
    })]);
    const out = await runNodeTest({
      resource: "Task",
      operation: "Create",
      destination: { address: { unparsed: "2829 Vallejo St, SF, CA, USA" } },
      recipients: [{ name: "Blas Silkovich", phone: "650-555-4481" }],
      notes: "Test delivery",
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("task-1");
    expect(out[0][0].json.shortId).toBe("t1");
    expect(out[0][0].json.trackingURL).toBe("https://onfleet.com/track/t1");
    expect(typeof out[0][0].json.state).toBe("number");
    expect(out[0][0].json.destination).toBeDefined();
  });

  it("GetAll tasks with date filter", async () => {
    installFetch([mockResponse({
      tasks: [
        { id: "t1", state: 2, timeCreated: 1700001000000 },
        { id: "t2", state: 1, timeCreated: 1700050000000 },
      ],
    })]);
    const out = await runNodeTest({
      resource: "Task",
      operation: "GetAll",
      filters: { from: 1700000000000, to: 1700100000000 },
      from: 1700000000000,
      to: 1700100000000,
    });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("t1");
    expect(out[0][1].json.id).toBe("t2");
    expect(typeof out[0][0].json.state).toBe("number");
    expect(typeof out[0][0].json.timeCreated).toBe("number");
    expect(fetchCalls[0].url).toContain("from=1700000000000");
    expect(fetchCalls[0].url).toContain("to=1700100000000");
  });

  it("Error on missing required parameters (Recipient Create without name/phone)", async () => {
    await expect(
      runNodeTest({ resource: "Recipient", operation: "Create" }),
    ).rejects.toThrow("Onfleet: name and phone are required");
  });

  it("Error on missing required parameters with continueOnFail", async () => {
    const out = await runNodeTest(
      { resource: "Recipient", operation: "Create" },
      [{}],
      true,
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("name and phone are required");
  });
});
