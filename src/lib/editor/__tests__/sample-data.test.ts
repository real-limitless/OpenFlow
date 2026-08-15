import { describe, it, expect } from "vitest";
import {
  itemsFromRunNode,
  mergeNodeSampleData,
  resolveIncomingItems,
} from "../sample-data";
import type { ExecutionRunData } from "@/lib/engine/types";
import type { IConnections } from "@/lib/workflow/types";

describe("sample-data", () => {
  const connections: IConnections = {
    Quotes: {
      main: [[{ node: "3. see your results", type: "main", index: 0 }]],
    },
  };

  const runData: ExecutionRunData = {
    Quotes: {
      status: "success",
      items: [[{ json: { quote: "Be yourself", author: "Wilde" } }]],
    },
  };

  it("itemsFromRunNode flattens successful branches", () => {
    const items = itemsFromRunNode(runData, "Quotes");
    expect(items).toEqual([{ json: { quote: "Be yourself", author: "Wilde" } }]);
  });

  it("resolveIncomingItems pulls upstream run data into the selected node", () => {
    const nodeData = mergeNodeSampleData(undefined, runData);
    const incoming = resolveIncomingItems(
      connections,
      "3. see your results",
      nodeData,
      runData,
    );
    expect(incoming).toHaveLength(1);
    expect(incoming[0]?.json).toEqual({ quote: "Be yourself", author: "Wilde" });
  });

  it("resolveIncomingItems ignores non-main AI channels", () => {
    const mixed: IConnections = {
      Model: {
        ai_languageModel: [[{ node: "3. see your results", type: "ai_languageModel", index: 0 }]],
      },
      Quotes: {
        main: [[{ node: "3. see your results", type: "main", index: 0 }]],
      },
    };
    const rd: ExecutionRunData = {
      ...runData,
      Model: { status: "success", items: [[{ json: { model: "x" } }]] },
    };
    const nodeData = mergeNodeSampleData(undefined, rd);
    const incoming = resolveIncomingItems(mixed, "3. see your results", nodeData, rd);
    expect(incoming[0]?.json).toEqual({ quote: "Be yourself", author: "Wilde" });
  });

  it("pinData on upstream wins over runData", () => {
    const nodeData = mergeNodeSampleData(
      { Quotes: [{ json: { quote: "Pinned quote" } }] },
      runData,
    );
    const incoming = resolveIncomingItems(
      connections,
      "3. see your results",
      nodeData,
      runData,
    );
    expect(incoming[0]?.json).toEqual({ quote: "Pinned quote" });
  });

  it("returns empty when no upstream data", () => {
    const incoming = resolveIncomingItems(connections, "3. see your results", {}, null);
    expect(incoming).toEqual([]);
  });
});
