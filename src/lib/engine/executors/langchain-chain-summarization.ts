import type { NodeExecutor, INodeExecutionData, ExecutionContext, IWorkflow } from "@/sdk";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ModelInvokeResult {
  text: string;
  [key: string]: unknown;
}

interface ModelHandle {
  type?: string;
  model?: string;
  invoke(messages: ChatMessage[]): Promise<ModelInvokeResult>;
}

interface DocumentLoaderHandle {
  load?(): Promise<Array<{ pageContent: string; metadata?: Record<string, unknown> }>>;
  [key: string]: unknown;
}

interface TextSplitterHandle {
  splitText?(text: string): Promise<string[]>;
  splitDocuments?(docs: Array<{ pageContent: string; metadata?: Record<string, unknown> }>): Promise<Array<{ pageContent: string; metadata?: Record<string, unknown> }>>;
  [key: string]: unknown;
}

interface SubNodeRef {
  name: string;
  index: number;
}

interface ConnectedSubNodes {
  languageModels: SubNodeRef[];
  documentLoaders: SubNodeRef[];
  textSplitters: SubNodeRef[];
}

function findConnectedSubNodes(
  connections: IWorkflow["connections"],
  chainName: string,
): ConnectedSubNodes {
  const subs: ConnectedSubNodes = {
    languageModels: [],
    documentLoaders: [],
    textSplitters: [],
  };
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets) continue;
        for (const t of targets) {
          if (!t || t.node !== chainName) continue;
          const ref: SubNodeRef = { name: sourceName, index: t.index ?? 0 };
          switch (t.type) {
            case "ai_languageModel":
              subs.languageModels.push(ref);
              break;
            case "ai_documentLoader":
              subs.documentLoaders.push(ref);
              break;
            case "ai_textSplitter":
              subs.textSplitters.push(ref);
              break;
          }
        }
      }
    }
  }
  subs.languageModels.sort((a, b) => a.index - b.index);
  return subs;
}

function getModelHandle(ctx: ExecutionContext, name: string): ModelHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  const json = items[0].json;
  if (json && typeof (json as { invoke?: unknown }).invoke === "function") {
    return json as unknown as ModelHandle;
  }
  return null;
}

function getDocumentLoaderHandle(ctx: ExecutionContext, name: string): DocumentLoaderHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  return items[0].json as unknown as DocumentLoaderHandle;
}

function getTextSplitterHandle(ctx: ExecutionContext, name: string): TextSplitterHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  return items[0].json as unknown as TextSplitterHandle;
}

function splitTextSimple(text: string, chunkSize: number, chunkOverlap: number): string[] {
  if (chunkSize <= 0) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - chunkOverlap;
    if (start >= text.length) break;
  }
  return chunks;
}

async function splitDocuments(
  ctx: ExecutionContext,
  docs: Array<{ pageContent: string; metadata?: Record<string, unknown> }>,
  chunking: string,
  charactersPerChunk: number,
  chunkOverlap: number,
): Promise<Array<{ pageContent: string; metadata?: Record<string, unknown> }>> {
  if (chunking === "advanced") {
    const workflow = ctx.getWorkflow();
    const subs = findConnectedSubNodes(workflow.connections, ctx.getNode().name);
    if (subs.textSplitters.length === 0) {
      throw new Error("Advanced chunking selected but no Text Splitter sub-node is connected");
    }
    const splitterHandle = getTextSplitterHandle(ctx, subs.textSplitters[0].name);
    if (!splitterHandle) {
      throw new Error("Text Splitter sub-node returned no handle");
    }
    if (typeof splitterHandle.splitDocuments === "function") {
      return splitterHandle.splitDocuments(docs);
    }
    if (typeof splitterHandle.splitText === "function") {
      const results: Array<{ pageContent: string; metadata?: Record<string, unknown> }> = [];
      for (const doc of docs) {
        const chunks = await splitterHandle.splitText(doc.pageContent);
        for (const chunk of chunks) {
          results.push({ pageContent: chunk, metadata: doc.metadata });
        }
      }
      return results;
    }
    throw new Error("Connected Text Splitter does not support splitDocuments or splitText");
  }
  const results: Array<{ pageContent: string; metadata?: Record<string, unknown> }> = [];
  for (const doc of docs) {
    const chunks = splitTextSimple(doc.pageContent, charactersPerChunk, chunkOverlap);
    for (const chunk of chunks) {
      results.push({ pageContent: chunk, metadata: doc.metadata });
    }
  }
  return results;
}

async function loadDocuments(
  ctx: ExecutionContext,
  dataType: string,
  inputItems: INodeExecutionData[],
): Promise<Array<{ pageContent: string; metadata?: Record<string, unknown> }>> {
  if (dataType === "documentLoader") {
    const workflow = ctx.getWorkflow();
    const subs = findConnectedSubNodes(workflow.connections, ctx.getNode().name);
    if (subs.documentLoaders.length === 0) {
      throw new Error("Document Loader data source selected but no Document Loader sub-node is connected");
    }
    const loaderHandle = getDocumentLoaderHandle(ctx, subs.documentLoaders[0].name);
    if (!loaderHandle) {
      throw new Error("Document Loader sub-node returned no handle");
    }
    if (typeof loaderHandle.load !== "function") {
      throw new Error("Connected Document Loader does not support load()");
    }
    const loaded = await loaderHandle.load();
    return loaded.map((d) => ({
      pageContent: d.pageContent ?? "",
      metadata: d.metadata,
    }));
  }

  const docs: Array<{ pageContent: string; metadata?: Record<string, unknown> }> = [];
  for (const item of inputItems) {
    const json = item.json ?? {};
    if (dataType === "json") {
      for (const [, value] of Object.entries(json)) {
        if (typeof value === "string" && value.trim().length > 0) {
          docs.push({ pageContent: value, metadata: {} });
        }
      }
    } else if (dataType === "binary") {
      const binary = item.binary;
      if (binary) {
        for (const [, binData] of Object.entries(binary)) {
          if (binData.data && typeof binData.data === "string") {
            let text = binData.data;
            const mimeType = binData.mimeType ?? "";
            if (mimeType.startsWith("text/") || mimeType === "application/json") {
              docs.push({ pageContent: text, metadata: { mimeType } });
            } else if (mimeType === "application/pdf") {
              docs.push({ pageContent: `[PDF content: ${binData.fileName ?? "unknown"}]`, metadata: { mimeType } });
            } else {
              docs.push({ pageContent: `[Binary data: ${mimeType}]`, metadata: { mimeType } });
            }
          }
        }
      }
    }
  }
  return docs;
}

function validatePromptPlaceholder(prompt: string, name: string): void {
  if (prompt && !prompt.includes("{text}")) {
    throw new Error(`${name} must contain {text} placeholder`);
  }
}

async function runSummarization(
  modelHandle: ModelHandle,
  docs: Array<{ pageContent: string; metadata?: Record<string, unknown> }>,
  method: string,
  individualPrompt: string,
  finalPrompt: string,
): Promise<string> {
  const texts = docs.map((d) => d.pageContent).filter((t) => t.length > 0);
  if (texts.length === 0) {
    throw new Error("No documents to summarize");
  }

  if (method === "stuff") {
    const combined = texts.join("\n\n");
    const prompt = individualPrompt ? individualPrompt.replace("{text}", combined) : `Summarize the following text:\n\n{text}`;
    const filledPrompt = prompt.replace("{text}", combined);
    const result = await modelHandle.invoke([{ role: "user", content: filledPrompt }]);
    return result.text ?? "";
  }

  if (method === "map_reduce") {
    const mapPrompt = individualPrompt || "Summarize the following text:\n\n{text}";
    const summaries: string[] = [];
    for (const text of texts) {
      const filled = mapPrompt.replace("{text}", text);
      const result = await modelHandle.invoke([{ role: "user", content: filled }]);
      summaries.push(result.text ?? "");
    }
    const combinedSummaries = summaries.join("\n\n");
    const reducePrompt = finalPrompt || "Combine the following summaries into a final summary:\n\n{text}";
    const filledReduce = reducePrompt.replace("{text}", combinedSummaries);
    const finalResult = await modelHandle.invoke([{ role: "user", content: filledReduce }]);
    return finalResult.text ?? "";
  }

  if (method === "refine") {
    let runningSummary = "";
    const mapPrompt = individualPrompt || "Summarize the following text:\n\n{text}";
    const refinePrompt = finalPrompt || "Refine the existing summary with the new context:\n\nExisting summary: {text}\n\nNew context: {text}";
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (i === 0) {
        const filled = mapPrompt.replace("{text}", text);
        const result = await modelHandle.invoke([{ role: "user", content: filled }]);
        runningSummary = result.text ?? "";
      } else {
        const filled = refinePrompt
          .replace("{text}", runningSummary)
          .replace("{text}", text);
        const result = await modelHandle.invoke([{ role: "user", content: filled }]);
        runningSummary = result.text ?? "";
      }
    }
    return runningSummary;
  }

  throw new Error(`Unknown summarization method: ${method}`);
}

export const langchainChainSummarizationExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const workflow = ctx.getWorkflow();
  const subs = findConnectedSubNodes(workflow.connections, node.name);

  if (subs.languageModels.length === 0) {
    throw new Error("A Chat Model sub-node must be connected");
  }

  const modelHandle = getModelHandle(ctx, subs.languageModels[0].name);
  if (!modelHandle) {
    throw new Error("A Chat Model sub-node must be connected");
  }

  const dataType = ctx.getParam<string>("dataType", "json");
  const chunking = ctx.getParam<string>("chunking", "simple");
  const charactersPerChunk = ctx.getParam<number>("charactersPerChunk", 2000);
  const chunkOverlap = ctx.getParam<number>("chunkOverlap", 200);
  const summarizationMethod = ctx.getParam<string>("summarizationMethod", "map_reduce");
  const individualSummaryPrompt = ctx.getParam<string>("individualSummaryPrompt", "");
  const finalPrompt = ctx.getParam<string>("finalPrompt", "");

  validatePromptPlaceholder(individualSummaryPrompt, "Individual Summary Prompt");
  validatePromptPlaceholder(finalPrompt, "Final Prompt");

  try {
    const docs = await loadDocuments(ctx, dataType, items);
    if (docs.length === 0) {
      throw new Error("No documents to summarize");
    }

    const chunkedDocs = await splitDocuments(ctx, docs, chunking, charactersPerChunk, chunkOverlap);
    if (chunkedDocs.length === 0) {
      throw new Error("No document chunks produced");
    }

    const summary = await runSummarization(
      modelHandle,
      chunkedDocs,
      summarizationMethod,
      individualSummaryPrompt,
      finalPrompt,
    );

    return [[{ json: { output: summary, text: summary }, pairedItem: { item: 0, input: 0 } }]];
  } catch (err) {
    if (!ctx.continueOnFail()) throw err;
    const error = err instanceof Error ? err.message : String(err);
    return [[{ json: { error }, pairedItem: { item: 0, input: 0 } }]];
  }
};