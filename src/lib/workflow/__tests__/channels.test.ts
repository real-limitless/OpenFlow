import { describe, expect, it } from "vitest";
import {
  channelLabel,
  expandAiInputs,
  isCompatibleConnection,
  namedBaseForChannel,
  parseHandle,
  countIncomingByChannel,
  handleConnectRole,
  connectDragKey,
  parseConnectDragKey,
} from "../channels";

describe("channels", () => {
  it("channelLabel uses friendly AI names", () => {
    expect(channelLabel("ai_languageModel")).toBe("Chat Model");
    expect(channelLabel("ai_tool")).toBe("Tool");
    expect(channelLabel("ai_tool", 1)).toBe("Tool 2");
    expect(channelLabel("main", 2)).toBe("Input 3");
  });

  it("namedBaseForChannel maps parallel inputNames", () => {
    const inputs = ["main", "ai_languageModel", "ai_tool", "ai_memory"];
    const names = ["Main", "Chat Model", "Tool", "Memory"];
    expect(namedBaseForChannel("ai_tool", inputs, names, 0)).toBe("Tool");
    expect(namedBaseForChannel("ai_tool", inputs, names, 1)).toBe("Tool 2");
    expect(namedBaseForChannel("main", inputs, names, 0)).toBe("Main");
  });

  it("parseHandle splits channel and index", () => {
    expect(parseHandle("ai_languageModel-0")).toEqual(["ai_languageModel", 0]);
    expect(parseHandle("main-1")).toEqual(["main", 1]);
    expect(parseHandle(null)).toEqual(["main", 0]);
  });

  it("isCompatibleConnection requires matching channels", () => {
    expect(isCompatibleConnection("ai_tool-0", "ai_tool-0")).toBe(true);
    expect(isCompatibleConnection("ai_tool-0", "ai_memory-0")).toBe(false);
    expect(isCompatibleConnection("main-0", "main-1")).toBe(true);
    expect(isCompatibleConnection("main-0", "ai_tool-0")).toBe(false);
  });

  it("expandAiInputs grows tool slots and fallback model", () => {
    const base = ["main", "ai_languageModel", "ai_tool", "ai_memory", "ai_outputParser"];
    expect(expandAiInputs(base, {}, {})).toEqual(base);

    expect(expandAiInputs(base, { needsFallback: true }, {})).toEqual([
      "main",
      "ai_languageModel",
      "ai_languageModel",
      "ai_tool",
      "ai_memory",
      "ai_outputParser",
    ]);

    expect(expandAiInputs(base, {}, { ai_tool: 2 })).toEqual([
      "main",
      "ai_languageModel",
      "ai_tool",
      "ai_memory",
      "ai_outputParser",
    ]);

    // Structured Output port is always visible (hasOutputParser only gates runtime use)
    expect(expandAiInputs(base, { hasOutputParser: false }, {})).toEqual(base);
  });

  it("countIncomingByChannel tracks max index+1", () => {
    const counts = countIncomingByChannel(
      {
        Model: {
          ai_languageModel: [[{ node: "Agent", type: "ai_languageModel", index: 0 }]],
        },
        T1: { ai_tool: [[{ node: "Agent", type: "ai_tool", index: 0 }]] },
        T2: { ai_tool: [[{ node: "Agent", type: "ai_tool", index: 1 }]] },
      },
      "Agent",
    );
    expect(counts.ai_languageModel).toBe(1);
    expect(counts.ai_tool).toBe(2);
  });

  it("handleConnectRole highlights opposite-side same-channel only", () => {
    const drag = {
      fromNodeId: "Model",
      fromHandleId: "ai_languageModel-0",
      fromType: "source" as const,
      channel: "ai_languageModel",
    };
    expect(handleConnectRole(drag, "Model", "ai_languageModel-0", "source")).toBe("origin");
    expect(handleConnectRole(drag, "Agent", "ai_languageModel-0", "target")).toBe("compatible");
    expect(handleConnectRole(drag, "Agent", "ai_tool-0", "target")).toBe("incompatible");
    expect(handleConnectRole(drag, "Agent", "main-0", "source")).toBe("incompatible");
    expect(handleConnectRole(drag, "Model", "main-0", "target")).toBe("incompatible");
    expect(handleConnectRole(null, "Agent", "ai_languageModel-0", "target")).toBe("idle");
  });

  it("connectDragKey round-trips", () => {
    const key = connectDragKey(true, "n1", "ai_tool-0", "source");
    expect(parseConnectDragKey(key)).toEqual({
      fromNodeId: "n1",
      fromHandleId: "ai_tool-0",
      fromType: "source",
      channel: "ai_tool",
    });
    expect(parseConnectDragKey(connectDragKey(false))).toBeNull();
  });
});
