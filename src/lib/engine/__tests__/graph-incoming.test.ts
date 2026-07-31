import { describe, it, expect } from "vitest";
import { buildIncoming } from "../graph";
import type { IConnections } from "@/lib/workflow/types";

describe("buildIncoming channel awareness", () => {
  it("records target channel on each edge", () => {
    const connections: IConnections = {
      Start: {
        main: [[{ node: "Agent", type: "main", index: 0 }]],
      },
      Model: {
        ai_languageModel: [[{ node: "Agent", type: "ai_languageModel", index: 0 }]],
      },
      Tool: {
        ai_tool: [[{ node: "Agent", type: "ai_tool", index: 0 }]],
      },
    };

    const incoming = buildIncoming(connections);
    const edges = incoming.get("Agent") ?? [];
    expect(edges).toHaveLength(3);
    expect(edges.find((e) => e.source === "Start")).toMatchObject({
      channel: "main",
      targetInput: 0,
    });
    expect(edges.find((e) => e.source === "Model")).toMatchObject({
      channel: "ai_languageModel",
      targetInput: 0,
    });
    expect(edges.find((e) => e.source === "Tool")).toMatchObject({
      channel: "ai_tool",
      targetInput: 0,
    });
  });
});
