import { describe, it, expect } from "vitest";
import { extractChatResponseText } from "../../engine/executors/langchain-chat-trigger";
import { extractChatWorkflowResponse } from "../response";
import type { IWorkflow } from "../../workflow/types";
import type { ExecutionRunData } from "../../engine/types";

const workflow: IWorkflow = {
  id: "wf",
  name: "t",
  active: true,
  nodes: [
    {
      id: "t1",
      name: "Chat Trigger",
      type: "openflow-node-langchain.chatTrigger",
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
    {
      id: "a1",
      name: "Agent",
      type: "openflow-node-langchain.agent",
      typeVersion: 1,
      position: [200, 0],
      parameters: {},
    },
    {
      id: "c1",
      name: "Chat",
      type: "openflow-node-langchain.chat",
      typeVersion: 1,
      position: [400, 0],
      parameters: {},
    },
  ],
  connections: {},
  settings: {},
  versionId: "v1",
};

describe("extractChatWorkflowResponse", () => {
  it("uses last-node output field", () => {
    const runData: ExecutionRunData = {
      Agent: {
        status: "success",
        finishedAt: "2026-01-01T00:00:02Z",
        items: [[{ json: { output: "The answer is 42" } }]],
      },
    };
    expect(extractChatWorkflowResponse(workflow, runData, "whenLastNode")).toBe("The answer is 42");
  });

  it("matches extractChatResponseText for unknown fields", () => {
    const items = [{ json: { reply: "custom" } }];
    expect(extractChatResponseText(items).text).toBe(JSON.stringify({ reply: "custom" }));
    const runData: ExecutionRunData = {
      Agent: { status: "success", finishedAt: "t", items: [items] },
    };
    expect(extractChatWorkflowResponse(workflow, runData, "whenLastNode")).toBe(
      JSON.stringify({ reply: "custom" }),
    );
  });

  it("prefers Chat node in responseNodes mode", () => {
    const runData: ExecutionRunData = {
      Agent: {
        status: "success",
        finishedAt: "2026-01-01T00:00:01Z",
        items: [[{ json: { output: "from-agent" } }]],
      },
      Chat: {
        status: "success",
        finishedAt: "2026-01-01T00:00:02Z",
        items: [[{ json: { output: "from-chat-node" } }]],
      },
    };
    expect(extractChatWorkflowResponse(workflow, runData, "responseNodes")).toBe("from-chat-node");
    expect(extractChatWorkflowResponse(workflow, runData, "whenLastNode")).toBe("from-chat-node");
  });

  it("uses webhook body in responseNodes mode", () => {
    const runData: ExecutionRunData = {
      Agent: {
        status: "success",
        finishedAt: "t",
        items: [[{ json: { output: "from-agent" } }]],
      },
    };
    expect(
      extractChatWorkflowResponse(workflow, runData, "responseNodes", { output: "manual response" }),
    ).toBe("manual response");
  });
});
