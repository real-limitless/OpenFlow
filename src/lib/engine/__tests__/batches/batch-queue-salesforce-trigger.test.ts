import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture, runNodeWithCtx } from "../helpers";
import type { ExecutionContext } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.salesforceTrigger";

function pollItem(mode: string, overrides: Record<string, unknown> = {}) {
  return { pollTimes: { item: [{ mode, ...overrides }] } };
}

function makeMockFetch(
  records: Record<string, unknown>[],
  done = true,
): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const body = done
      ? { totalSize: records.length, done: true, records }
      : { totalSize: records.length, done: false, records, nextRecordsUrl: "/query/next" };
    return {
      status: 200,
      ok: true,
      headers: new Map(Object.entries({ "content-type": "application/json" })),
      async text() {
        return JSON.stringify(body);
      },
    };
  });
}

/** Run node with mocked Salesforce OAuth2 credential. */
async function runSalesforceNode(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [],
): Promise<{ out: INodeExecutionData[][]; ctx: ExecutionContext }> {
  const map = getExecutorMap();
  const executor = map[TYPE];
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  const node = makeNode({ name: "SF", type: TYPE, parameters });
  const normalized = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? item as INodeExecutionData
      : { json: item as Record<string, unknown> },
  );
  const ctx: ExecutionContext = {
    node,
    getInputItems: () => normalized,
    getParam: (name: string, defaultValue?: unknown) => {
      const v = (node.parameters as Record<string, unknown>)[name];
      return v !== undefined ? v : defaultValue;
    },
    getParams: () => node.parameters as Record<string, unknown>,
    getNode: () => node,
    getWorkflow: () => makeWorkflow([node]),
    continueOnFail: () => false,
    getCredential: async (_name: string) => ({
      accessToken: "mock-00D-token",
      instanceUrl: "https://test.salesforce.com",
    }),
    evaluate: (expr: string) => expr,
    getNodeInputItems: () => normalized,
    setCustomData: () => {},
    getCustomData: () => undefined,
    getAllCustomData: () => ({}),
  };
  const out = await executor(ctx, node);
  return { out, ctx };
}

describe("batch-queue salesforceTrigger — n8n-nodes-base.salesforceTrigger", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeMockFetch([]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Salesforce Trigger");
  });

  it("throws when credentials are missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      runNode(TYPE, { triggerOn: "contactCreated", ...pollItem("everyMinute") }, []),
    ).rejects.toThrow("Salesforce: salesforceOAuth2Api credential is not configured");
  });

  it("queries Contact and emits records with Id and attributes.type", async () => {
    const mockRecords = [
      { Id: "003A000001", Name: "Test Contact", attributes: { type: "Contact" } },
    ];
    const mockFetch = makeMockFetch(mockRecords);
    vi.stubGlobal("fetch", mockFetch);

    const { out, ctx } = await runSalesforceNode(
      { triggerOn: "contactCreated", ...pollItem("everyMinute") },
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.Id).toBe("003A000001");
    expect((out[0][0].json as Record<string, unknown>).attributes).toEqual({ type: "Contact" });

    const callUrl = String(mockFetch.mock.calls[0][0]);
    expect(callUrl).toContain("Contact");
    expect(callUrl).toContain("CreatedDate");

    expect(ctx.getCustomData).toBeDefined();
  });

  it("queries custom object MyCustomObject__c and emits records", async () => {
    const mockRecords = [
      { Id: "a00A000001", Name: "Custom", attributes: { type: "MyCustomObject__c" } },
    ];
    const mockFetch = makeMockFetch(mockRecords);
    vi.stubGlobal("fetch", mockFetch);

    const { out } = await runSalesforceNode(
      {
        triggerOn: "customObjectCreated",
        customObject: "MyCustomObject__c",
        ...pollItem("custom", { cronExpression: "0 */5 * * * *" }),
      },
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.Id).toBe("a00A000001");
    expect((out[0][0].json as Record<string, unknown>).attributes).toEqual({ type: "MyCustomObject__c" });
  });

  it("uses SystemModstamp cursor for updated events", async () => {
    const mockRecords = [
      { Id: "006A000001", Name: "Updated Opp", attributes: { type: "Opportunity" } },
    ];
    const mockFetch = makeMockFetch(mockRecords);
    vi.stubGlobal("fetch", mockFetch);

    const { out } = await runSalesforceNode(
      { triggerOn: "opportunityUpdated", ...pollItem("everyHour", { minute: 0 }) },
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.Id).toBe("006A000001");

    const callUrl = String(mockFetch.mock.calls[0][0]);
    expect(callUrl).toContain("Opportunity");
    expect(callUrl).toContain("SystemModstamp");
  });

  it("includes WHERE clause with lastPoll SOQL DateTime literal when _lastPollTimestamp is set", async () => {
    const mockRecords = [
      { Id: "003B000002", Name: "New Contact", attributes: { type: "Contact" } },
    ];
    const mockFetch = makeMockFetch(mockRecords);
    vi.stubGlobal("fetch", mockFetch);

    const priorTs = "2026-08-02T12:00:00Z";
    const map = getExecutorMap();
    const executor = map[TYPE];
    if (!executor) throw new Error(`No executor for ${TYPE}`);
    const node = makeNode({ name: "SF", type: TYPE, parameters: { triggerOn: "contactCreated", ...pollItem("everyMinute") } });
    const ctx: ExecutionContext = {
      node,
      getInputItems: () => [],
      getParam: (name: string, defaultValue?: unknown) => {
        const v = (node.parameters as Record<string, unknown>)[name];
        return v !== undefined ? v : defaultValue;
      },
      getParams: () => node.parameters as Record<string, unknown>,
      getNode: () => node,
      getWorkflow: () => makeWorkflow([node]),
      continueOnFail: () => false,
      getCredential: async (_name: string) => ({
        accessToken: "mock-00D-token",
        instanceUrl: "https://test.salesforce.com",
      }),
      evaluate: (expr: string) => expr,
      getNodeInputItems: () => [],
      setCustomData: () => {},
      getCustomData: (key: string) => key === "_lastPollTimestamp" ? priorTs : undefined,
      getAllCustomData: () => ({ _lastPollTimestamp: priorTs }),
    };
    const out = await executor(ctx, node);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.Id).toBe("003B000002");

    const callUrl = String(mockFetch.mock.calls[0][0]);
    expect(decodeURIComponent(callUrl)).toContain(`CreatedDate > ${priorTs}`);
  });

  it("returns empty output when API returns no records", async () => {
    const mockFetch = makeMockFetch([]);
    vi.stubGlobal("fetch", mockFetch);

    const { out } = await runSalesforceNode(
      { triggerOn: "leadCreated", ...pollItem("everyWeek", { weekday: 1, hour: 9, minute: 0 }) },
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("throws on 401 unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 401,
        ok: false,
        headers: new Map(),
        async text() {
          return JSON.stringify([{ errorCode: "INVALID_SESSION_ID", message: "Session expired" }]);
        },
      })),
    );

    await expect(
      runSalesforceNode({ triggerOn: "contactCreated", ...pollItem("everyMinute") }, []),
    ).rejects.toThrow("Salesforce: Invalid or expired credentials");
  });

  it("throws when input items are present but no credentials configured", async () => {
    await expect(
      runNode(TYPE, { triggerOn: "contactCreated", ...pollItem("everyMinute") }, [{ Id: "001", Name: "Test" }]),
    ).rejects.toThrow("Salesforce: salesforceOAuth2Api credential is not configured");
  });

  it("starts a downstream chain and feeds NoOp the trigger item", async () => {
    const sfNode = makeNode({
      id: "t1",
      name: "Salesforce",
      type: TYPE,
      credentials: { salesforceOAuth2Api: { id: "mock", name: "Mock SF" } },
      parameters: { triggerOn: "contactCreated", ...pollItem("everyMinute") },
    });
    const wf = makeWorkflow(
      [sfNode, makeNode({ id: "n1", name: "No Operation", type: "n8n-nodes-base.noOp" })],
      { Salesforce: { main: [[{ node: "No Operation", type: "main", index: 0 }]] } },
    );
    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      credentialResolver: async () => ({ accessToken: "mock-00D-token", instanceUrl: "https://test.salesforce.com" }),
    });
    expect(result.success).toBe(true);
    expect(result.runData["No Operation"]?.status).toBe("success");
  });

  it("uses pin data instead of generated output when pinned (edge)", async () => {
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "SF",
          type: TYPE,
          parameters: { triggerOn: "leadCreated", ...pollItem("everyMinute") },
        }),
        makeNode({ id: "n1", name: "Pass", type: "n8n-nodes-base.noOp" }),
      ],
      { SF: { main: [[{ node: "Pass", type: "main", index: 0 }]] } },
    );
    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: { SF: [{ json: { Id: "00Q123", Name: "Pinned Lead" } }] },
    });
    expect(result.success).toBe(true);
    expect(result.runData.SF?.items?.[0]).toEqual([{ json: { Id: "00Q123", Name: "Pinned Lead" } }]);
    expect(result.runData.Pass?.items?.[0][0].json).toEqual({ Id: "00Q123", Name: "Pinned Lead" });
  });
});
