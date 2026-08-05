import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.retrieverWorkflow";

function makeCtxWithSubWorkflow(
  parameters: Record<string, unknown>,
  runSubWorkflow?: ExecutionContext["runSubWorkflow"],
  continueOnFail = false,
): { ctx: ExecutionContext; node: INode } {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => [{ json: {} }],
    continueOnFail,
    runSubWorkflow,
  });
  return { ctx, node };
}

describe("batch-queue retrieverWorkflow — @n8n/n8n-nodes-langchain.retrieverWorkflow", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Workflow Retriever");
  });

  it("database source invokes runSubWorkflow with coerced fields", async () => {
    let capturedOpts: Parameters<NonNullable<ExecutionContext["runSubWorkflow"]>>[0] | undefined;
    const mockRunSub: ExecutionContext["runSubWorkflow"] = async (opts) => {
      capturedOpts = opts;
      return [{ json: { pageContent: "result", metadata: {} } }];
    };
    const { ctx, node } = makeCtxWithSubWorkflow(
      {
        source: "database",
        workflowId: "wf-retriever",
        fields: {
          values: [
            { name: "query", type: "stringValue", stringValue: "What is LangChain?" },
          ],
        },
      },
      mockRunSub,
    );

    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    const handle = out[0][0].json as Record<string, unknown>;
    const getDocs = handle.getRelevantDocuments as (q: string) => Promise<unknown>;
    await getDocs("test");

    expect(capturedOpts).toBeDefined();
    expect(capturedOpts!.workflowId).toBe("wf-retriever");
    expect(capturedOpts!.items[0].json).toEqual({ query: "What is LangChain?" });

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(handle.type).toBe(TYPE);
    expect(typeof handle.getRelevantDocuments).toBe("function");
    expect(typeof handle.invoke).toBe("function");
  });

  it("parameter source with inline workflow JSON", async () => {
    let capturedOpts: Parameters<NonNullable<ExecutionContext["runSubWorkflow"]>>[0] | undefined;
    const mockRunSub: ExecutionContext["runSubWorkflow"] = async (opts) => {
      capturedOpts = opts;
      return [{ json: { pageContent: "cached response", metadata: {} } }];
    };
    const { ctx, node } = makeCtxWithSubWorkflow(
      {
        source: "parameter",
        workflowJson: '{ "nodes": [], "connections": {} }',
      },
      mockRunSub,
    );

    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    const handle = out[0][0].json as Record<string, unknown>;
    const getDocs = handle.getRelevantDocuments as (q: string) => Promise<unknown>;
    const docs = await getDocs("test");

    expect(capturedOpts).toBeDefined();
    expect(capturedOpts!.workflowJson).toBeDefined();
    expect(docs).toHaveLength(1);
    expect(docs[0].pageContent).toBe("cached response");
  });

  it("field with typed numberValue coerces to number 42", async () => {
    let capturedInput: Record<string, unknown> = {};
    const mockRunSub: ExecutionContext["runSubWorkflow"] = async (opts) => {
      capturedInput = opts.items[0].json;
      return [{ json: { pageContent: "echo", metadata: {} } }];
    };
    const { ctx, node } = makeCtxWithSubWorkflow(
      {
        source: "database",
        workflowId: "wf-echo",
        fields: {
          values: [
            { name: "count", type: "numberValue", numberValue: "42" },
          ],
        },
      },
      mockRunSub,
    );

    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    const handle = out[0][0].json as Record<string, unknown>;
    const getDocs = handle.getRelevantDocuments as (q: string) => Promise<unknown>;
    await getDocs("test");

    expect(capturedInput.count).toBe(42);
  });

  it("throws when source=database and no workflowId", async () => {
    const { ctx, node } = makeCtxWithSubWorkflow(
      { source: "database" },
      undefined,
    );
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/workflowId is required/i);
  });

  it("throws when source=parameter and no workflowJson", async () => {
    const { ctx, node } = makeCtxWithSubWorkflow(
      { source: "parameter" },
      undefined,
    );
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/workflowJson is required/i);
  });

  it("sub-workflow failure propagates error", async () => {
    const mockRunSub: ExecutionContext["runSubWorkflow"] = async () => {
      throw new Error("child exploded");
    };
    const { ctx, node } = makeCtxWithSubWorkflow(
      {
        source: "database",
        workflowId: "wf-explode",
      },
      mockRunSub,
    );
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    const handle = out[0][0].json as Record<string, unknown>;
    const getDocs = handle.getRelevantDocuments as (q: string) => Promise<unknown>;
    await expect(getDocs("test")).rejects.toThrow("child exploded");
  });

  it("continueOnFail returns error Document instead of throwing", async () => {
    const mockRunSub: ExecutionContext["runSubWorkflow"] = async () => {
      throw new Error("child exploded");
    };
    const { ctx, node } = makeCtxWithSubWorkflow(
      {
        source: "database",
        workflowId: "wf-explode",
      },
      mockRunSub,
      true,
    );
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    const handle = out[0][0].json as Record<string, unknown>;
    const getDocs = handle.getRelevantDocuments as (q: string) => Promise<unknown>;
    const docs = await getDocs("test");
    expect(Array.isArray(docs)).toBe(true);
    expect(docs[0]).toMatchObject({ pageContent: expect.stringContaining("child exploded") });
  });

  it("getRelevantDocuments maps child items to Documents", async () => {
    const mockRunSub: ExecutionContext["runSubWorkflow"] = async () => {
      return [
        { json: { pageContent: "doc1", metadata: { source: "a" } } },
        { json: { pageContent: "doc2", metadata: { source: "b" } } },
      ];
    };
    const { ctx, node } = makeCtxWithSubWorkflow(
      {
        source: "database",
        workflowId: "wf-echo",
      },
      mockRunSub,
    );
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    const handle = out[0][0].json as Record<string, unknown>;
    const getDocs = handle.getRelevantDocuments as (q: string) => Promise<unknown>;
    const docs = await getDocs("query") as Array<Record<string, unknown>>;
    expect(docs).toHaveLength(2);
    expect(docs[0].pageContent).toBe("doc1");
    expect(docs[0].metadata).toEqual({ source: "a" });
    expect(docs[1].pageContent).toBe("doc2");
  });
});
