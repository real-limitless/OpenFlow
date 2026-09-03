import { describe, it, expect } from "vitest";
import { isApiPath } from "../../../server/api-prefixes";
import {
  chatTriggerParams,
  isAnyChatTriggerNode,
  isChatTriggerNode,
  isManualChatTriggerNode,
  resolveChatPath,
} from "../path";
import type { INode } from "../../workflow/types";

function node(partial: Partial<INode> & { parameters?: Record<string, unknown> }): INode {
  return {
    id: "chat-node-1",
    name: "Chat Trigger",
    type: "openflow-node-langchain.chatTrigger",
    typeVersion: 1.2,
    position: [0, 0],
    parameters: {},
    ...partial,
  };
}

describe("chat path helpers", () => {
  it("recognizes chat and manual chat triggers including wire types", () => {
    expect(isChatTriggerNode({ type: "openflow-node-langchain.chatTrigger" })).toBe(true);
    expect(isChatTriggerNode({ type: "@n8n/n8n-nodes-langchain.chatTrigger" })).toBe(true);
    expect(isManualChatTriggerNode({ type: "openflow-node-langchain.manualChatTrigger" })).toBe(true);
    expect(isAnyChatTriggerNode({ type: "@n8n/n8n-nodes-langchain.manualChatTrigger" })).toBe(true);
    expect(isChatTriggerNode({ type: "openflow-node-base.webhook" })).toBe(false);
  });

  it("prefers options.chatPath then slugs node id", () => {
    expect(
      resolveChatPath(node({ parameters: { options: { chatPath: "Support Bot!" } } })),
    ).toBe("support-bot");
    expect(resolveChatPath(node({ id: "AbC 99", parameters: {} }))).toBe("abc-99");
  });

  it("routes /chat through the Hono API (not the SPA 404)", () => {
    expect(isApiPath("/chat/node-mtkzmyi8-2")).toBe(true);
    expect(isApiPath("/chat")).toBe(true);
    expect(isApiPath("/form/demo")).toBe(true);
    expect(isApiPath("/api/v1/workflows")).toBe(true);
    expect(isApiPath("/chats")).toBe(false);
    expect(isApiPath("/chats/wf-1")).toBe(false);
  });

  it("reads public and hub flags", () => {
    const p = chatTriggerParams(
      node({
        parameters: {
          public: true,
          makeAvailableInChat: true,
          agentName: "Helper",
          options: { responseMode: "responseNodes" },
        },
      }),
    );
    expect(p.public).toBe(true);
    expect(p.makeAvailableInChat).toBe(true);
    expect(p.agentName).toBe("Helper");
    expect(p.responseMode).toBe("responseNodes");
  });
});
