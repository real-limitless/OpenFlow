import { describe, it, expect } from "vitest";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.toolCalculator";

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

describe("batch-queue toolCalculator — @n8n/n8n-nodes-langchain.toolCalculator", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Calculator");
  });

  it("returns a tool handle with correct metadata on execution", async () => {
    const { out } = await runNodeWithCtx(TYPE, {}, [{}]);

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.name).toBe("calculator");
    expect(handle.inputSchema).toEqual({
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The mathematical expression to evaluate, e.g. 2 + 3 * 4",
        },
      },
      required: ["expression"],
    });
    expect(typeof handle.invoke).toBe("function");
  });

  it("evaluates basic arithmetic with standard precedence", async () => {
    const { out } = await runNodeWithCtx(TYPE, {}, [{}]);
    const handle = getHandle(out);
    const result = await handle.invoke({ expression: "2 + 3 * 4" });
    expect(result.content).toBe("14");
    expect(result.isError).toBeFalsy();
  });

  it("evaluates parentheses and exponentiation", async () => {
    const { out } = await runNodeWithCtx(TYPE, {}, [{}]);
    const handle = getHandle(out);

    const r1 = await handle.invoke({ expression: "(2 + 3) * 4" });
    expect(r1.content).toBe("20");

    const r2 = await handle.invoke({ expression: "2^10" });
    expect(r2.content).toBe("1024");
  });

  it("is deterministic - same expression returns same result", async () => {
    const { out } = await runNodeWithCtx(TYPE, {}, [{}]);
    const handle = getHandle(out);

    const r1 = await handle.invoke({ expression: "42 * 2" });
    const r2 = await handle.invoke({ expression: "42 * 2" });
    expect(r1.content).toBe(r2.content);
  });

  it("reports error for invalid expression", async () => {
    const { out } = await runNodeWithCtx(TYPE, {}, [{}]);
    const handle = getHandle(out);

    const result = await handle.invoke({ expression: "2 +" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Error");
  });

  it("reports error for missing expression argument", async () => {
    const { out } = await runNodeWithCtx(TYPE, {}, [{}]);
    const handle = getHandle(out);

    const result = await handle.invoke({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("No expression provided");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
