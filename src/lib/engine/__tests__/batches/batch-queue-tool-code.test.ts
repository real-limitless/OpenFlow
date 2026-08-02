import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.toolCode";

type ToolHandle = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  invoke: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>;
};

describe("batch-queue toolCode — @n8n/n8n-nodes-langchain.toolCode", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Custom Code Tool");
  });

  it("resolves the executor under the canonical type string", () => {
    const executor = getExecutor(TYPE);
    expect(executor).toBeDefined();
  });

  it("returns a tool handle with metadata", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        description: "Lowercase a string.",
        language: "JavaScript",
        jsCode: "return query.toLowerCase();",
      },
      [{}],
    );

    const handle = out[0][0].json as unknown as ToolHandle;
    expect(handle.name).toBe("N");
    expect(handle.description).toBe("Lowercase a string.");
    expect(handle.inputSchema).toEqual({
      type: "object",
      properties: {
        query: { type: "string", description: "The input string passed by the model to the tool" },
      },
      required: ["query"],
    });
    expect(typeof handle.invoke).toBe("function");
  });

  it("happy path: returns lowercased string from invoke", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        description: "Lowercase a string.",
        language: "JavaScript",
        jsCode: "return query.toLowerCase();",
      },
      [{}],
    );

    const handle = out[0][0].json as unknown as ToolHandle;
    const result = await handle.invoke({ query: "HELLO" });
    expect(result.content).toBe("hello");
    expect(result.isError).toBeFalsy();
  });

  it("invoke returns the string length from code body", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        description: "Return input length.",
        language: "JavaScript",
        jsCode: "return query.length;",
      },
      [{}],
    );

    const handle = out[0][0].json as unknown as ToolHandle;
    const result = await handle.invoke({ query: "abcde" });
    expect(result.content).toBe("5");
  });

  it("invoke with no args defaults query to empty string", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        description: "Return query.",
        language: "JavaScript",
        jsCode: "return query;",
      },
      [{}],
    );

    const handle = out[0][0].json as unknown as ToolHandle;
    const result = await handle.invoke({});
    expect(result.content).toBe("");
  });

  it("reports error when code throws, continueOnFail=true", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        description: "Throws.",
        language: "JavaScript",
        jsCode: "throw new Error('boom');",
        options: { continueOnFail: true },
      },
      [{}],
      { continueOnFail: true },
    );

    const handle = out[0][0].json as unknown as ToolHandle;
    const result = await handle.invoke({ query: "x" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("boom");
  });

  it("re-throws when code throws and continueOnFail=false", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        description: "Throws.",
        language: "JavaScript",
        jsCode: "throw new Error('crash');",
      },
      [{}],
    );

    const handle = out[0][0].json as unknown as ToolHandle;
    await expect(handle.invoke({ query: "x" })).rejects.toThrow("crash");
  });

  it("uses pyCode when language is Python (executed as JS for now)", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        description: "Return query.",
        language: "Python",
        pyCode: "return query.toUpperCase()",
      },
      [{}],
    );

    const handle = out[0][0].json as unknown as ToolHandle;
    const result = await handle.invoke({ query: "hello" });
    expect(result.content).toBe("HELLO");
  });
});
