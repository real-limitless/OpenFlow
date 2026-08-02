import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.textClassifier";

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

function makeClassifierCtx(
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
  classifierName: string,
  modelName = "Model",
): IConnections {
  const connections: IConnections = {};
  connections[modelName] = {
    ai_languageModel: [[{ node: classifierName, type: "ai_languageModel", index: 0 }]],
  };
  return connections;
}

function makeModelOutputs(
  modelHandle: MockModelHandle,
): Record<string, INodeExecutionData[]> {
  return { Model: [{ json: modelHandle as unknown as Record<string, unknown> }] };
}

async function runClassifier(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    modelHandle?: MockModelHandle;
    connections?: IConnections;
    subNodeOutputs?: Record<string, INodeExecutionData[]>;
    continueOnFail?: boolean;
  } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Classifier", type: TYPE, parameters });
  const items = toItems(inputItems);
  const modelHandle = opts.modelHandle ?? makeModelHandle("refund");
  const subNodeOutputs = opts.subNodeOutputs ?? makeModelOutputs(modelHandle);
  const connections = opts.connections ?? makeConnections("Classifier");
  const ctx = makeClassifierCtx(
    items,
    node,
    subNodeOutputs,
    connections,
    opts.continueOnFail,
  );
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue textClassifier — @n8n/n8n-nodes-langchain.textClassifier", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Text Classifier");
  });

  it("basic-single-class – model returns 'refund'", async () => {
    const categories = {
      values: [
        { name: "refund", description: "A request for or notice of a refund" },
        { name: "order", description: "Anything about placing or tracking an order" },
      ],
    };
    const modelHandle = makeModelHandle("refund");
    const [output] = await runClassifier(
      {
        inputPrompt: "={{ $json.text }}",
        categories,
        options: { allowMultipleClasses: false, whenNoClearMatch: "discardItem" },
      },
      [{ json: { text: "This order was refunded in full." } }],
      { modelHandle },
    );
    expect(output).toHaveLength(1);
    const result = output[0].json!.output as { name: string; description: string };
    expect(result.name).toBe("refund");
    expect(result.description).toBe("A request for or notice of a refund");
    expect(output[0].pairedItem).toBeDefined();
  });

  it("multiple-classes-allowed – model returns both categories", async () => {
    const categories = {
      values: [
        { name: "refund", description: "A request for or notice of a refund" },
        { name: "order", description: "Anything about placing or tracking an order" },
      ],
    };
    const modelHandle = makeModelHandle("refund\norder");
    const [output] = await runClassifier(
      {
        inputPrompt: "={{ $json.text }}",
        categories,
        options: { allowMultipleClasses: true, whenNoClearMatch: "discardItem" },
      },
      [{ json: { text: "Cancel my order and issue a refund." } }],
      { modelHandle },
    );
    expect(output).toHaveLength(1);
    const result = output[0].json!.output as { categories: Array<{ name: string; description: string }> };
    expect(result.categories).toBeDefined();
    const names = result.categories.map((c) => c.name);
    expect(names).toContain("refund");
    expect(names).toContain("order");
  });

  it("no-clear-match-discards-item – unmatched item is dropped", async () => {
    const categories = {
      values: [
        { name: "refund", description: "A request for or notice of a refund" },
        { name: "order", description: "Anything about placing or tracking an order" },
      ],
    };
    const modelHandle = makeModelHandle("unknown");
    const [output] = await runClassifier(
      {
        inputPrompt: "={{ $json.text }}",
        categories,
        options: { allowMultipleClasses: false, whenNoClearMatch: "discardItem" },
      },
      [{ json: { text: "The sky looks nice today." } }],
      { modelHandle },
    );
    expect(output).toHaveLength(0);
  });

  it("no-clear-match-other-branch – unmatched item on output[1]", async () => {
    const categories = {
      values: [
        { name: "refund", description: "A request for or notice of a refund" },
        { name: "order", description: "Anything about placing or tracking an order" },
      ],
    };
    const modelHandle = makeModelHandle("unknown");
    const [output0, output1] = await runClassifier(
      {
        inputPrompt: "={{ $json.text }}",
        categories,
        options: { allowMultipleClasses: false, whenNoClearMatch: "outputExtraBranch" },
      },
      [{ json: { text: "The sky looks nice today." } }],
      { modelHandle },
    );
    expect(output0).toHaveLength(0);
    expect(output1).toHaveLength(1);
    expect(output1[0].json?.text).toBe("The sky looks nice today.");
  });

  it("auto-fixing-malformed-output – recovers after bad first reply", async () => {
    const categories = {
      values: [
        { name: "refund", description: "A request for or notice of a refund" },
        { name: "order", description: "Anything about placing or tracking an order" },
      ],
    };
    const responses = ["some gibberish that doesn't match", "refund"];
    let callCount = 0;
    const modelHandle = makeModelHandle("refund", {
      invoke: async () => {
        const resp = responses[callCount] ?? "refund";
        callCount++;
        return {
          text: resp,
          model: "gpt-4.1-mini",
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        };
      },
    });
    const [output] = await runClassifier(
      {
        inputPrompt: "={{ $json.text }}",
        categories,
        options: {
          allowMultipleClasses: false,
          whenNoClearMatch: "discardItem",
          enableAutoFixing: true,
        },
      },
      [{ json: { text: "This order was refunded in full." } }],
      { modelHandle },
    );
    expect(output).toHaveLength(1);
    const result = output[0].json!.output as { name: string };
    expect(result.name).toBe("refund");
  });

  it("missing-model-throws – no ai_languageModel connected", async () => {
    const categories = {
      values: [{ name: "refund", description: "Refund category" }],
    };
    await expect(
      runClassifier(
        { inputPrompt: "={{ $json.text }}", categories },
        [{ json: { text: "test" } }],
        { connections: {} },
      ),
    ).rejects.toThrow(/Language Model/);
  });
});
