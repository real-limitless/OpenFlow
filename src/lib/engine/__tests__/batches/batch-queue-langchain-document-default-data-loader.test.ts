import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.documentDefaultDataLoader";

interface DocumentLoaderHandle {
  type: string;
  load: () => Promise<
    Array<{ pageContent: string; metadata: Record<string, unknown> }>
  >;
}

interface MockTextSplitterHandle {
  type: string;
  splitDocuments: (
    docs: Array<{
      pageContent: string;
      metadata?: Record<string, unknown>;
    }>,
  ) => Promise<
    Array<{ pageContent: string; metadata?: Record<string, unknown> }>
  >;
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

function makeLoaderCtx(
  items: INodeExecutionData[],
  node: INode,
  subNodeOutputs: Record<string, INodeExecutionData[]> = {},
  connections: IConnections = {},
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
    continueOnFail: false,
  });
}

function makeClusterConnections(
  loaderName: string,
  opts: { splitterName?: string } = {},
): IConnections {
  const connections: IConnections = {};
  if (opts.splitterName) {
    connections[opts.splitterName] = {
      ai_textSplitter: [
        [{ node: loaderName, type: "ai_textSplitter", index: 0 }],
      ],
    };
  }
  return connections;
}

function makeTextSplitterHandle(
  chunks: Array<{
    pageContent: string;
    metadata?: Record<string, unknown>;
  }> = [
    { pageContent: "Split chunk one." },
    { pageContent: "Split chunk two." },
  ],
): MockTextSplitterHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
    splitDocuments: async () => chunks,
  };
}

async function runLoader(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    connections?: IConnections;
    subNodeOutputs?: Record<string, INodeExecutionData[]>;
  } = {},
): Promise<DocumentLoaderHandle> {
  const node = makeNode({ name: "Loader", type: TYPE, parameters });
  const items = toItems(inputItems);
  const connections = opts.connections ?? makeClusterConnections("Loader");
  const ctx = makeLoaderCtx(items, node, opts.subNodeOutputs ?? {}, connections);
  const executor = getExecutor(TYPE)!;
  const out = await executor(ctx, node);
  return out[0][0].json as unknown as DocumentLoaderHandle;
}

describe(
  "batch-queue documentDefaultDataLoader — @n8n/n8n-nodes-langchain.documentDefaultDataLoader",
  () => {
    it("is registered as executor + description", () => {
      expect(hasExecutor(TYPE)).toBe(true);
      expect(getNodeType(TYPE).placeholder).not.toBe(true);
      expect(getNodeType(TYPE).displayName).toBe("Default Data Loader");
    });

    it("simple splitting — binary input: chunks at 1000/200", async () => {
      const longText = "A".repeat(2500);
      const handle = await runLoader(
        {
          textSplitter: "simple",
          dataType: "binary",
          mode: "all",
          dataFormat: "auto",
        },
        [
          {
            json: {},
            binary: { data: { data: longText, mimeType: "text/plain" } },
          },
        ],
      );

      const docs = await handle.load();
      expect(docs.length).toBeGreaterThan(1);
      for (const doc of docs) {
        expect(doc.pageContent.length).toBeLessThanOrEqual(1000);
        expect(doc.metadata).toEqual({ mimeType: "text/plain" });
      }
    });

    it("JSON data — load all input data: documents from all items", async () => {
      const handle = await runLoader(
        { textSplitter: "simple", dataType: "json", mode: "all" },
        [{ text: "First passage." }, { text: "Second passage." }],
      );

      const docs = await handle.load();
      expect(docs).toHaveLength(2);
      expect(docs[0].pageContent).toBe("First passage.");
      expect(docs[1].pageContent).toBe("Second passage.");
    });

    it("load specific data — mixed text and expression resolved against first item", async () => {
      const handle = await runLoader(
        {
          textSplitter: "simple",
          dataType: "json",
          mode: "specific",
          data: "Summary: {{ $json.title }}",
        },
        [{ title: "Quarterly Report" }],
      );

      const docs = await handle.load();
      expect(docs).toHaveLength(1);
      expect(docs[0].pageContent).toBe("Summary: Quarterly Report");
    });

    it("custom text splitter — delegates to connected splitter sub-node", async () => {
      const splitterHandle = makeTextSplitterHandle([
        { pageContent: "Split chunk one." },
        { pageContent: "Split chunk two." },
      ]);

      const handle = await runLoader(
        { textSplitter: "custom", dataType: "json", mode: "all" },
        [{ text: "Long text that needs splitting." }],
        {
          connections: makeClusterConnections("Loader", {
            splitterName: "Splitter",
          }),
          subNodeOutputs: {
            Splitter: [
              {
                json: splitterHandle as unknown as Record<string, unknown>,
              },
            ],
          },
        },
      );

      const docs = await handle.load();
      expect(docs).toHaveLength(2);
      expect(docs[0].pageContent).toBe("Split chunk one.");
      expect(docs[1].pageContent).toBe("Split chunk two.");
    });

    it("custom text splitter missing — load() rejects with error", async () => {
      const handle = await runLoader(
        { textSplitter: "custom", dataType: "json", mode: "all" },
        [{ text: "Some text." }],
      );

      await expect(handle.load()).rejects.toThrow(
        /Text Splitter sub-node must be connected/i,
      );
    });

    it("binary data format mismatch — load() rejects with error", async () => {
      const handle = await runLoader(
        {
          dataType: "binary",
          mode: "all",
          dataFormat: "application/pdf",
        },
        [
          {
            json: {},
            binary: { data: { data: "some text", mimeType: "text/plain" } },
          },
        ],
      );

      await expect(handle.load()).rejects.toThrow(/Data format mismatch/i);
    });

    it("auto-detect — unknown MIME type falls back to text (no error)", async () => {
      const handle = await runLoader(
        { dataType: "binary", mode: "all", dataFormat: "auto" },
        [
          {
            json: {},
            binary: {
              data: { data: "fallback content", mimeType: "application/x-unknown" },
            },
          },
        ],
      );

      const docs = await handle.load();
      expect(docs).toHaveLength(1);
      expect(docs[0].pageContent).toBe("fallback content");
    });

    it("metadata — attached to every document chunk", async () => {
      const handle = await runLoader(
        {
          textSplitter: "simple",
          dataType: "json",
          mode: "all",
          metadata: { source: "manual" },
        },
        [{ text: "Content." }],
      );

      const docs = await handle.load();
      expect(docs.length).toBeGreaterThanOrEqual(1);
      for (const doc of docs) {
        expect(doc.metadata.source).toBe("manual");
      }
    });

    it("metadata as fixedCollection array — entries converted to key/value", async () => {
      const handle = await runLoader(
        {
          textSplitter: "simple",
          dataType: "json",
          mode: "all",
          metadata: [
            { key: "source", value: "manual" },
            { key: "category", value: "report" },
          ],
        },
        [{ text: "Content." }],
      );

      const docs = await handle.load();
      expect(docs[0].metadata.source).toBe("manual");
      expect(docs[0].metadata.category).toBe("report");
    });

    it("no input data — returns empty document list", async () => {
      const handle = await runLoader(
        { textSplitter: "simple", dataType: "json", mode: "all" },
        [],
      );

      const docs = await handle.load();
      expect(docs).toEqual([]);
    });

    it("resolves the executor under the canonical type string", () => {
      const canonical = getExecutor(TYPE);
      expect(canonical).toBeDefined();
    });
  },
);