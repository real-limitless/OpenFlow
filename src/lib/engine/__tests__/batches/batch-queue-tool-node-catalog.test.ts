import { describe, it, expect, beforeAll } from "vitest";
import { seedBuiltinExecutors, getExecutor } from "../../index";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";

const TYPE = "openflow-node-langchain.toolNodeCatalog";

describe("toolNodeCatalog", () => {
  beforeAll(() => {
    seedBuiltinExecutors();
    seedBuiltinDescriptions();
  });

  it("registers executor and emits invoke handle", async () => {
    const exec = getExecutor(TYPE);
    expect(exec).toBeTypeOf("function");
    const out = await exec!(
      {
        getParam: (k: string, d?: unknown) => {
          if (k === "name") return "search_openflow_nodes";
          if (k === "description") return "find nodes";
          if (k === "limit") return 3;
          return d;
        },
        getInputItems: () => [],
        continueOnFail: () => true,
      } as never,
      { name: "Node Catalog", type: TYPE } as never,
    );
    const item = out[0]?.[0]?.json as {
      name?: string;
      invoke?: (a: Record<string, unknown>) => Promise<{ content: string }>;
    };
    expect(item.name).toBe("search_openflow_nodes");
    expect(typeof item.invoke).toBe("function");
  });
});
