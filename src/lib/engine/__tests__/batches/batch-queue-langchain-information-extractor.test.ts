import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.informationExtractor";

interface MockModelInvokeResult {
  text: string;
  model: string;
}

interface MockModelHandle {
  type: string;
  model: string;
  invoke: (
    messages: Array<{ role: string; content: unknown }>,
  ) => Promise<MockModelInvokeResult>;
}

function makeModelHandle(
  overrides: Partial<MockModelHandle> = {},
): MockModelHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    model: "gpt-4.1-mini",
    invoke: async () => ({
      text: '{"companyName":"Acme Inc.","foundingYear":1999,"headquarters":"San Jose, California"}',
      model: "gpt-4.1-mini",
    }),
    ...overrides,
  };
}

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeExtractorCtx(
  items: INodeExecutionData[],
  node: INode,
  subNodeOutputs: Record<string, INodeExecutionData[]>,
  connections: IConnections,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections,
      settings: {},
    },
    getNodeInputItems: (name: string) => {
      if (name === node.name) return items;
      return subNodeOutputs[name] ?? [];
    },
    continueOnFail,
  });
}

function makeModelConnections(extractorName: string): IConnections {
  return {
    Model: {
      ai_languageModel: [[{ node: extractorName, type: "ai_languageModel", index: 0 }]],
    },
  };
}

function makeModelSubOutputs(
  modelHandle: MockModelHandle,
): Record<string, INodeExecutionData[]> {
  return { Model: [{ json: modelHandle as unknown as Record<string, unknown> }] };
}

async function runExtractor(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    modelHandle?: MockModelHandle;
    connections?: IConnections;
    subNodeOutputs?: Record<string, INodeExecutionData[]>;
    continueOnFail?: boolean;
  } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Extractor", type: TYPE, parameters });
  const items = toItems(inputItems);
  const modelHandle = opts.modelHandle ?? makeModelHandle();
  const subNodeOutputs = opts.subNodeOutputs ?? makeModelSubOutputs(modelHandle);
  const connections = opts.connections ?? makeModelConnections("Extractor");
  const ctx = makeExtractorCtx(items, node, subNodeOutputs, connections, opts.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue informationExtractor — @n8n/n8n-nodes-langchain.informationExtractor", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Information Extractor");
  });

  it("from-attribute-descriptions: extracts structured fields", async () => {
    let capturedSystemPrompt = "";
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        capturedSystemPrompt = messages[0].content as string;
        return {
          text: '{"companyName":"Acme Inc.","foundingYear":1999,"headquarters":"San Jose, California"}',
          model: "gpt-4.1-mini",
        };
      },
    });

    const out = await runExtractor(
      {
        text: "={{ $json.doc }}",
        schemaType: "fromAttributes",
        attributes: {
          values: [
            { name: "companyName", description: "The company name mentioned in the text" },
            { name: "foundingYear", description: "The year the company was founded, as a number" },
            { name: "headquarters", description: "The city and state where the company is based" },
          ],
        },
      },
      [{ doc: "Acme Inc. was founded in 1999 in San Jose, California." }],
      { modelHandle },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.output).toEqual({
      companyName: "Acme Inc.",
      foundingYear: 1999,
      headquarters: "San Jose, California",
    });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    expect(capturedSystemPrompt).toContain("companyName");
  });

  it("from-json-example: generates schema from example JSON", async () => {
    const modelHandle = makeModelHandle({
      invoke: async () => ({
        text: '{"orderId":"ORD-1042","destination":"Berlin","shippedOn":"2026-07-15"}',
        model: "gpt-4.1-mini",
      }),
    });

    const out = await runExtractor(
      {
        text: "={{ $json.doc }}",
        schemaType: "fromJson",
        jsonSchemaExample: '{\n  "orderId": "A-0001",\n  "destination": "Athens",\n  "shippedOn": "2026-01-01"\n}',
      },
      [{ doc: "Order #1042 shipped to Berlin on 2026-07-15." }],
      { modelHandle },
    );

    expect(out[0][0].json.output).toEqual({
      orderId: "ORD-1042",
      destination: "Berlin",
      shippedOn: "2026-07-15",
    });
  });

  it("manual-json-schema: uses verbatim schema", async () => {
    const modelHandle = makeModelHandle({
      invoke: async () => ({
        text: '{"sentiment":"positive"}',
        model: "gpt-4.1-mini",
      }),
    });

    const out = await runExtractor(
      {
        text: "={{ $json.doc }}",
        schemaType: "manual",
        inputSchema: '{\n  "type": "object",\n  "properties": {\n    "sentiment": { "type": "string", "enum": ["positive", "negative", "neutral"] }\n  },\n  "required": ["sentiment"]\n}',
      },
      [{ doc: "This product is amazing!" }],
      { modelHandle },
    );

    expect(out[0][0].json.output).toEqual({ sentiment: "positive" });
  });

  it("empty-text throws", async () => {
    await expect(
      runExtractor(
        {
          text: "={{ $json.doc }}",
          schemaType: "fromAttributes",
          attributes: { values: [{ name: "any", description: "whatever" }] },
        },
        [{ doc: "" }],
        { modelHandle: makeModelHandle() },
      ),
    ).rejects.toThrow("empty");
  });

  it("empty-text with continueOnFail emits error item", async () => {
    const out = await runExtractor(
      {
        text: "={{ $json.doc }}",
        schemaType: "fromAttributes",
        attributes: { values: [{ name: "any", description: "whatever" }] },
      },
      [{ doc: "" }],
      { modelHandle: makeModelHandle(), continueOnFail: true },
    );

    expect(out[0][0].json).toHaveProperty("error");
  });

  it("missing-model throws", async () => {
    const node = makeNode({ name: "Extractor", type: TYPE, parameters: { text: "", schemaType: "fromAttributes" } });
    const ctx = makeExtractorCtx(
      toItems([{ doc: "Some text." }]),
      node,
      {},
      {},
    );
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow("Language Model");
  });
});
