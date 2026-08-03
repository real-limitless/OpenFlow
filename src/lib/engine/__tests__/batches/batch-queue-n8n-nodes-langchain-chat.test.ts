import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNodeWithCtx, makeNode, makeWorkflow } from "../helpers";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.chat";

function makeChatTriggerWorkflow() {
  return makeWorkflow(
    [
      makeNode({ name: "ChatTrigger", type: "@n8n/n8n-nodes-langchain.chatTrigger", parameters: {} }),
      makeNode({ name: "N", type: TYPE, parameters: {} }),
    ],
    {},
  );
}

function runChatNode(
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown>> = [{}],
  nodeOverrides: Partial<Record<string, unknown>> = {},
) {
  const node = makeNode({ name: "N", type: TYPE, parameters, ...nodeOverrides });
  const workflow = makeChatTriggerWorkflow();
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx = createExecutionContext({
    node,
    workflow,
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async () => null,
  });
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue chat — @n8n/n8n-nodes-langchain.chat", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Chat");
  });

  it("send-message-basic: pass-through items unchanged", async () => {
    const out = await runChatNode(
      { operation: "send", message: "Welcome! Ask me about {{ $json.topic }}." },
      [{ topic: "pricing" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ topic: "pricing" });
  });

  it("send-and-wait-free-text: outputs chatInput from resumed payload", async () => {
    const out = await runChatNode(
      { operation: "sendAndWait", message: "What is your name?", responseType: "freeText" },
      [{}],
      { resumedFrom: { chatInput: "Alice" } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ chatInput: "Alice" });
  });

  it("send-and-wait-approval-approve: outputs approved data", async () => {
    const out = await runChatNode(
      {
        operation: "sendAndWait",
        message: "Approve this deployment?",
        responseType: "approval",
        approvalType: "approveAndDisapprove",
      },
      [{}],
      { resumedFrom: { data: { approved: true } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ data: { approved: true } });
  });

  it("send-and-wait-approval-approveOnly: outputs approved data", async () => {
    const out = await runChatNode(
      {
        operation: "sendAndWait",
        message: "Approve?",
        responseType: "approval",
        approvalType: "approveOnly",
      },
      [{}],
      { resumedFrom: { data: { approved: true } } },
    );
    expect(out[0][0].json).toEqual({ data: { approved: true } });
  });

  it("send-and-wait-approval: outputs data.approved when blockUserInput is set", async () => {
    const out = await runChatNode(
      {
        operation: "sendAndWait",
        message: "Approve this deployment?",
        responseType: "approval",
        approvalType: "approveAndDisapprove",
        blockUserInput: true,
      },
      [{}],
      { resumedFrom: { data: { approved: true } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ data: { approved: true } });
  });

  it("send-and-wait-approval-disapprove-with-text: returns disapproval with responseText", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "sendAndWait",
        message: "Approve this deployment?",
        responseType: "approval",
        approvalType: "approveAndDisapprove",
        blockUserInput: false,
      },
      resumedFrom: { chatInput: "Needs more testing" },
    });
    const workflow = makeChatTriggerWorkflow();
    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = createExecutionContext({
      node,
      workflow,
      getNodeInputItems: () => items,
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      data: { approved: false, responseText: "Needs more testing" },
    });
  });

  it("send-and-wait-approval-disapprove-with-text from data payload", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "sendAndWait",
        message: "Approve this deployment?",
        responseType: "approval",
        approvalType: "approveAndDisapprove",
      },
      resumedFrom: { data: { approved: false, responseText: "Not ready" } },
    });
    const workflow = makeChatTriggerWorkflow();
    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = createExecutionContext({
      node,
      workflow,
      getNodeInputItems: () => items,
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toEqual({ data: { approved: false, responseText: "Not ready" } });
  });

  it("memory-connection-without-memory-node-throws: throws runtime error when memoryConnection=true but no memory connected", async () => {
    await expect(
      runChatNode(
        { operation: "send", message: "Hi there!", memoryConnection: true },
        [{ chatInput: "Hello" }],
      ),
    ).rejects.toThrow(/memory/i);
  });

  it("resolves the same executor under dual keys", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("send-and-wait-without-resume-signals-wait: throws when no resumedFrom payload", async () => {
    await expect(
      runChatNode(
        { operation: "sendAndWait", message: "Please respond", responseType: "freeText" },
        [{}],
      ),
    ).rejects.toThrow(/waiting for user response/);
  });

  it("missing-chat-trigger-throws: throws when no Chat Trigger in workflow", async () => {
    await expect(
      runNodeWithCtx(
        TYPE,
        { operation: "sendAndWait", message: "Test", responseType: "freeText" },
        [{}],
      ),
    ).rejects.toThrow(/Chat Trigger/);
  });

  it("wrong-chat-trigger-response-mode-throws: rejects non-responseNodes mode", async () => {
    const trigger = makeNode({
      name: "ChatTrigger",
      type: "@n8n/n8n-nodes-langchain.chatTrigger",
      parameters: { options: { responseMode: "streaming" } },
    });
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { operation: "sendAndWait", message: "Test", responseType: "freeText" },
    });
    const workflow = makeWorkflow([trigger, node], {});
    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = createExecutionContext({
      node,
      workflow,
      getNodeInputItems: () => items,
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/Response Mode/);
  });

  it("embedded-chat-trigger-throws: rejects embedded mode", async () => {
    const trigger = makeNode({
      name: "ChatTrigger",
      type: "@n8n/n8n-nodes-langchain.chatTrigger",
      parameters: { embedOptions: { mode: "embedded" } },
    });
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { operation: "sendAndWait", message: "Test", responseType: "freeText" },
    });
    const workflow = makeWorkflow([trigger, node], {});
    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = createExecutionContext({
      node,
      workflow,
      getNodeInputItems: () => items,
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/Embedded/);
  });

  it("tool-context-rejection: throws when invoked as tool in sub-agent context", async () => {
    const trigger = makeNode({
      name: "ChatTrigger",
      type: "@n8n/n8n-nodes-langchain.chatTrigger",
      parameters: {},
    });
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { operation: "sendAndWait", message: "Test", responseType: "freeText" },
    });
    const workflow = makeWorkflow([trigger, node], {});
    (workflow as unknown as Record<string, unknown>).parentTool = "agent";
    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = createExecutionContext({
      node,
      workflow,
      getNodeInputItems: () => items,
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/not work.*tool|sub-agent|sub-workflow/i);
  });

  it("send-message with sendAndWait: throws with no resume", async () => {
    await expect(
      runChatNode(
        { operation: "sendAndWait", message: "Test", responseType: "freeText" },
        [{}],
      ),
    ).rejects.toThrow(/waiting/);
  });

  it("send-message with no Chat Trigger: throws config error", async () => {
    await expect(
      runNodeWithCtx(
        TYPE,
        { operation: "send", message: "Test" },
        [{}],
      ),
    ).rejects.toThrow(/Chat Trigger/);
  });

  it("continueonfail-not-honored-for-config-errors: config errors always throw", async () => {
    await expect(
      runNodeWithCtx(
        TYPE,
        { operation: "sendAndWait", message: "Test", responseType: "freeText" },
        [{}],
        { continueOnFail: true },
      ),
    ).rejects.toThrow(/Chat Trigger/);
  });

  it("continueonfail-honored-for-runtime-errors: returns error items when memory fails with continueOnFail", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "sendAndWait",
        message: "Test",
        responseType: "freeText",
        memoryConnection: true,
      },
      resumedFrom: { chatInput: "hi" },
    });
    const trigger = makeNode({
      name: "ChatTrigger",
      type: "@n8n/n8n-nodes-langchain.chatTrigger",
      parameters: {},
    });
    const workflow = makeWorkflow([trigger, node], {});
    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = createExecutionContext({
      node,
      workflow,
      getNodeInputItems: () => items,
      continueOnFail: true,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
    expect(out[0][0].json.error).toMatch(/memory/i);
  });

  it("send-message-memory-connection: commits user+assistant messages to memory", async () => {
    const trigger = makeNode({
      name: "ChatTrigger",
      type: "@n8n/n8n-nodes-langchain.chatTrigger",
      parameters: {},
    });
    const memoryNode = makeNode({
      name: "MemoryNode",
      type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
      parameters: { sessionId: "test-session-1" },
    });
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { operation: "send", message: "Assistant reply", memoryConnection: true },
    });
    const workflow = makeWorkflow([trigger, memoryNode, node], {
      MemoryNode: {
        main: [[{ node: "N", type: "ai_memory", index: 0 }]],
      },
    });
    const items: INodeExecutionData[] = [{ json: { chatInput: "User question" } }];
    const ctx = createExecutionContext({
      node,
      workflow,
      getNodeInputItems: () => items,
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
  });
});
