import { describe, it, expect, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.theHiveProjectTrigger";

const ALERT_CREATED_PAYLOAD = {
  body: {
    eventType: "AlertCreated",
    object: {
      id: "~123456",
      title: "Suspicious login detected",
      description: "Multiple failed logins from IP 10.0.0.1",
      severity: 3,
      type: "internal",
      source: "firewall",
      sourceRef: "fw-2026-001",
      tags: ["n8n", "suspicious"],
      status: "New",
      createdAt: 1720000000000,
    },
  },
  headers: {
    "content-type": "application/json",
    host: "n8n-webhook-url.example.com",
  },
  query: {},
  webhookId: "testing",
};

const CASE_UPDATED_PAYLOAD = {
  body: {
    eventType: "CaseUpdated",
    object: {
      id: "~789012",
      title: "Incident #42",
      description: "Updated description",
      severity: 2,
      tags: ["incident"],
      status: "InProgress",
      owner: "analyst@example.com",
    },
  },
  headers: {},
  query: {},
  webhookId: "production",
};

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(items: INodeExecutionData[], node: INode): ExecutionContext {
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
  };
  return createExecutionContext({
    node,
    workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runTrigger(
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
) {
  const node = makeNode({
    name: "TheHive Project Trigger",
    type: TYPE,
    parameters: {},
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("theHiveProjectTrigger", () => {
  it("should be registered as an executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("should have a description in the registry", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
  });

  it("should emit alert-created event with correct shape", async () => {
    const { out } = await runTrigger([ALERT_CREATED_PAYLOAD]);

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);

    const item = out[0][0];
    const json = item.json as Record<string, unknown>;
    const body = json.body as Record<string, unknown>;
    const object = body.object as Record<string, unknown>;

    expect(body.eventType).toBe("AlertCreated");
    expect(object.id).toBe("~123456");
    expect(object.title).toBe("Suspicious login detected");
    expect(object.severity).toBe(3);
    expect(json.headers).toBeDefined();
    expect((json.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(json.webhookId).toBe("testing");
  });

  it("should emit case-updated event with correct shape", async () => {
    const { out } = await runTrigger([CASE_UPDATED_PAYLOAD]);

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);

    const json = out[0][0].json as Record<string, unknown>;
    const body = json.body as Record<string, unknown>;
    const object = body.object as Record<string, unknown>;

    expect(body.eventType).toBe("CaseUpdated");
    expect(object.status).toBe("InProgress");
    expect(json.webhookId).toBe("production");
  });

  it("should discard unparseable payload gracefully", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { out } = await runTrigger([{ body: "not json", webhookId: "test" }]);

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json).toEqual({});

    warnSpy.mockRestore();
  });

  it("should discard null body gracefully", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { out } = await runTrigger([{ body: null, webhookId: "test" }]);

    // Falls back to empty item
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("should handle multiple input items", async () => {
    const { out } = await runTrigger([ALERT_CREATED_PAYLOAD, CASE_UPDATED_PAYLOAD]);

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);

    const json0 = out[0][0].json as Record<string, unknown>;
    const json1 = out[0][1].json as Record<string, unknown>;

    expect((json0.body as Record<string, unknown>).eventType).toBe("AlertCreated");
    expect((json1.body as Record<string, unknown>).eventType).toBe("CaseUpdated");
  });
});
