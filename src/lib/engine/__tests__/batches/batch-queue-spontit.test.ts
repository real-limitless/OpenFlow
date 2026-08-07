import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.spontit";

describe("batch-queue spontit — n8n-nodes-base.spontit", () => {
  beforeEach(() => {});
  afterEach(() => {});

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Spontit");
  });

  it("throws on execution because Spontit is defunct", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "pushNotification",
        operation: "create",
        title: "Test",
        message: "Hello",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    await expect(executor(ctx, node)).rejects.toThrow(
      "Spontit push notification service has been shut down",
    );
  });

  describe("continueOnFail", () => {
    it("returns error items when the executor throws", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {},
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("Spontit") });
    });
  });
});
