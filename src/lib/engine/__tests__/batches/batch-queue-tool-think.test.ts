import { describe, it, expect } from "vitest";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.toolThink";

type ToolHandle = {
  type: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  invoke: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>;
};

function getHandle(out: INodeExecutionData[][]): ToolHandle {
  return out[0][0].json as unknown as ToolHandle;
}

describe("batch-queue toolThink — @n8n/n8n-nodes-langchain.toolThink", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Think Tool");
  });

  it("returns a tool handle with correct metadata on execution", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        name: "think",
        description: "Use this tool to think carefully about a complex question before answering.",
      },
      [{}],
    );

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.name).toBe("think");
    expect(handle.description).toBe(
      "Use this tool to think carefully about a complex question before answering.",
    );
    expect(handle.inputSchema).toEqual({ type: "object", properties: {}, required: [] });
    expect(typeof handle.invoke).toBe("function");
  });

  it("invoke returns a thinking prompt, no side effects", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        name: "think",
        description: "Think before answering.",
      },
      [{}],
    );

    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(result.content).toContain("think step by step");
    expect(result.isError).toBeFalsy();
  });

  it("uses configured name and description from parameters", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        name: "reason",
        description: "Reason through multi-step logic problems.",
      },
      [{}],
    );

    const handle = getHandle(out);
    expect(handle.name).toBe("reason");
    expect(handle.description).toBe("Reason through multi-step logic problems.");
  });

  it("handles empty input items gracefully", async () => {
    const { out } = await runNodeWithCtx(TYPE, {}, []);
    const handle = getHandle(out);
    expect(handle.name).toBe("think");
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
