import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.toolSerpApi";

interface ToolHandle {
  type: string;
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
  invoke: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>;
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

async function runTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): ToolHandle {
  return out[0][0].json as unknown as ToolHandle;
}

describe(TYPE, () => {
  it("should have executor registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("should export a tool handle with correct schema", async () => {
    const creds = { serpApi: { apiKey: "test-key" } };
    const out = await runTool({}, [{}], creds);
    const handle = getHandle(out);

    expect(handle.type).toBe(TYPE);
    expect(handle.name).toBe("serpapi_web_search");
    expect(handle.description).toContain("Google web search");
    expect(handle.inputSchema.required).toEqual(["query"]);
    expect(handle.inputSchema.properties.query).toBeDefined();
  });

  it("should fail when credential is missing", async () => {
    await expect(runTool({}, [{}], {})).rejects.toThrow(/SerpApi/);
  });

  it("should fail when credential has no apiKey", async () => {
    await expect(runTool({}, [{}], { serpApi: {} })).rejects.toThrow(/API key/);
  });

  it("should produce a tool handle that returns error on unknown domain (invoke)", async () => {
    const creds = { serpApi: { apiKey: "test-key" } };
    const out = await runTool({ query: "test" }, [{}], creds);
    const handle = getHandle(out);

    const result = await handle.invoke({ query: "coffee near me" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("SerpApi");
  });

  it("should include optional parameters in the URL construction", async () => {
    const creds = { serpApi: { apiKey: "test-key" } };
    const params = {
      query: "coffee",
      country: "us",
      language: "en",
      googleDomain: "google.com",
      device: "mobile",
    };
    const out = await runTool(params, [{}], creds);
    const handle = getHandle(out);

    const result = await handle.invoke({ query: "coffee" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("SerpApi");
  });

  it("should include no_cache when explicitArray is true", async () => {
    const creds = { serpApi: { apiKey: "test-key" } };
    const out = await runTool({ query: "test", explicitArray: true }, [{}], creds);
    const handle = getHandle(out);

    const result = await handle.invoke({ query: "latest AI news" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("SerpApi");
  });

  it("should return content for empty query", async () => {
    const creds = { serpApi: { apiKey: "test-key" } };
    const out = await runTool({}, [{}], creds);
    const handle = getHandle(out);

    const result = await handle.invoke({ query: "" });
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe("No search query provided.");
  });

  it("should have a valid description in the registry", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc?.name).toBe(TYPE);
  });
});
