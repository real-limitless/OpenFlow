import { describe, it, expect } from "vitest";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.toolWikipedia";

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

describe("batch-queue toolWikipedia — @n8n/n8n-nodes-langchain.toolWikipedia", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Wikipedia");
  });

  it("returns a tool handle with correct metadata on execution", async () => {
    const { out } = await runNodeWithCtx(TYPE, {}, [{}]);

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.name).toBe("wikipedia");
    expect(handle.inputSchema).toEqual({
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up on Wikipedia",
        },
      },
      required: ["query"],
    });
    expect(typeof handle.invoke).toBe("function");
  });

  it("reports error for missing query argument", async () => {
    const { out } = await runNodeWithCtx(TYPE, {}, [{}]);
    const handle = getHandle(out);

    const result = await handle.invoke({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("No query provided");
  });

  it("returns a tool handle with default description", async () => {
    const { out } = await runNodeWithCtx(TYPE, {}, [{}]);
    const handle = getHandle(out);
    expect(handle.description).toBe(
      "A tool for interacting with and fetching data from the Wikipedia API. The input should always be a string query.",
    );
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("has no main inputs and produces ai_tool output", () => {
    const desc = getNodeType(TYPE);
    expect(desc.inputs).toEqual([]);
    expect(desc.outputs).toContain("ai_tool");
  });
});
