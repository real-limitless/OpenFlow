import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, assertExecutorRegistered, makeNode, makeWorkflow } from "../helpers";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.chatHitlTool";

function makeChatTriggerWorkflow() {
  return makeWorkflow(
    [
      makeNode({ name: "ChatTrigger", type: "@n8n/n8n-nodes-langchain.chatTrigger", parameters: {} }),
      makeNode({ name: "N", type: TYPE, parameters: {} }),
    ],
    {},
  );
}

function runHitlNode(
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

describe(TYPE, () => {
  it("is registered as executor", () => {
    assertExecutorRegistered(TYPE);
  });

  it("is registered as description", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
  });

  it("approval mode with default message and approve+disapprove", async () => {
    const result = await runHitlNode({}, [{}]);
    const output = result[0][0].json;
    expect(output.status).toBe("pending_approval");
    expect(output.responseType).toBe("approval");
    expect(output.message).toContain("AI wants to use");
    expect(output.toolName).toBe("Unknown Tool");
    expect(output.approvalType).toBe("approveAndDisapprove");
    expect(output.approveButtonLabel).toBe("Approve");
    expect(output.disapproveButtonLabel).toBe("Disapprove");
    expect(output.blockUserInput).toBe(false);
  });

  it("freeText response type omits approval fields", async () => {
    const result = await runHitlNode({ responseType: "freeText" }, [{}]);
    const output = result[0][0].json;
    expect(output.responseType).toBe("freeText");
    expect(output.status).toBe("pending_approval");
    expect(output.approveButtonLabel).toBeUndefined();
  });

  it("uses custom approve only button label", async () => {
    const result = await runHitlNode(
      { responseType: "approval", approvalType: "approveOnly", approveButtonLabel: "Yes" },
      [{}],
    );
    const output = result[0][0].json;
    expect(output.approvalType).toBe("approveOnly");
    expect(output.approveButtonLabel).toBe("Yes");
    expect(output.disapproveButtonLabel).toBeUndefined();
  });

  it("resume approved: forwards tool call to ai_tool output", async () => {
    const result = await runHitlNode(
      { responseType: "approval" },
      [{}],
      { resumedFrom: { data: { approved: true } } },
    );
    const output = result[0][0].json;
    expect(output.approved).toBe(true);
    expect(output.toolName).toBe("Unknown Tool");
  });

  it("resume denied: returns rejection without tool execution", async () => {
    const result = await runHitlNode(
      { responseType: "approval" },
      [{}],
      { resumedFrom: { data: { approved: false, responseText: "Not appropriate" } } },
    );
    const output = result[0][0].json;
    expect(output.approved).toBe(false);
    expect(output.rejectionReason).toBe("Not appropriate");
  });

  it("resume freeText: returns reviewer text as rejection", async () => {
    const result = await runHitlNode(
      { responseType: "freeText" },
      [{}],
      { resumedFrom: { chatInput: "Please modify the parameters first." } },
    );
    const output = result[0][0].json;
    expect(output.approved).toBe(false);
    expect(output.rejectionReason).toBe("Please modify the parameters first.");
  });

  it("missing-chat-trigger-throws: throws when no Chat Trigger in workflow", async () => {
    await expect(
      runNode(
        TYPE,
        { responseType: "approval" },
        [{}],
      ),
    ).rejects.toThrow(/Chat Trigger/);
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
      parameters: { responseType: "approval" },
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

  it("wrong-chat-trigger-response-mode-throws: rejects non-responseNodes mode", async () => {
    const trigger = makeNode({
      name: "ChatTrigger",
      type: "@n8n/n8n-nodes-langchain.chatTrigger",
      parameters: { options: { responseMode: "streaming" } },
    });
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { responseType: "approval" },
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

  it("custom message renders $tool.name and $tool.parameters", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { message: "Approve call to {{ $tool.name }}?" },
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
    (ctx as any).toolName = "Send Email";
    const executor = getExecutor(TYPE)!;
    const result = await executor(ctx, node);
    const output = result[0][0].json;
    expect(output.message).toBe("Approve call to Send Email?");
  });

  it("limitWaitTime passthrough with values", async () => {
    const result = await runHitlNode(
      { responseType: "approval", limitWaitTime: { values: { limitType: "afterTimeInterval", resumeAmount: 5, resumeUnit: "minutes" } } },
      [{}],
    );
    const output = result[0][0].json;
    expect(output.limitWaitTime).toBeDefined();
    expect(output.limitWaitTime.limitType).toBe("afterTimeInterval");
    expect(output.limitWaitTime.resumeAmount).toBe(5);
    expect(output.limitWaitTime.resumeUnit).toBe("minutes");
  });
});
