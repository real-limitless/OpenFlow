import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.sentimentAnalysis";

interface MockModelInvokeResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface MockModelHandle {
  type: string;
  model: string;
  invoke: (
    messages: Array<{ role: string; content: string }>,
  ) => Promise<MockModelInvokeResult>;
}

function makeModelHandle(
  response: string,
  overrides: Partial<MockModelHandle> = {},
): MockModelHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    model: "gpt-4.1-mini",
    invoke: async () => ({
      text: response,
      model: "gpt-4.1-mini",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
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

function makeSentimentCtx(
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

function makeConnections(
  nodeName: string,
  modelName = "Model",
): IConnections {
  const connections: IConnections = {};
  connections[modelName] = {
    ai_languageModel: [[{ node: nodeName, type: "ai_languageModel", index: 0 }]],
  };
  return connections;
}

function makeModelOutputs(
  modelHandle: MockModelHandle,
): Record<string, INodeExecutionData[]> {
  return { Model: [{ json: modelHandle as unknown as Record<string, unknown> }] };
}

async function runSentiment(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    modelHandle?: MockModelHandle;
    connections?: IConnections;
    subNodeOutputs?: Record<string, INodeExecutionData[]>;
    continueOnFail?: boolean;
  } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Sentiment", type: TYPE, parameters });
  const items = toItems(inputItems);
  const modelHandle = opts.modelHandle ?? makeModelHandle(JSON.stringify({ category: "Positive", strength: 0.85, confidence: 0.92 }));
  const subNodeOutputs = opts.subNodeOutputs ?? makeModelOutputs(modelHandle);
  const connections = opts.connections ?? makeConnections("Sentiment");
  const ctx = makeSentimentCtx(
    items,
    node,
    subNodeOutputs,
    connections,
    opts.continueOnFail,
  );
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue sentimentAnalysis — @n8n/n8n-nodes-langchain.sentimentAnalysis", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Sentiment Analysis");
  });

  it("basic three-category classification", async () => {
    const modelHandle = makeModelHandle(JSON.stringify({ category: "Positive", strength: 0.9, confidence: 0.95 }));
    const [output] = await runSentiment(
      {
        inputText: "={{ $json.text }}",
        options: { categories: "Positive, Neutral, Negative" },
      },
      [{ json: { text: "I love this product! It works perfectly." } }],
      { modelHandle },
    );
    expect(output).toHaveLength(1);
    const sa = output[0].json!.sentimentAnalysis as Record<string, unknown>;
    expect(sa.category).toBe("Positive");
    expect(output[0].pairedItem).toBeDefined();
  });

  it("custom categories", async () => {
    const modelHandle = makeModelHandle(JSON.stringify({ category: "Excited", strength: 0.9, confidence: 0.9 }));
    const [output] = await runSentiment(
      {
        inputText: "={{ $json.feedback }}",
        options: { categories: "Excited, Happy, Neutral, Disappointed, Angry" },
      },
      [{ json: { feedback: "The support team was incredibly helpful and fast!" } }],
      { modelHandle },
    );
    expect(output).toHaveLength(1);
    const sa = output[0].json!.sentimentAnalysis as Record<string, unknown>;
    expect(["Excited", "Happy"]).toContain(sa.category);
  });

  it("detailed results enabled", async () => {
    const modelHandle = makeModelHandle(JSON.stringify({ category: "Positive", strength: 0.7, confidence: 0.65 }));
    const [output] = await runSentiment(
      {
        inputText: "={{ $json.text }}",
        options: { includeDetailedResults: true },
      },
      [{ json: { text: "This is a moderately good experience." } }],
      { modelHandle },
    );
    expect(output).toHaveLength(1);
    const sa = output[0].json!.sentimentAnalysis as Record<string, unknown>;
    expect(sa.category).toBe("Positive");
    expect(typeof sa.strength).toBe("number");
    expect(sa.strength).toBeGreaterThanOrEqual(0);
    expect(sa.strength).toBeLessThanOrEqual(1);
    expect(typeof sa.confidence).toBe("number");
    expect(sa.confidence).toBeGreaterThanOrEqual(0);
    expect(sa.confidence).toBeLessThanOrEqual(1);
  });

  it("detailed results disabled – strength/confidence not present", async () => {
    const modelHandle = makeModelHandle(JSON.stringify({ category: "Negative", strength: 0.3, confidence: 0.8 }));
    const [output] = await runSentiment(
      {
        inputText: "={{ $json.text }}",
        options: { includeDetailedResults: false },
      },
      [{ json: { text: "Bad experience." } }],
      { modelHandle },
    );
    expect(output).toHaveLength(1);
    const sa = output[0].json!.sentimentAnalysis as Record<string, unknown>;
    expect(sa.category).toBe("Negative");
    expect(sa.strength).toBeUndefined();
    expect(sa.confidence).toBeUndefined();
  });

  it("batch processing – multiple items", async () => {
    const modelHandle = makeModelHandle(JSON.stringify({ category: "Neutral", strength: 0.5, confidence: 0.5 }));
    const [output] = await runSentiment(
      {
        options: { batching: { batchSize: 3, delayBetweenBatches: 100 } },
      },
      Array.from({ length: 12 }, (_, i) => ({ json: { text: `Item ${i}` } })),
      { modelHandle },
    );
    expect(output).toHaveLength(12);
    for (const item of output) {
      expect(item.json!.sentimentAnalysis).toBeDefined();
    }
  });

  it("auto-fixing on malformed output", async () => {
    const responses = ["some gibberish", JSON.stringify({ category: "Positive", strength: 0.8, confidence: 0.9 })];
    let callCount = 0;
    const modelHandle = makeModelHandle("", {
      invoke: async () => {
        const resp = responses[callCount] ?? JSON.stringify({ category: "Positive", strength: 0.8, confidence: 0.9 });
        callCount++;
        return {
          text: resp,
          model: "gpt-4.1-mini",
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        };
      },
    });
    const [output] = await runSentiment(
      {
        inputText: "={{ $json.text }}",
        options: { enableAutoFixing: true },
      },
      [{ json: { text: "Great product!" } }],
      { modelHandle },
    );
    expect(output).toHaveLength(1);
    const sa = output[0].json!.sentimentAnalysis as Record<string, unknown>;
    expect(sa.category).toBe("Positive");
  });

  it("missing-model-throws – no ai_languageModel connected", async () => {
    await expect(
      runSentiment(
        { inputText: "={{ $json.text }}" },
        [{ json: { text: "test" } }],
        { connections: {} },
      ),
    ).rejects.toThrow(/Language Model/);
  });

  it("continue-on-fail – errors return item with error field", async () => {
    const modelHandle = makeModelHandle("", {
      invoke: async () => {
        throw new Error("Model failed");
      },
    });
    const [output] = await runSentiment(
      {
        inputText: "={{ $json.text }}",
      },
      [{ json: { text: "test" } }],
      { modelHandle, continueOnFail: true },
    );
    expect(output).toHaveLength(1);
    expect(output[0].json!.error).toBeDefined();
  });

  it("parses plain-text model response as fallback", async () => {
    const modelHandle = makeModelHandle("Positive");
    const [output] = await runSentiment(
      {
        inputText: "={{ $json.text }}",
        options: { categories: "Positive, Neutral, Negative" },
      },
      [{ json: { text: "Amazing!" } }],
      { modelHandle },
    );
    expect(output).toHaveLength(1);
    const sa = output[0].json!.sentimentAnalysis as Record<string, unknown>;
    expect(sa.category).toBe("Positive");
  });
});
