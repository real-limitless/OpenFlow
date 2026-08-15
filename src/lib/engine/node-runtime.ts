/**
 * Mutable node runtime registry.
 * Boot seeds builtins; dev hot-reload can re-register without a full redesign.
 */
import type { NodeExecutor } from "@/sdk";
import type { INodeTypeDescription } from "@/lib/nodes/types";
import { openflowRepoBase, toCanonicalType, typeKeys } from "@/lib/nodes/type-ids";

const executors = new Map<string, NodeExecutor>();
const descriptions = new Map<string, INodeTypeDescription>();
const aliases = new Map<string, string>();

let seeded = false;

/**
 * Mark the registry as seeded. Real registration lives in executors/index.ts
 * (eager import.meta.glob) — call seedBuiltinExecutors from there / @/lib/engine.
 */
export function markExecutorsSeeded(): void {
  seeded = true;
}

/**
 * @deprecated Import seedBuiltinExecutors from `@/lib/engine` or `./executors`
 * instead. This no-op remains only so older direct node-runtime imports compile;
 * it does not load executor modules.
 */
export function seedBuiltinExecutors(): void {
  seeded = true;
}

/** All keys that resolve to the same node (canonical + n8n wire + legacy). */
function dualKeys(type: string): string[] {
  return typeKeys(type);
}

function resolveTypeKey(type: string): string {
  const viaAlias = aliases.get(type) ?? type;
  return toCanonicalType(viaAlias);
}

export function registerExecutor(type: string, executor: NodeExecutor): void {
  for (const key of dualKeys(type)) {
    executors.set(key, executor);
  }
}

/** Fill required UI fields so incomplete clean-room defs cannot crash the editor. */
function normalizeDescription(description: INodeTypeDescription): INodeTypeDescription {
  const canonicalName = toCanonicalType(description.name);
  return {
    ...description,
    name: canonicalName,
    inputs: description.inputs ?? [],
    outputs: description.outputs ?? [],
    properties: description.properties ?? [],
    sources: description.sources ?? [],
    group: Array.isArray(description.group) ? description.group : ["transform"],
    icon: description.icon || "Box",
  };
}

export function registerDescription(description: INodeTypeDescription): void {
  const normalized = normalizeDescription(description);
  for (const key of dualKeys(normalized.name)) {
    descriptions.set(key, normalized);
  }
}

export function registerAlias(fromType: string, toType: string): void {
  const target = toCanonicalType(toType);
  for (const key of dualKeys(fromType)) {
    aliases.set(key, target);
  }
  aliases.set(fromType, target);
}

export function registerNode(options: {
  type: string;
  executor?: NodeExecutor;
  description?: INodeTypeDescription;
}): void {
  if (options.executor) registerExecutor(options.type, options.executor);
  if (options.description) registerDescription(options.description);
}

export function getExecutor(type: string): NodeExecutor | undefined {
  const resolved = resolveTypeKey(type);
  return (
    executors.get(type) ??
    executors.get(resolved) ??
    executors.get(toCanonicalType(type))
  );
}

export function getDescription(type: string): INodeTypeDescription | undefined {
  const resolved = resolveTypeKey(type);
  return (
    descriptions.get(type) ??
    descriptions.get(resolved) ??
    descriptions.get(toCanonicalType(type))
  );
}

export function hasExecutor(type: string): boolean {
  return getExecutor(type) !== undefined;
}

/**
 * True when OpenFlow ships an executor for `type`.
 *
 * Answers the question from the static BUILTIN_EXECUTOR_MODULES manifest rather
 * than the live registry, so callers get an answer without importing a single
 * executor module. UI code must use this instead of `defaultExecutors[type]`:
 * touching the registry pulls in the executors barrel, which drags every
 * server-only dependency (database drivers, node:fs, sharp) into the client
 * bundle. Falls back to the live registry so runtime-registered plugins count.
 */
export function hasBuiltinExecutor(type: string): boolean {
  for (const key of dualKeys(resolveTypeKey(type))) {
    if (builtinExecutorTypes.has(key) || executors.has(key)) return true;
  }
  return builtinExecutorTypes.has(type) || executors.has(type);
}

/**
 * Repo-relative path to the builtin executor source for `type`, e.g.
 * `src/lib/engine/executors/http-request.ts`. Safe for UI (reads the static
 * manifest only — does not import executor modules).
 */
export function getBuiltinExecutorSourcePath(type: string): string | null {
  const canonical = toCanonicalType(type);
  const entry = BUILTIN_EXECUTOR_MODULES.find(
    (e) => toCanonicalType(e.type) === canonical || typeKeys(e.type).includes(type),
  );
  if (!entry?.modulePath) return null;
  // modulePath is like "./executors/http-request" relative to src/lib/engine/
  const rel = entry.modulePath.replace(/^\.\//, "").replace(/\.ts$/i, "");
  return `src/lib/engine/${rel}.ts`;
}

/** GitHub blob URL for the node executor source, or null if unregistered. */
export function executorSourceBlobUrl(type: string, branch = "main"): string | null {
  const path = getBuiltinExecutorSourcePath(type);
  if (!path) return null;
  return `${openflowRepoBase()}/blob/${branch}/${path}`;
}

/**
 * Describes why a registered executor cannot actually run, or null when it can.
 *
 * Like `hasBuiltinExecutor`, this reads the static manifest so UI code can call
 * it without importing an executor module. `hasBuiltinExecutor` alone is not
 * enough to decide whether a node is usable: these types resolve to a real
 * function that throws the moment it is invoked.
 */
export function getExecutorUnavailability(
  type: string,
): { setter: string; reason: string } | null {
  for (const key of dualKeys(resolveTypeKey(type))) {
    const u = builtinUnavailable.get(key);
    if (u) return u;
  }
  return builtinUnavailable.get(type) ?? null;
}

export function listUnavailableExecutorTypes(): string[] {
  return [...builtinUnavailable.keys()].sort();
}

export function listExecutorTypes(): string[] {
  const types = new Set<string>();
  for (const key of executors.keys()) {
    if (
      key.startsWith("openflow-node-base.") ||
      key.startsWith("openflow-node-langchain.") ||
      key.startsWith("openflow.") ||
      key.startsWith("n8n-nodes-base.") ||
      key.startsWith("@n8n/")
    ) {
      // Prefer canonical form in listings
      types.add(toCanonicalType(key));
    }
  }
  return [...types].sort();
}

export function listDescriptions(): INodeTypeDescription[] {
  const seen = new Set<INodeTypeDescription>();
  const out: INodeTypeDescription[] = [];
  for (const d of descriptions.values()) {
    if (!d?.name || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/** Snapshot used by the engine runner. */
export function getExecutorMap(): Record<string, NodeExecutor> {
  const map: Record<string, NodeExecutor> = {};
  for (const [key, exec] of executors) {
    map[key] = exec;
  }
  return map;
}

/**
 * Backward-compatible object that always reflects the live Map.
 * Prefer getExecutorMap() / getExecutor() in new code.
 */
export const defaultExecutors: Record<string, NodeExecutor> = new Proxy(
  {} as Record<string, NodeExecutor>,
  {
    get(_target, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;
      return getExecutor(prop);
    },
    has(_target, prop: string | symbol) {
      return typeof prop === "string" && hasExecutor(prop);
    },
    ownKeys() {
      return listExecutorTypes();
    },
    getOwnPropertyDescriptor(_target, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;
      const value = getExecutor(prop);
      if (!value) return undefined;
      return { configurable: true, enumerable: true, writable: false, value };
    },
  },
);

export function clearRuntimeForTests(): void {
  executors.clear();
  descriptions.clear();
  aliases.clear();
  seeded = false;
}

export function isRuntimeSeeded(): boolean {
  return seeded;
}

/** @deprecated Use markExecutorsSeeded */
export function markRuntimeSeeded(): void {
  markExecutorsSeeded();
}

/**
 * Known builtin executor modules for dev reload.
 * Add new builtins here when OpenCode batches land.
 */
export const BUILTIN_EXECUTOR_MODULES: Array<{
  type: string;
  modulePath: string;
  exportName: string;
  /**
   * Set when the executor is registered but cannot run in this build because an
   * out-of-process transport was never wired up. The executor still resolves to
   * a function, so `hasBuiltinExecutor` reports true; it throws on first use.
   *
   * `setter` names the injection point a host can call to supply a transport
   * (see the ftp/git executors for the lazy-import pattern used when a default
   * is possible). Keep this in sync with the throwing DEFAULT_FACTORY in the
   * executor module — `transport-wiring.test.ts` fails if the two drift.
   */
  unavailable?: { setter: string; reason: string };
}> = [
  {
    type: "openflow-node-base.manualTrigger",
    modulePath: "./executors/manual-trigger",
    exportName: "manualTriggerExecutor",
  },
  { type: "openflow-node-base.set", modulePath: "./executors/set", exportName: "setExecutor" },
  { type: "openflow-node-base.noOp", modulePath: "./executors/noop", exportName: "noopExecutor" },
  {
    type: "openflow-node-base.automizy",
    modulePath: "./executors/n8n-nodes-base.automizy",
    exportName: "automizyExecutor",
  },
  {
    type: "openflow-node-base.moveBinaryData",
    modulePath: "./executors/move-binary-data",
    exportName: "moveBinaryDataExecutor",
  },
  { type: "openflow-node-base.if", modulePath: "./executors/if", exportName: "ifExecutor" },
  {
    type: "openflow-node-base.httpRequest",
    modulePath: "./executors/http-request",
    exportName: "httpRequestExecutor",
  },
  { type: "openflow-node-base.code", modulePath: "./executors/code", exportName: "codeExecutor" },
  {
    type: "openflow-node-base.aiTransform",
    modulePath: "./executors/aiTransform",
    exportName: "aiTransformExecutor",
  },
  {
    type: "openflow-node-base.webhook",
    modulePath: "./executors/webhook",
    exportName: "webhookExecutor",
  },
  {
    type: "openflow-node-base.respondToWebhook",
    modulePath: "./executors/respond-to-webhook",
    exportName: "respondToWebhookExecutor",
  },
  {
    type: "openflow-node-base.switch",
    modulePath: "./executors/switch",
    exportName: "switchExecutor",
  },
  { type: "openflow-node-base.merge", modulePath: "./executors/merge", exportName: "mergeExecutor" },
  {
    type: "openflow-node-base.compareDatasets",
    modulePath: "./executors/compare-datasets",
    exportName: "compareDatasetsExecutor",
  },
  { type: "openflow-node-base.wait", modulePath: "./executors/wait", exportName: "waitExecutor" },
  {
    type: "openflow-node-base.splitOut",
    modulePath: "./executors/split-out",
    exportName: "splitOutExecutor",
  },
  {
    type: "openflow-node-base.aggregate",
    modulePath: "./executors/aggregate",
    exportName: "aggregateExecutor",
  },
  {
    type: "openflow-node-base.summarize",
    modulePath: "./executors/summarize",
    exportName: "summarizeExecutor",
  },
  {
    type: "openflow-node-base.filter",
    modulePath: "./executors/filter",
    exportName: "filterExecutor",
  },
  { type: "openflow-node-base.limit", modulePath: "./executors/limit", exportName: "limitExecutor" },
  {
    type: "openflow-node-base.removeDuplicates",
    modulePath: "./executors/remove-duplicates",
    exportName: "removeDuplicatesExecutor",
  },
  {
    type: "openflow-node-base.itemLists",
    modulePath: "./executors/item-lists",
    exportName: "itemListsExecutor",
  },
  {
    type: "openflow-node-base.dateTime",
    modulePath: "./executors/date-time",
    exportName: "dateTimeExecutor",
  },
  {
    type: "openflow-node-base.splitInBatches",
    modulePath: "./executors/split-in-batches",
    exportName: "splitInBatchesExecutor",
  },
  {
    type: "openflow-node-base.executeWorkflow",
    modulePath: "./executors/execute-workflow",
    exportName: "executeWorkflowExecutor",
  },
  {
    type: "openflow-node-base.executeWorkflowTrigger",
    modulePath: "./executors/execute-workflow-trigger",
    exportName: "executeWorkflowTriggerExecutor",
  },
  {
    type: "openflow-node-base.executeCommandTool",
    modulePath: "./executors/executeCommandTool",
    exportName: "executeCommandToolExecutor",
  },
  {
    type: "openflow-node-base.stopAndError",
    modulePath: "./executors/stop-and-error",
    exportName: "stopAndErrorExecutor",
  },
  {
    type: "openflow-node-base.scheduleTrigger",
    modulePath: "./executors/schedule-trigger",
    exportName: "scheduleTriggerExecutor",
  },
  {
    type: "openflow-node-base.sort",
    modulePath: "./executors/sort",
    exportName: "sortExecutor",
  },
  {
    type: "openflow-node-base.renameKeys",
    modulePath: "./executors/rename-keys",
    exportName: "renameKeysExecutor",
  },
  {
    type: "openflow-node-base.errorTrigger",
    modulePath: "./executors/error-trigger",
    exportName: "errorTriggerExecutor",
  },
  {
    type: "openflow-node-base.ftp",
    modulePath: "./executors/ftp",
    exportName: "ftpExecutor",
  },
  {
    type: "openflow-node-base.ssh",
    modulePath: "./executors/ssh",
    exportName: "sshExecutor",
  },
  {
    type: "openflow-node-base.convertToFile",
    modulePath: "./executors/convert-to-file",
    exportName: "convertToFileExecutor",
  },
  {
    type: "openflow-node-base.extractFromFile",
    modulePath: "./executors/extract-from-file",
    exportName: "extractFromFileExecutor",
  },
  {
    type: "openflow-node-base.readPDF",
    modulePath: "./executors/read-pdf",
    exportName: "readPDFExecutor",
  },
  {
    type: "openflow-node-base.spreadsheetFile",
    modulePath: "./executors/spreadsheet-file",
    exportName: "spreadsheetFileExecutor",
  },
  {
    type: "openflow-node-base.readBinaryFile",
    modulePath: "./executors/readBinaryFile",
    exportName: "readBinaryFileExecutor",
  },
  {
    type: "openflow-node-base.readWriteFile",
    modulePath: "./executors/readWriteFile",
    exportName: "readWriteFileExecutor",
  },
  {
    type: "openflow-node-base.readBinaryFiles",
    modulePath: "./executors/readBinaryFiles",
    exportName: "readBinaryFilesExecutor",
  },
  {
    type: "openflow-node-base.writeBinaryFile",
    modulePath: "./executors/write-binary-file",
    exportName: "writeBinaryFileExecutor",
  },
  {
    type: "openflow-node-base.rssFeedRead",
    modulePath: "./executors/rss-feed-read",
    exportName: "rssFeedReadExecutor",
  },
  {
    type: "openflow-node-base.rssFeedReadTrigger",
    modulePath: "./executors/rss-feed-read-trigger",
    exportName: "rssFeedReadTriggerExecutor",
  },
  {
    type: "openflow-node-base.emailSend",
    modulePath: "./executors/email-send",
    exportName: "emailSendExecutor",
  },
  {
    type: "openflow-node-base.dataTable",
    modulePath: "./executors/data-table",
    exportName: "dataTableExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatOpenAi",
    modulePath: "./executors/lm-chat-openai",
    exportName: "lmChatOpenAiExecutor",
  },
  {
    type: "openflow-node-langchain.lmOpenAi",
    modulePath: "./executors/lm-openai",
    exportName: "lmOpenAiExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatGoogleGemini",
    modulePath: "./executors/lm-chat-google-gemini",
    exportName: "lmChatGoogleGeminiExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatAnthropic",
    modulePath: "./executors/lm-chat-anthropic",
    exportName: "lmChatAnthropicExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatOllama",
    modulePath: "./executors/lm-chat-ollama",
    exportName: "lmChatOllamaExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatOpenRouter",
    modulePath: "./executors/lm-chat-open-router",
    exportName: "lmChatOpenRouterExecutor",
  },
  {
    type: "openflow-node-langchain.agent",
    modulePath: "./executors/langchain-agent",
    exportName: "langchainAgentExecutor",
  },
  {
    type: "openflow-node-langchain.chainRetrievalQa",
    modulePath: "./executors/langchain-chain-retrieval-qa",
    exportName: "langchainChainRetrievalQaExecutor",
  },
  {
    type: "openflow-node-langchain.chainSummarization",
    modulePath: "./executors/langchain-chain-summarization",
    exportName: "langchainChainSummarizationExecutor",
  },
  {
    type: "openflow-node-langchain.chainLlm",
    modulePath: "./executors/chain-llm",
    exportName: "chainLlmExecutor",
  },
  {
    type: "openflow-node-langchain.outputParserStructured",
    modulePath: "./executors/langchain-output-parser-structured",
    exportName: "langchainOutputParserStructuredExecutor",
  },
  {
    type: "openflow-node-langchain.outputParserItemList",
    modulePath: "./executors/langchain-output-parser-item-list",
    exportName: "langchainOutputParserItemListExecutor",
  },
  {
    type: "openflow-node-langchain.outputParserAutofixing",
    modulePath: "./executors/langchain-output-parser-autofixing",
    exportName: "langchainOutputParserAutofixingExecutor",
  },
  {
    type: "openflow-node-langchain.memoryBufferWindow",
    modulePath: "./executors/memory-buffer-window",
    exportName: "memoryBufferWindowExecutor",
  },
  {
    type: "openflow-node-langchain.mcpClientTool",
    modulePath: "./executors/mcp-client-tool",
    exportName: "mcpClientToolExecutor",
  },
  {
    type: "openflow-node-langchain.mcpTrigger",
    modulePath: "./executors/mcp-trigger",
    exportName: "mcpTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.microsoftAgent365Trigger",
    modulePath: "./executors/microsoft-agent-365-trigger",
    exportName: "microsoftAgent365TriggerExecutor",
  },
  {
    type: "openflow-node-base.stickyNote",
    modulePath: "./executors/sticky-note",
    exportName: "stickyNoteExecutor",
  },
  {
    type: "openflow.inspectTable",
    modulePath: "./executors/inspect-canvas",
    exportName: "inspectTableExecutor",
  },
  {
    type: "openflow.inspectMedia",
    modulePath: "./executors/inspect-canvas",
    exportName: "inspectMediaExecutor",
  },
  {
    type: "openflow-node-base.crypto",
    modulePath: "./executors/crypto",
    exportName: "cryptoExecutor",
  },
  {
    type: "openflow-node-base.xml",
    modulePath: "./executors/xml",
    exportName: "xmlExecutor",
  },
  {
    type: "openflow-node-base.x",
    modulePath: "./executors/xml",
    exportName: "xmlExecutor",
  },
  {
    type: "openflow-node-base.html",
    modulePath: "./executors/html",
    exportName: "htmlExecutor",
  },
  {
    type: "openflow-node-base.markdown",
    modulePath: "./executors/markdown",
    exportName: "markdownExecutor",
  },
  {
    type: "openflow-node-base.editImage",
    modulePath: "./executors/editImage",
    exportName: "editImageExecutor",
  },
  {
    type: "openflow-node-base.jwt",
    modulePath: "./executors/jwt",
    exportName: "jwtExecutor",
  },
  {
    type: "openflow-node-base.compression",
    modulePath: "./executors/compression",
    exportName: "compressionExecutor",
  },
  {
    type: "openflow-node-base.executionData",
    modulePath: "./executors/executionData",
    exportName: "executionDataExecutor",
  },
  {
    type: "openflow-node-base.git",
    modulePath: "./executors/git",
    exportName: "gitExecutor",
  },
  {
    type: "openflow-node-base.formTrigger",
    modulePath: "./executors/form-trigger",
    exportName: "formTriggerExecutor",
  },
  {
    type: "openflow-node-base.sseTrigger",
    modulePath: "./executors/sse-trigger",
    exportName: "sseTriggerExecutor",
  },
  {
    type: "openflow-node-base.localFileTrigger",
    modulePath: "./executors/local-file-trigger",
    exportName: "localFileTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.chatTrigger",
    modulePath: "./executors/langchain-chat-trigger",
    exportName: "langchainChatTriggerExecutor",
  },
  {
    type: "openflow-node-base.workflowTrigger",
    modulePath: "./executors/workflow-trigger",
    exportName: "workflowTriggerExecutor",
  },
  {
    type: "openflow-node-base.activationTrigger",
    modulePath: "./executors/activation-trigger",
    exportName: "activationTriggerExecutor",
  },
  {
    type: "openflow-node-base.n8nTrigger",
    modulePath: "./executors/n8n-trigger",
    exportName: "n8nTriggerExecutor",
  },
  {
    type: "openflow-node-base.graphql",
    modulePath: "./executors/graphql",
    exportName: "graphqlExecutor",
  },
  {
    type: "openflow-node-base.graphqlTool",
    modulePath: "./executors/graphqlTool",
    exportName: "graphqlToolExecutor",
  },
  {
    type: "openflow-node-langchain.openAi",
    modulePath: "./executors/openai",
    exportName: "openAiExecutor",
  },
  {
    type: "openflow-node-langchain.vectorStoreInMemory",
    modulePath: "./executors/vectorStoreInMemory",
    exportName: "vectorStoreInMemoryExecutor",
  },
  {
    type: "openflow-node-langchain.vectorStoreMilvus",
    modulePath: "./executors/vectorStoreMilvus",
    exportName: "vectorStoreMilvusExecutor",
  },
  {
    type: "openflow-node-langchain.code",
    modulePath: "./executors/langchain-code",
    exportName: "langchainCodeExecutor",
  },
  {
    type: "openflow-node-langchain.documentDefaultDataLoader",
    modulePath: "./executors/langchain-document-default-data-loader",
    exportName: "langchainDocumentDefaultDataLoaderExecutor",
  },
  {
    type: "openflow-node-langchain.textSplitterRecursiveCharacterTextSplitter",
    modulePath: "./executors/langchain-text-splitter-recursive-character",
    exportName: "langchainTextSplitterRecursiveCharacterExecutor",
  },
  {
    type: "openflow-node-langchain.embeddingsCohere",
    modulePath: "./executors/embeddings-cohere",
    exportName: "embeddingsCohereExecutor",
  },
  {
    type: "openflow-node-langchain.anthropic",
    modulePath: "./executors/n8n-nodes-langchain.anthropic",
    exportName: "anthropicExecutor",
  },
  {
    type: "openflow-node-langchain.embeddingsGoogleGemini",
    modulePath: "./executors/embeddings-google-gemini",
    exportName: "embeddingsGoogleGeminiExecutor",
  },
  {
    type: "openflow-node-langchain.embeddingsOpenAi",
    modulePath: "./executors/embeddings-openai",
    exportName: "embeddingsOpenAiExecutor",
  },
  {
    type: "openflow-node-base.airtable",
    modulePath: "./executors/n8n-nodes-base.airtable",
    exportName: "airtableExecutor",
  },
  {
    type: "openflow-node-base.notion",
    modulePath: "./executors/notion",
    exportName: "notionExecutor",
  },
  {
    type: "openflow-node-base.notionTool",
    modulePath: "./executors/n8n-nodes-base.notionTool",
    exportName: "notionToolExecutor",
  },
  {
    type: "openflow-node-base.googleDriveTool",
    modulePath: "./executors/n8n-nodes-base.googleDriveTool",
    exportName: "googleDriveToolExecutor",
  },
  {
    type: "openflow-node-base.whatsApp",
    modulePath: "./executors/n8n-nodes-base.whatsApp",
    exportName: "whatsAppExecutor",
  },
  {
    type: "openflow-node-base.telegram",
    modulePath: "./executors/telegram",
    exportName: "telegramExecutor",
  },
  {
    type: "openflow-node-base.telegramTool",
    modulePath: "./executors/n8n-nodes-base.telegramTool",
    exportName: "telegramToolExecutor",
  },
  {
    type: "openflow-node-base.webflow",
    modulePath: "./executors/webflow",
    exportName: "webflowExecutor",
  },
  {
    type: "openflow-node-base.gmail",
    modulePath: "./executors/n8n-nodes-base.gmail",
    exportName: "gmailExecutor",
  },
  {
    type: "openflow-node-base.slack",
    modulePath: "./executors/n8n-nodes-base.slack",
    exportName: "slackExecutor",
  },
  {
    type: "openflow-node-base.discord",
    modulePath: "./executors/n8n-nodes-base.discord",
    exportName: "discordExecutor",
  },
  {
    type: "openflow-node-base.discordTool",
    modulePath: "./executors/n8n-nodes-base.discordTool",
    exportName: "discordToolExecutor",
  },
  {
    type: "openflow-node-base.jira",
    modulePath: "./executors/n8n-nodes-base.jira",
    exportName: "jiraExecutor",
  },
  {
    type: "openflow-node-base.jiraTool",
    modulePath: "./executors/n8n-nodes-base.jiraTool",
    exportName: "jiraToolExecutor",
  },
  {
    type: "openflow-node-base.twilio",
    modulePath: "./executors/n8n-nodes-base.twilio",
    exportName: "twilioExecutor",
  },
  {
    type: "openflow-node-base.googleSheets",
    modulePath: "./executors/n8n-nodes-base.googleSheets",
    exportName: "googleSheetsExecutor",
  },
  {
    type: "openflow-node-base.googleDocs",
    modulePath: "./executors/n8n-nodes-base.googleDocs",
    exportName: "googleDocsExecutor",
  },
  {
    type: "openflow-node-base.googleCalendar",
    modulePath: "./executors/google-calendar",
    exportName: "googleCalendarExecutor",
  },
  {
    type: "openflow-node-base.youTube",
    modulePath: "./executors/youTube",
    exportName: "youTubeExecutor",
  },
  {
    type: "openflow-node-base.postgres",
    modulePath: "./executors/postgres",
    exportName: "postgresExecutor",
  },
  {
    type: "openflow-node-base.mySql",
    modulePath: "./executors/mySql",
    exportName: "mySqlExecutor",
  },
  {
    type: "openflow-node-base.mySqlTool",
    modulePath: "./executors/MySqlTool",
    exportName: "mySqlToolExecutor",
  },
  {
    type: "openflow-node-base.s3",
    modulePath: "./executors/s3",
    exportName: "s3Executor",
  },
  {
    type: "openflow-node-base.redis",
    modulePath: "./executors/redis",
    exportName: "redisExecutor",
  },
  {
    type: "openflow-node-base.hubspot",
    modulePath: "./executors/hubspot",
    exportName: "hubspotExecutor",
  },
  {
    type: "openflow-node-base.mongoDb",
    modulePath: "./executors/mongo-db",
    exportName: "mongoDbExecutor",
  },
  {
    type: "openflow-node-base.supabase",
    modulePath: "./executors/supabase",
    exportName: "supabaseExecutor",
  },
  {
    type: "openflow-node-base.supabaseTool",
    modulePath: "./executors/SupabaseTool",
    exportName: "supabaseToolExecutor",
  },
  {
    type: "openflow-node-base.facebookGraphApi",
    modulePath: "./executors/facebook-graph-api",
    exportName: "facebookGraphApiExecutor",
  },
  {
    type: "openflow-node-base.wordpress",
    modulePath: "./executors/wordpress",
    exportName: "wordpressExecutor",
  },
  {
    type: "openflow-node-base.debugHelper",
    modulePath: "./executors/debug-helper",
    exportName: "debugHelperExecutor",
  },
  {
    type: "openflow-node-base.executeCommand",
    modulePath: "./executors/execute-command",
    exportName: "executeCommandExecutor",
  },
  {
    type: "openflow-node-base.ansible",
    modulePath: "./executors/ansible",
    exportName: "ansibleExecutor",
  },
  {
    type: "openflow-node-base.ansibleTool",
    modulePath: "./executors/ansibleTool",
    exportName: "ansibleToolExecutor",
  },
  {
    type: "openflow-node-base.n8n",
    modulePath: "./executors/n8n",
    exportName: "n8nExecutor",
  },
  {
    type: "openflow-node-base.hackerNews",
    modulePath: "./executors/hacker-news",
    exportName: "hackerNewsExecutor",
  },
  {
    type: "openflow-node-base.hackerNewsTool",
    modulePath: "./executors/n8n-nodes-base.hackerNewsTool",
    exportName: "hackerNewsToolExecutor",
  },
  {
    type: "openflow-node-base.marketstackTool",
    modulePath: "./executors/n8n-nodes-base.marketstackTool",
    exportName: "marketstackToolExecutor",
  },
  {
    type: "openflow-node-base.evaluation",
    modulePath: "./executors/evaluation",
    exportName: "evaluationExecutor",
  },
  {
    type: "openflow-node-base.evaluationTrigger",
    modulePath: "./executors/evaluation-trigger",
    exportName: "evaluationTriggerExecutor",
  },
  {
    type: "openflow-node-base.form",
    modulePath: "./executors/form",
    exportName: "formExecutor",
  },
  {
    type: "openflow-node-base.gmailTrigger",
    modulePath: "./executors/gmail-trigger",
    exportName: "gmailTriggerExecutor",
  },
  {
    type: "openflow-node-base.totp",
    modulePath: "./executors/totp",
    exportName: "totpExecutor",
  },
  {
    type: "openflow-node-base.timeSaved",
    modulePath: "./executors/n8n-nodes-base.timeSaved",
    exportName: "timeSavedExecutor",
  },
  {
    type: "openflow-node-base.ldap",
    modulePath: "./executors/ldap",
    exportName: "ldapExecutor",
    unavailable: {
      setter: "setLdapClientFactory",
      reason: "Directory queries need an LDAP client (e.g. ldapjs), which is not bundled in this build.",
    },
  },
  {
    type: "openflow-node-base.iCalendar",
    modulePath: "./executors/iCalendar",
    exportName: "iCalendarExecutor",
  },
  {
    type: "openflow-node-base.quickChart",
    modulePath: "./executors/quick-chart",
    exportName: "quickChartExecutor",
  },
  {
    type: "openflow-node-base.quickChartTool",
    modulePath: "./executors/quickChartTool",
    exportName: "quickChartToolExecutor",
  },
  {
    type: "openflow-node-mcp.mcpClientTool",
    modulePath: "./executors/mcp-community-client",
    exportName: "mcpCommunityClientExecutor",
  },
  {
    type: "openflow-node-base.awsS3",
    modulePath: "./executors/awsS3",
    exportName: "awsS3Executor",
  },
  {
    type: "openflow-node-base.awsS3Tool",
    modulePath: "./executors/awsS3Tool",
    exportName: "awsS3ToolExecutor",
  },
  {
    type: "openflow-node-base.homeAssistant",
    modulePath: "./executors/home-assistant",
    exportName: "homeAssistantExecutor",
  },
  {
    type: "openflow-node-base.mailgun",
    modulePath: "./executors/mailgun",
    exportName: "mailgunExecutor",
  },
  {
    type: "openflow-node-base.mattermost",
    modulePath: "./executors/n8n-nodes-base.mattermost",
    exportName: "mattermostExecutor",
  },
  {
    type: "openflow-node-base.googleSlides",
    modulePath: "./executors/n8n-nodes-base.googleSlides",
    exportName: "googleSlidesExecutor",
  },
  {
    type: "openflow-node-base.matrix",
    modulePath: "./executors/matrix",
    exportName: "matrixExecutor",
  },
  {
    type: "openflow-node-base.rocketchat",
    modulePath: "./executors/rocketchat",
    exportName: "rocketchatExecutor",
  },
  {
    type: "openflow-node-base.gotify",
    modulePath: "./executors/gotify",
    exportName: "gotifyExecutor",
  },
  {
    type: "openflow-node-base.gotifyTool",
    modulePath: "./executors/gotifyTool",
    exportName: "gotifyToolExecutor",
  },
  {
    type: "openflow-node-base.pushbullet",
    modulePath: "./executors/pushbullet",
    exportName: "pushbulletExecutor",
  },
  {
    type: "openflow-node-base.pushover",
    modulePath: "./executors/pushover",
    exportName: "pushoverExecutor",
  },
  {
    type: "openflow-node-base.messageBird",
    modulePath: "./executors/message-bird",
    exportName: "messageBirdExecutor",
  },
  {
    type: "openflow-node-base.sms77",
    modulePath: "./executors/n8n-nodes-base.sms77",
    exportName: "sms77Executor",
  },
  {
    type: "openflow-node-base.sms77Tool",
    modulePath: "./executors/sms77Tool",
    exportName: "sms77ToolExecutor",
  },
  {
    type: "openflow-node-base.sendGrid",
    modulePath: "./executors/n8n-nodes-base.sendGrid",
    exportName: "sendGridExecutor",
  },
  {
    type: "openflow-node-base.sendInBlue",
    modulePath: "./executors/sendInBlue",
    exportName: "sendInBlueExecutor",
  },
  {
    type: "openflow-node-base.mailjet",
    modulePath: "./executors/mailjet",
    exportName: "mailjetExecutor",
  },
  {
    type: "openflow-node-base.mailchimp",
    modulePath: "./executors/mailchimp",
    exportName: "mailchimpExecutor",
  },
  {
    type: "openflow-node-base.postmarkTrigger",
    modulePath: "./executors/postmark-trigger",
    exportName: "postmarkTriggerExecutor",
  },
  {
    type: "openflow-node-base.emailReadImap",
    modulePath: "./executors/email-read-imap",
    exportName: "emailReadImapExecutor",
    unavailable: {
      setter: "setImapTransportFactory",
      reason: "Reading mail needs an IMAP client (e.g. imapflow), which is not bundled in this build.",
    },
  },
  {
    type: "openflow-node-base.microsoftOneDrive",
    modulePath: "./executors/microsoft-one-drive",
    exportName: "microsoftOneDriveExecutor",
  },
  {
    type: "openflow-node-base.microsoftExcel",
    modulePath: "./executors/microsoft-excel",
    exportName: "microsoftExcelExecutor",
  },
  {
    type: "openflow-node-base.microsoftSharePoint",
    modulePath: "./executors/microsoft-sharepoint",
    exportName: "microsoftSharePointExecutor",
  },
  {
    type: "openflow-node-base.microsoftSql",
    modulePath: "./executors/microsoftSql",
    exportName: "microsoftSqlExecutor",
  },
  {
    type: "openflow-node-base.microsoftEntra",
    modulePath: "./executors/microsoft-entra",
    exportName: "microsoftEntraExecutor",
  },
  {
    type: "openflow-node-base.googleAnalytics",
    modulePath: "./executors/google-analytics",
    exportName: "googleAnalyticsExecutor",
  },
  {
    type: "openflow-node-base.microsoftTeams",
    modulePath: "./executors/microsoft-teams",
    exportName: "microsoftTeamsExecutor",
  },
  {
    type: "openflow-node-base.microsoftToDo",
    modulePath: "./executors/microsoft-to-do",
    exportName: "microsoftToDoExecutor",
  },
  {
    type: "openflow-node-base.microsoftToDoTool",
    modulePath: "./executors/n8n-nodes-base.microsoftToDoTool",
    exportName: "microsoftToDoToolExecutor",
  },
  {
    type: "openflow-node-base.googleTasks",
    modulePath: "./executors/n8n-nodes-base.googleTasks",
    exportName: "googleTasksExecutor",
  },
  {
    type: "openflow-node-base.googleContacts",
    modulePath: "./executors/google-contacts",
    exportName: "googleContactsExecutor",
  },
  {
    type: "openflow-node-base.googleTranslate",
    modulePath: "./executors/google-translate",
    exportName: "googleTranslateExecutor",
  },
  {
    type: "openflow-node-base.googleAds",
    modulePath: "./executors/google-ads",
    exportName: "googleAdsExecutor",
  },
  {
    type: "openflow-node-base.googleBigQuery",
    modulePath: "./executors/google-bigquery",
    exportName: "googleBigQueryExecutor",
  },
  {
    type: "openflow-node-base.googleBusinessProfile",
    modulePath: "./executors/google-business-profile",
    exportName: "googleBusinessProfileExecutor",
  },
  {
    type: "openflow-node-base.googleBusinessProfileTrigger",
    modulePath: "./executors/google-business-profile-trigger",
    exportName: "googleBusinessProfileTriggerExecutor",
  },
  {
    type: "openflow-node-base.googleCloudStorage",
    modulePath: "./executors/google-cloud-storage",
    exportName: "googleCloudStorageExecutor",
  },
  {
    type: "openflow-node-base.gSuiteAdmin",
    modulePath: "./executors/g-suite-admin",
    exportName: "gSuiteAdminExecutor",
  },
  {
    type: "openflow-node-base.gSuiteAdminTool",
    modulePath: "./executors/g-suite-admin-tool",
    exportName: "gSuiteAdminToolExecutor",
  },
  {
    type: "openflow-node-base.googleChat",
    modulePath: "./executors/googleChat",
    exportName: "googleChatExecutor",
  },
  {
    type: "openflow-node-base.clickUp",
    modulePath: "./executors/clickUp",
    exportName: "clickUpExecutor",
  },
  {
    type: "openflow-node-base.clickUpTool",
    modulePath: "./executors/n8n-nodes-base.clickUpTool",
    exportName: "clickUpToolExecutor",
  },
  {
    type: "openflow-node-base.trello",
    modulePath: "./executors/trello",
    exportName: "trelloExecutor",
  },
  {
    type: "openflow-node-base.asana",
    modulePath: "./executors/asana",
    exportName: "asanaExecutor",
  },
  {
    type: "openflow-node-base.asanaTool",
    modulePath: "./executors/n8n-nodes-base.asanaTool",
    exportName: "asanaToolExecutor",
  },
  {
    type: "openflow-node-base.githubTrigger",
    modulePath: "./executors/github-trigger",
    exportName: "githubTriggerExecutor",
  },
  {
    type: "openflow-node-base.mondayCom",
    modulePath: "./executors/monday-com",
    exportName: "mondayComExecutor",
  },
  {
    type: "openflow-node-base.todoist",
    modulePath: "./executors/todoist",
    exportName: "todoistExecutor",
  },
  {
    type: "openflow-node-base.linear",
    modulePath: "./executors/linear",
    exportName: "linearExecutor",
  },
  {
    type: "openflow-node-base.gitlab",
    modulePath: "./executors/gitlab",
    exportName: "gitlabExecutor",
  },
  {
    type: "openflow-node-base.gitlabTrigger",
    modulePath: "./executors/gitlab-trigger",
    exportName: "gitlabTriggerExecutor",
  },
  {
    type: "openflow-node-base.bitbucketTrigger",
    modulePath: "./executors/bitbucket-trigger",
    exportName: "bitbucketTriggerExecutor",
  },
  {
    type: "openflow-node-base.jenkins",
    modulePath: "./executors/jenkins",
    exportName: "jenkinsExecutor",
  },
  {
    type: "openflow-node-base.circleCi",
    modulePath: "./executors/circle-ci",
    exportName: "circleCiExecutor",
  },
  {
    type: "openflow-node-base.salesforce",
    modulePath: "./executors/salesforce",
    exportName: "salesforceExecutor",
  },
  {
    type: "openflow-node-base.salesforceTool",
    modulePath: "./executors/n8n-nodes-base.salesforceTool",
    exportName: "salesforceToolExecutor",
  },
  {
    type: "openflow-node-base.pipedrive",
    modulePath: "./executors/pipedrive",
    exportName: "pipedriveExecutor",
  },
  {
    type: "openflow-node-base.pipedriveTool",
    modulePath: "./executors/n8n-nodes-base.pipedriveTool",
    exportName: "pipedriveToolExecutor",
  },
  {
    type: "openflow-node-base.zammad",
    modulePath: "./executors/n8n-nodes-base.zammad",
    exportName: "zammadExecutor",
  },
  {
    type: "openflow-node-base.zendesk",
    modulePath: "./executors/zendesk",
    exportName: "zendeskExecutor",
  },
  {
    type: "openflow-node-base.zendeskTool",
    modulePath: "./executors/n8n-nodes-base.zendeskTool",
    exportName: "zendeskToolExecutor",
  },
  {
    type: "openflow-node-base.zendeskTrigger",
    modulePath: "./executors/zendesk-trigger",
    exportName: "zendeskTriggerExecutor",
  },
  {
    type: "openflow-node-base.zohoCrm",
    modulePath: "./executors/zoho-crm",
    exportName: "zohoCrmExecutor",
  },
  {
    type: "openflow-node-base.highLevel",
    modulePath: "./executors/highLevel",
    exportName: "highLevelExecutor",
  },
  {
    type: "openflow-node-base.odoo",
    modulePath: "./executors/odoo",
    exportName: "odooExecutor",
  },
  {
    type: "openflow-node-base.hubspotTrigger",
    modulePath: "./executors/hubspot-trigger",
    exportName: "hubspotTriggerExecutor",
  },
  {
    type: "openflow-node-base.wooCommerce",
    modulePath: "./executors/woo-commerce",
    exportName: "wooCommerceExecutor",
  },
  {
    type: "openflow-node-base.shopify",
    modulePath: "./executors/shopify",
    exportName: "shopifyExecutor",
  },
  {
    type: "openflow-node-base.stripe",
    modulePath: "./executors/n8n-nodes-base.stripe",
    exportName: "stripeExecutor",
  },
  {
    type: "openflow-node-base.stripeTool",
    modulePath: "./executors/n8n-nodes-base.stripeTool",
    exportName: "stripeToolExecutor",
  },
{
    type: "openflow-node-base.snowflake",
    modulePath: "./executors/n8n-nodes-base.snowflake",
    exportName: "snowflakeExecutor",
  },
  {
    type: "openflow-node-base.kafka",
    modulePath: "./executors/kafkaNode",
    exportName: "kafkaExecutor",
  },
  {
    type: "openflow-node-base.mqtt",
    modulePath: "./executors/mqtt",
    exportName: "mqttExecutor",
  },
  {
    type: "openflow-node-base.rabbitmqTrigger",
    modulePath: "./executors/rabbitmqTrigger",
    exportName: "rabbitmqTriggerExecutor",
  },
  {
    type: "openflow-node-base.nocoDb",
    modulePath: "./executors/n8n-nodes-base.nocoDb",
    exportName: "nocoDbExecutor",
  },
  {
    type: "openflow-node-base.stripeTrigger",
    modulePath: "./executors/stripe-trigger",
    exportName: "stripeTriggerExecutor",
  },
  {
    type: "openflow-node-base.quickbaseTool",
    modulePath: "./executors/quickbaseTool",
    exportName: "quickbaseToolExecutor",
  },
  {
    type: "openflow-node-base.quickbooks",
    modulePath: "./executors/n8n-nodes-base.quickbooks",
    exportName: "quickbooksExecutor",
  },
  {
    type: "openflow-node-base.xero",
    modulePath: "./executors/n8n-nodes-base.xero",
    exportName: "xeroExecutor",
  },
  {
    type: "openflow-node-base.payPal",
    modulePath: "./executors/n8n-nodes-base.payPal",
    exportName: "payPalExecutor",
  },
  {
    type: "openflow-node-base.pagerDuty",
    modulePath: "./executors/pagerDuty",
    exportName: "pagerDutyExecutor",
  },
  {
    type: "openflow-node-base.pagerDutyTool",
    modulePath: "./executors/n8n-nodes-base.pagerDutyTool",
    exportName: "pagerDutyToolExecutor",
  },
  {
    type: "openflow-node-base.baserow",
    modulePath: "./executors/n8n-nodes-base.baserow",
    exportName: "baserowExecutor",
  },
  {
    type: "openflow-node-base.dropbox",
    modulePath: "./executors/n8n-nodes-base.dropbox",
    exportName: "dropboxExecutor",
  },
  {
    type: "openflow-node-base.nextCloud",
    modulePath: "./executors/nextCloud",
    exportName: "nextCloudExecutor",
  },
  {
    type: "openflow-node-base.awsLambda",
    modulePath: "./executors/aws-lambda",
    exportName: "awsLambdaExecutor",
  },
  {
    type: "openflow-node-base.awsSes",
    modulePath: "./executors/n8n-nodes-base.awsSes",
    exportName: "awsSesExecutor",
  },
  {
    type: "openflow-node-base.awsIam",
    modulePath: "./executors/n8n-nodes-base.awsIam",
    exportName: "awsIamExecutor",
  },
  {
    type: "openflow-node-base.elasticsearch",
    modulePath: "./executors/elasticsearch",
    exportName: "elasticsearchExecutor",
  },
  {
    type: "openflow-node-base.rabbitmq",
    modulePath: "./executors/rabbitmq",
    exportName: "rabbitmqExecutor",
  },
  {
    type: "openflow-node-base.amqp",
    modulePath: "./executors/amqp",
    exportName: "amqpExecutor",
  },
  {
    // Not `unavailable`: redisTrigger.ts ships a real lazy-import default over
    // ioredis (a declared dependency), exactly like the redis executor.
    type: "openflow-node-base.redisTrigger",
    modulePath: "./executors/redisTrigger",
    exportName: "redisTriggerExecutor",
  },
  {
    type: "openflow-node-base.postgresTrigger",
    modulePath: "./executors/postgres-trigger",
    exportName: "postgresTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.modelSelector",
    modulePath: "./executors/langchain-model-selector",
    exportName: "langchainModelSelectorExecutor",
  },
  {
    type: "openflow-node-langchain.guardrails",
    modulePath: "./executors/guardrails",
    exportName: "guardrailsExecutor",
  },
  {
    type: "openflow-node-base.httpRequestTool",
    modulePath: "./executors/httpRequestTool",
    exportName: "httpRequestToolExecutor",
  },
  {
    type: "openflow-node-base.gmailTool",
    modulePath: "./executors/n8n-nodes-base.gmailTool",
    exportName: "gmailToolExecutor",
  },
  {
    type: "openflow-node-base.googleSheetsTool",
    modulePath: "./executors/n8n-nodes-base.googleSheetsTool",
    exportName: "googleSheetsToolExecutor",
  },
  {
    type: "openflow-node-base.googleCalendarTool",
    modulePath: "./executors/n8n-nodes-base.googleCalendarTool",
    exportName: "googleCalendarToolExecutor",
  },
  {
    type: "openflow-node-base.googleTasksTool",
    modulePath: "./executors/n8n-nodes-base.googleTasksTool",
    exportName: "googleTasksToolExecutor",
  },
  {
    type: "openflow-node-base.wooCommerceTool",
    modulePath: "./executors/n8n-nodes-base.wooCommerceTool",
    exportName: "wooCommerceToolExecutor",
  },
  {
    type: "openflow-node-base.cryptoTool",
    modulePath: "./executors/cryptoTool",
    exportName: "cryptoToolExecutor",
  },
  {
    type: "openflow-node-base.rssFeedReadTool",
    modulePath: "./executors/rssFeedReadTool",
    exportName: "rssFeedReadToolExecutor",
  },
  {
    type: "openflow-node-base.dateTimeTool",
    modulePath: "./executors/dateTimeTool",
    exportName: "dateTimeToolExecutor",
  },
  {
    type: "openflow-node-langchain.toolSearXng",
    modulePath: "./executors/tool-searxng",
    exportName: "toolSearXngExecutor",
  },
  {
    type: "openflow-node-langchain.toolWikipedia",
    modulePath: "./executors/toolWikipedia",
    exportName: "toolWikipediaExecutor",
  },
  {
    type: "openflow-node-langchain.toolWolframAlpha",
    modulePath: "./executors/tool-wolfram-alpha",
    exportName: "toolWolframAlphaExecutor",
  },
  {
    type: "openflow-node-langchain.retrieverVectorStore",
    modulePath: "./executors/retrieverVectorStore",
    exportName: "retrieverVectorStoreExecutor",
  },
  {
    type: "openflow-node-langchain.memoryManager",
    modulePath: "./executors/n8n-nodes-langchain.memoryManager",
    exportName: "n8nNodesLangchainMemoryManagerExecutor",
  },
  {
    type: "openflow-node-base.chargebeeTrigger",
    modulePath: "./executors/n8n-nodes-base.chargebeeTrigger",
    exportName: "chargebeeTriggerExecutor",
  },
  {
    type: "openflow-node-base.convertKitTrigger",
    modulePath: "./executors/convertKitTrigger",
    exportName: "convertKitTriggerExecutor",
  },
  {
    type: "openflow-node-base.perplexity",
    modulePath: "./executors/perplexity",
    exportName: "perplexityExecutor",
  },
  {
    type: "openflow-node-base.telegramTrigger",
    modulePath: "./executors/telegram-trigger",
    exportName: "telegramTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.googleGemini",
    modulePath: "./executors/google-gemini",
    exportName: "googleGeminiExecutor",
  },
  {
    type: "openflow-node-base.googleDrive",
    modulePath: "./executors/googleDrive",
    exportName: "googleDriveExecutor",
  },
  {
    type: "openflow-node-base.googleDriveTrigger",
    modulePath: "./executors/google-drive-trigger",
    exportName: "googleDriveTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.toolWorkflow",
    modulePath: "./executors/toolWorkflow",
    exportName: "toolWorkflowExecutor",
  },
  {
    type: "openflow-node-langchain.informationExtractor",
    modulePath: "./executors/langchain-information-extractor",
    exportName: "langchainInformationExtractorExecutor",
  },
  {
    type: "openflow-node-base.salesmateTool",
    modulePath: "./executors/salesmateTool",
    exportName: "salesmateToolExecutor",
  },
  {
    type: "openflow-node-base.googleSheetsTrigger",
    modulePath: "./executors/google-sheets-trigger",
    exportName: "googleSheetsTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatGroq",
    modulePath: "./executors/lm-chat-groq",
    exportName: "lmChatGroqExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatMistralCloud",
    modulePath: "./executors/lm-chat-mistral-cloud",
    exportName: "lmChatMistralCloudExecutor",
  },
  {
    type: "openflow-node-langchain.toolThink",
    modulePath: "./executors/toolThink",
    exportName: "toolThinkExecutor",
  },
  {
    type: "openflow-node-langchain.vectorStoreSupabase",
    modulePath: "./executors/vectorStoreSupabase",
    exportName: "vectorStoreSupabaseExecutor",
  },
  {
    type: "openflow-node-langchain.vectorStorePinecone",
    modulePath: "./executors/vectorStorePinecone",
    exportName: "vectorStorePineconeExecutor",
  },
  {
    type: "openflow-node-langchain.toolCalculator",
    modulePath: "./executors/toolCalculator",
    exportName: "toolCalculatorExecutor",
  },
  {
    type: "openflow-node-langchain.toolNodeCatalog",
    modulePath: "./executors/toolNodeCatalog",
    exportName: "toolNodeCatalogExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatDeepSeek",
    modulePath: "./executors/lm-chat-deepseek",
    exportName: "lmChatDeepSeekExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatAzureOpenAi",
    modulePath: "./executors/lm-chat-azure-openai",
    exportName: "lmChatAzureOpenAiExecutor",
  },
  {
    type: "openflow-node-langchain.agentTool",
    modulePath: "./executors/langchain-agent-tool",
    exportName: "langchainAgentToolExecutor",
  },
  {
    type: "openflow-node-base.linkedIn",
    modulePath: "./executors/linkedin",
    exportName: "linkedInExecutor",
  },
  {
    type: "openflow-node-langchain.textClassifier",
    modulePath: "./executors/langchain-text-classifier",
    exportName: "langchainTextClassifierExecutor",
  },
  {
    type: "openflow-node-base.whatsAppTrigger",
    modulePath: "./executors/whatsapp-trigger",
    exportName: "whatsAppTriggerExecutor",
  },
  {
    type: "openflow-node-base.github",
    modulePath: "./executors/github",
    exportName: "githubExecutor",
  },
  {
    type: "openflow-node-base.twitter",
    modulePath: "./executors/twitter",
    exportName: "twitterExecutor",
  },
  {
    type: "openflow-node-base.twitterTool",
    modulePath: "./executors/twitterTool",
    exportName: "twitterToolExecutor",
  },
  {
    type: "openflow-node-base.microsoftOutlook",
    modulePath: "./executors/microsoft-outlook",
    exportName: "microsoftOutlookExecutor",
  },
  {
    type: "openflow-node-base.openThesaurus",
    modulePath: "./executors/openThesaurus",
    exportName: "openThesaurusExecutor",
  },
  {
    type: "openflow-node-base.openAi",
    modulePath: "./executors/openai",
    exportName: "openAiExecutor",
  },
  {
    type: "openflow-node-langchain.googleGeminiTool",
    modulePath: "./executors/n8n-nodes-langchain.googleGeminiTool",
    exportName: "googleGeminiToolExecutor",
  },
  {
    type: "openflow-node-langchain.toolCode",
    modulePath: "./executors/toolCode",
    exportName: "toolCodeExecutor",
  },
  {
    type: "openflow-node-langchain.vectorStoreQdrant",
    modulePath: "./executors/vectorStoreQdrant",
    exportName: "vectorStoreQdrantExecutor",
  },
  {
    type: "openflow-node-langchain.vectorStorePGVector",
    modulePath: "./executors/vectorStorePGVector",
    exportName: "vectorStorePGVectorExecutor",
  },
  {
    type: "openflow-node-langchain.memoryPostgresChat",
    modulePath: "./executors/memory-postgres-chat",
    exportName: "memoryPostgresChatExecutor",
  },
  {
    type: "openflow-node-langchain.memoryRedisChat",
    modulePath: "./executors/memory-redis-chat",
    exportName: "memoryRedisChatExecutor",
  },
  {
    type: "openflow-node-langchain.memoryMongoDbChat",
    modulePath: "./executors/memory-mongodb-chat",
    exportName: "memoryMongoDbChatExecutor",
  },
  {
    type: "openflow-node-langchain.toolHttpRequest",
    modulePath: "./executors/toolHttpRequest",
    exportName: "toolHttpRequestExecutor",
  },
  {
    type: "openflow-node-langchain.toolVectorStore",
    modulePath: "./executors/toolVectorStore",
    exportName: "toolVectorStoreExecutor",
  },
  {
    type: "openflow-node-langchain.toolSerpApi",
    modulePath: "./executors/toolSerpApi",
    exportName: "toolSerpApiExecutor",
  },
  {
    type: "openflow-node-base.slackTrigger",
    modulePath: "./executors/slack-trigger",
    exportName: "slackTriggerExecutor",
  },
  {
    type: "openflow-node-base.jotFormTrigger",
    modulePath: "./executors/jotform-trigger",
    exportName: "jotFormTriggerExecutor",
  },
  {
    type: "openflow-node-base.reddit",
    modulePath: "./executors/reddit",
    exportName: "redditExecutor",
  },
  {
    type: "openflow-node-base.perplexityTool",
    modulePath: "./executors/n8n-nodes-base.perplexityTool",
    exportName: "perplexityToolExecutor",
  },
  {
    type: "openflow-node-base.googleDocsTool",
    modulePath: "./executors/n8n-nodes-base.googleDocsTool",
    exportName: "googleDocsToolExecutor",
  },
  {
    type: "openflow-node-base.airtableTool",
    modulePath: "./executors/n8n-nodes-base.airtableTool",
    exportName: "airtableToolExecutor",
  },
  {
    type: "openflow-node-base.airtop",
    modulePath: "./executors/n8n-nodes-base.airtop",
    exportName: "airtopExecutor",
  },
  {
    type: "openflow-node-base.airtopTool",
    modulePath: "./executors/n8n-nodes-base.airtopTool",
    exportName: "airtopToolExecutor",
  },
  {
    type: "openflow-node-base.shopifyTrigger",
    modulePath: "./executors/n8n-nodes-base.shopifyTrigger",
    exportName: "shopifyTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.sentimentAnalysis",
    modulePath: "./executors/sentimentAnalysis",
    exportName: "sentimentAnalysisExecutor",
  },
  {
    type: "openflow-node-langchain.chat",
    modulePath: "./executors/n8n-nodes-langchain.chat",
    exportName: "n8nNodesLangchainChatExecutor",
  },
  {
    type: "openflow-node-base.postgresTool",
    modulePath: "./executors/PostgresTool",
    exportName: "postgresToolExecutor",
  },
  {
    type: "openflow-node-base.typeformTrigger",
    modulePath: "./executors/n8n-nodes-base.typeformTrigger",
    exportName: "typeformTriggerExecutor",
  },
  {
    type: "openflow-node-base.slackTool",
    modulePath: "./executors/n8n-nodes-base.slackTool",
    exportName: "slackToolExecutor",
  },
  {
    type: "openflow-node-base.googleSlidesTool",
    modulePath: "./executors/n8n-nodes-base.googleSlidesTool",
    exportName: "googleSlidesToolExecutor",
  },
  {
    type: "openflow-node-langchain.rerankerCohere",
    modulePath: "./executors/reranker-cohere",
    exportName: "rerankerCohereExecutor",
  },
  {
    type: "openflow-node-base.airtableTrigger",
    modulePath: "./executors/n8n-nodes-base.airtableTrigger",
    exportName: "airtableTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.textSplitterCharacterTextSplitter",
    modulePath: "./executors/textSplitterCharacterTextSplitter",
    exportName: "textSplitterCharacterTextSplitterExecutor",
  },
  {
    type: "openflow-node-base.googleCalendarTrigger",
    modulePath: "./executors/google-calendar-trigger",
    exportName: "googleCalendarTriggerExecutor",
  },
  {
    type: "openflow-node-base.dataTableTool",
    modulePath: "./executors/n8n-nodes-base.dataTableTool",
    exportName: "dataTableToolExecutor",
  },
  {
    type: "openflow-node-base.discourse",
    modulePath: "./executors/discourse",
    exportName: "discourseExecutor",
  },
  {
    type: "openflow-node-base.hunter",
    modulePath: "./executors/n8n-nodes-base.hunter",
    exportName: "hunterExecutor",
  },
  {
    type: "openflow-node-base.notionTrigger",
    modulePath: "./executors/n8n-nodes-base.notionTrigger",
    exportName: "notionTriggerExecutor",
  },
  {
    type: "openflow-node-base.calendlyTrigger",
    modulePath: "./executors/n8n-nodes-base.calendlyTrigger",
    exportName: "calendlyTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.textSplitterTokenSplitter",
    modulePath: "./executors/textSplitterTokenSplitter",
    exportName: "textSplitterTokenSplitterExecutor",
  },
  {
    type: "openflow-node-langchain.lmOllama",
    modulePath: "./executors/lm-ollama",
    exportName: "lmOllamaExecutor",
  },
  {
    type: "openflow-node-base.microsoftOutlookTrigger",
    modulePath: "./executors/microsoft-outlook-trigger",
    exportName: "microsoftOutlookTriggerExecutor",
  },
  {
    type: "openflow-node-base.splunkTool",
    modulePath: "./executors/n8n-nodes-base.splunkTool",
    exportName: "splunkToolExecutor",
  },
  {
    type: "openflow-node-base.openWeatherMap",
    modulePath: "./executors/n8n-nodes-base.openWeatherMap",
    exportName: "openWeatherMapExecutor",
  },
  {
    type: "openflow-node-base.openWeatherMapTool",
    modulePath: "./executors/n8n-nodes-base.openWeatherMapTool",
    exportName: "openWeatherMapToolExecutor",
  },
  {
    type: "openflow-node-base.raindropTool",
    modulePath: "./executors/n8n-nodes-base.raindropTool",
    exportName: "raindropToolExecutor",
  },
  {
    type: "openflow-node-base.htmlExtract",
    modulePath: "./executors/htmlExtract",
    exportName: "htmlExtractExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatXAiGrok",
    modulePath: "./executors/lm-chat-xai-grok",
    exportName: "lmChatXAiGrokExecutor",
  },
  {
    type: "openflow-node-langchain.embeddingsOllama",
    modulePath: "./executors/embeddings-ollama",
    exportName: "embeddingsOllamaExecutor",
  },
  {
    type: "openflow-node-langchain.vectorStoreMongoDBAtlas",
    modulePath: "./executors/vectorStoreMongoDBAtlas",
    exportName: "vectorStoreMongoDBAtlasExecutor",
  },
  {
    type: "openflow-node-langchain.embeddingsMistralCloud",
    modulePath: "./executors/embeddings-mistral-cloud",
    exportName: "embeddingsMistralCloudExecutor",
  },
  {
    type: "openflow-node-base.spotify",
    modulePath: "./executors/spotify",
    exportName: "spotifyExecutor",
  },
  {
    type: "openflow-node-base.strava",
    modulePath: "./executors/n8n-nodes-base.strava",
    exportName: "stravaExecutor",
  },
  {
    type: "openflow-node-base.wooCommerceTrigger",
    modulePath: "./executors/n8n-nodes-base.wooCommerceTrigger",
    exportName: "wooCommerceTriggerExecutor",
  },
  {
    type: "openflow-node-base.Brandfetch",
    modulePath: "./executors/Brandfetch",
    exportName: "brandfetchExecutor",
  },
  {
    type: "openflow-node-base.clearbit",
    modulePath: "./executors/n8n-nodes-base.clearbit",
    exportName: "clearbitExecutor",
  },
  {
    type: "openflow-node-base.deepL",
    modulePath: "./executors/deepL",
    exportName: "deepLExecutor",
  },
  {
    type: "openflow-node-base.deepLTool",
    modulePath: "./executors/deepLTool",
    exportName: "deepLToolExecutor",
  },
  {
    type: "openflow-node-base.zoom",
    modulePath: "./executors/n8n-nodes-base.zoom",
    exportName: "zoomExecutor",
  },
  {
    type: "openflow-node-base.twilioTrigger",
    modulePath: "./executors/n8n-nodes-base.twilioTrigger",
    exportName: "twilioTriggerExecutor",
  },
  {
    type: "openflow-node-base.telegramBot",
    modulePath: "./executors/telegram",
    exportName: "telegramExecutor",
  },
  {
    type: "openflow-node-base.apiTemplateIo",
    modulePath: "./executors/ApiTemplateIoExecutor",
    exportName: "apiTemplateIoExecutor",
  },
  {
    type: "openflow-node-base.jinaAi",
    modulePath: "./executors/n8n-nodes-base.jinaAi",
    exportName: "jinaAiExecutor",
  },
  {
    type: "openflow-node-base.mistralAi",
    modulePath: "./executors/n8n-nodes-base.mistralAi",
    exportName: "mistralAiExecutor",
  },
  {
    type: "openflow-node-base.phantombuster",
    modulePath: "./executors/n8n-nodes-base.phantombuster",
    exportName: "phantombusterExecutor",
  },
  {
    type: "openflow-node-langchain.mcpClient",
    modulePath: "./executors/mcp-client",
    exportName: "mcpClientExecutor",
  },
  {
    type: "openflow-node-base.mautic",
    modulePath: "./executors/mautic",
    exportName: "mauticExecutor",
  },
  {
    type: "openflow-node-base.mauticTrigger",
    modulePath: "./executors/n8n-nodes-base.mauticTrigger",
    exportName: "mauticTriggerExecutor",
  },
  {
    type: "openflow-node-base.pipedriveTrigger",
    modulePath: "./executors/n8n-nodes-base.pipedriveTrigger",
    exportName: "pipedriveTriggerExecutor",
  },
  {
    type: "openflow-node-base.calTrigger",
    modulePath: "./executors/cal-trigger",
    exportName: "calTriggerExecutor",
  },
  {
    type: "openflow-node-base.serviceNow",
    modulePath: "./executors/serviceNow",
    exportName: "serviceNowExecutor",
  },
  {
    type: "openflow-node-base.uproc",
    modulePath: "./executors/n8n-nodes-base.uproc",
    exportName: "uprocExecutor",
  },
  {
    type: "openflow-node-base.dropcontact",
    modulePath: "./executors/n8n-nodes-base.dropcontact",
    exportName: "dropcontactExecutor",
  },
  {
    type: "openflow-node-base.highLevelTool",
    modulePath: "./executors/n8n-nodes-base.highLevelTool",
    exportName: "highLevelToolExecutor",
  },
  {
    type: "openflow-node-base.wordpressTool",
    modulePath: "./executors/n8n-nodes-base.wordpressTool",
    exportName: "wordpressToolExecutor",
  },
  {
    type: "openflow-node-base.nasa",
    modulePath: "./executors/nasa",
    exportName: "nasaExecutor",
  },
  {
    type: "openflow-node-base.hubspotTool",
    modulePath: "./executors/n8n-nodes-base.hubspotTool",
    exportName: "hubspotToolExecutor",
  },
  {
    type: "openflow-node-base.lemlist",
    modulePath: "./executors/n8n-nodes-base.lemlist",
    exportName: "lemlistExecutor",
  },
  {
    type: "openflow-node-base.githubTool",
    modulePath: "./executors/n8n-nodes-base.githubTool",
    exportName: "githubToolExecutor",
  },
  {
    type: "openflow-node-base.webflowTrigger",
    modulePath: "./executors/n8n-nodes-base.webflowTrigger",
    exportName: "webflowTriggerExecutor",
  },
  {
    type: "openflow-node-base.figmaTrigger",
    modulePath: "./executors/n8n-nodes-base.figmaTrigger",
    exportName: "figmaTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatGoogleVertex",
    modulePath: "./executors/lm-chat-google-vertex",
    exportName: "lmChatGoogleVertexExecutor",
  },
  {
    type: "openflow-node-base.clickUpTrigger",
    modulePath: "./executors/clickUpTrigger",
    exportName: "clickUpTriggerExecutor",
  },
  {
    type: "openflow-node-base.jiraTrigger",
    modulePath: "./executors/jira-trigger",
    exportName: "jiraTriggerExecutor",
  },
  {
    type: "openflow-node-base.googleCloudNaturalLanguage",
    modulePath: "./executors/googleCloudNaturalLanguage",
    exportName: "googleCloudNaturalLanguageExecutor",
  },
  {
    type: "openflow-node-base.jinaAiTool",
    modulePath: "./executors/jinaAiTool",
    exportName: "jinaAiToolExecutor",
  },
  {
    type: "openflow-node-base.salesforceTrigger",
    modulePath: "./executors/n8n-nodes-base.salesforceTrigger",
    exportName: "salesforceTriggerExecutor",
  },
  {
    type: "openflow-node-base.telegramHitlTool",
    modulePath: "./executors/n8n-nodes-base.telegramHitlTool",
    exportName: "telegramHitlToolExecutor",
  },
  {
    type: "openflow-node-base.slackHitlTool",
    modulePath: "./executors/n8n-nodes-base.slackHitlTool",
    exportName: "slackHitlToolExecutor",
  },
  {
    type: "openflow-node-base.todoistTool",
    modulePath: "./executors/n8n-nodes-base.todoistTool",
    exportName: "todoistToolExecutor",
  },
  {
    type: "openflow-node-langchain.vectorStoreWeaviate",
    modulePath: "./executors/vectorStoreWeaviate",
    exportName: "vectorStoreWeaviateExecutor",
  },
  {
    type: "openflow-node-base.emailSendTool",
    modulePath: "./executors/emailSendTool",
    exportName: "emailSendToolExecutor",
  },
  {
    type: "openflow-node-base.facebookLeadAdsTrigger",
    modulePath: "./executors/n8n-nodes-base.facebookLeadAdsTrigger",
    exportName: "facebookLeadAdsTriggerExecutor",
  },
  {
    type: "openflow-node-base.linearTrigger",
    modulePath: "./executors/linearTrigger",
    exportName: "linearTriggerExecutor",
  },
  {
    type: "openflow-node-base.microsoftOutlookTool",
    modulePath: "./executors/n8n-nodes-base.microsoftOutlookTool",
    exportName: "microsoftOutlookToolExecutor",
  },
  {
    type: "openflow-node-base.mqttTrigger",
    modulePath: "./executors/mqttTrigger",
    exportName: "mqttTriggerExecutor",
  },
  {
    type: "openflow-node-base.shopifyTool",
    modulePath: "./executors/n8n-nodes-base.shopifyTool",
    exportName: "shopifyToolExecutor",
  },
  {
    type: "openflow-node-base.trelloTrigger",
    modulePath: "./executors/trelloTrigger",
    exportName: "trelloTriggerExecutor",
  },
  {
    type: "openflow-node-langchain.embeddingsAzureOpenAi",
    modulePath: "./executors/embeddings-azure-openai",
    exportName: "embeddingsAzureOpenAiExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatAwsBedrock",
    modulePath: "./executors/lm-chat-aws-bedrock",
    exportName: "lmChatAwsBedrockExecutor",
  },
  {
    type: "openflow-node-langchain.manualChatTrigger",
    modulePath: "./executors/langchain-manual-chat-trigger",
    exportName: "langchainManualChatTriggerExecutor",
  },
  {
    type: "openflow-node-base.bambooHr",
    modulePath: "./executors/n8n-nodes-base.bambooHr",
    exportName: "bambooHrExecutor",
  },
  {
    type: "openflow-node-base.bannerbear",
    modulePath: "./executors/BannerbearExecutor",
    exportName: "bannerbearExecutor",
  },
  {
    type: "openflow-node-base.baserowTool",
    modulePath: "./executors/baserowTool",
    exportName: "baserowToolExecutor",
  },
  {
    type: "openflow-node-base.box",
    modulePath: "./executors/box",
    exportName: "boxExecutor",
  },
  {
    type: "openflow-node-base.googleContactsTool",
    modulePath: "./executors/n8n-nodes-base.googleContactsTool",
    exportName: "googleContactsToolExecutor",
  },
  {
    type: "openflow-node-base.clockify",
    modulePath: "./executors/clockify",
    exportName: "clockifyExecutor",
  },
  {
    type: "openflow-node-base.clockifyTool",
    modulePath: "./executors/n8n-nodes-base.clockifyTool",
    exportName: "clockifyToolExecutor",
  },
  {
    type: "openflow-node-base.googleFirebaseCloudFirestore",
    modulePath: "./executors/googleFirebaseCloudFirestore",
    exportName: "googleFirebaseCloudFirestoreExecutor",
  },
  {
    type: "openflow-node-base.googleFirebaseCloudFirestoreTool",
    modulePath: "./executors/googleFirebaseCloudFirestoreTool",
    exportName: "googleFirebaseCloudFirestoreToolExecutor",
  },
  {
    type: "openflow-node-base.onfleetTrigger",
    modulePath: "./executors/n8n-nodes-base.onfleetTrigger",
    exportName: "onfleetTriggerExecutor",
  },
  {
    type: "openflow-node-base.mindee",
    modulePath: "./executors/mindee",
    exportName: "mindeeExecutor",
  },
  {
    type: "openflow-node-base.redditTool",
    modulePath: "./executors/n8n-nodes-base.redditTool",
    exportName: "redditToolExecutor",
  },
  {
    type: "openflow-node-base.uptimeRobot",
    modulePath: "./executors/uptimeRobot",
    exportName: "uptimeRobotExecutor",
  },
  {
    type: "openflow-node-langchain.embeddingsHuggingFaceInference",
    modulePath: "./executors/embeddings-huggingface-inference",
    exportName: "embeddingsHuggingFaceInferenceExecutor",
  },
  {
    type: "openflow-node-langchain.lmOpenHuggingFaceInference",
    modulePath: "./executors/lmOpenHuggingFaceInference",
    exportName: "lmOpenHuggingFaceInferenceExecutor",
  },
  {
    type: "openflow-node-base.awsTextract",
    modulePath: "./executors/awsTextract",
    exportName: "awsTextractExecutor",
  },
  {
    type: "openflow-node-base.awsTranscribe",
    modulePath: "./executors/awsTranscribe",
    exportName: "awsTranscribeExecutor",
  },
  {
    type: "openflow-node-base.azureStorage",
    modulePath: "./executors/azureStorage",
    exportName: "azureStorageExecutor",
  },
  {
    type: "openflow-node-base.bitly",
    modulePath: "./executors/n8n-nodes-base.bitly",
    exportName: "bitlyExecutor",
  },
  {
    type: "openflow-node-base.dropboxTool",
    modulePath: "./executors/n8n-nodes-base.dropboxTool",
    exportName: "dropboxToolExecutor",
  },
  {
    type: "openflow-node-base.eventbriteTrigger",
    modulePath: "./executors/eventbriteTrigger",
    exportName: "eventbriteTriggerExecutor",
  },
  {
    type: "openflow-node-base.facebookTrigger",
    modulePath: "./executors/facebookTrigger",
    exportName: "facebookTriggerExecutor",
  },
  {
    type: "openflow-node-base.freshdesk",
    modulePath: "./executors/freshdesk",
    exportName: "freshdeskExecutor",
  },
  {
    type: "openflow-node-base.freshdeskTool",
    modulePath: "./executors/freshdeskTool",
    exportName: "freshdeskToolExecutor",
  },
  {
    type: "openflow-node-base.ghost",
    modulePath: "./executors/ghost",
    exportName: "ghostExecutor",
  },
  {
    type: "openflow-node-base.gumroadTrigger",
    modulePath: "./executors/gumroad-trigger",
    exportName: "gumroadTriggerExecutor",
  },
  {
    type: "openflow-node-base.humanticAi",
    modulePath: "./executors/humantic-ai",
    exportName: "humanticAiExecutor",
  },
  {
    type: "openflow-node-base.googleAnalyticsTool",
    modulePath: "./executors/googleAnalyticsTool",
    exportName: "googleAnalyticsToolExecutor",
  },
  {
    type: "openflow-node-base.demio",
    modulePath: "./executors/communication/demio",
    exportName: "demioExecutor",
  },
  {
    type: "openflow-node-base.intercom",
    modulePath: "./executors/n8n-nodes-base.intercom",
    exportName: "intercomExecutor",
  },
  {
    type: "openflow-node-base.lemlistTrigger",
    modulePath: "./executors/n8n-nodes-base.lemlistTrigger",
    exportName: "lemlistTriggerExecutor",
  },
  {
    type: "openflow-node-base.lingvaNex",
    modulePath: "./executors/lingvaNex",
    exportName: "lingvaNexExecutor",
  },
  {
    type: "openflow-node-base.mailchimpTrigger",
    modulePath: "./executors/n8n-nodes-base.mailchimpTrigger",
    exportName: "mailchimpTriggerExecutor",
  },
  {
    type: "openflow-node-base.medium",
    modulePath: "./executors/medium",
    exportName: "mediumExecutor",
  },
  {
    type: "openflow-node-base.microsoftOneDriveTrigger",
    modulePath: "./executors/microsoft-one-drive-trigger",
    exportName: "microsoftOneDriveTriggerExecutor",
  },
  {
    type: "openflow-node-base.onfleet",
    modulePath: "./executors/n8n-nodes-base.onfleet",
    exportName: "onfleetExecutor",
  },
  {
    type: "openflow-node-base.quickbooksTool",
    modulePath: "./executors/n8n-nodes-base.quickbooksTool",
    exportName: "quickbooksToolExecutor",
  },
  {
    type: "openflow-node-base.redisTool",
    modulePath: "./executors/n8n-nodes-base.redisTool",
    exportName: "redisToolExecutor",
  },
  {
    type: "openflow-node-base.raindrop",
    modulePath: "./executors/raindrop",
    exportName: "raindropExecutor",
  },
  {
    type: "openflow-node-base.sendInBlueTrigger",
    modulePath: "./executors/brevoTrigger",
    exportName: "brevoTriggerExecutor",
  },
  {
    type: "openflow-node-base.strapi",
    modulePath: "./executors/n8n-nodes-base.strapi",
    exportName: "strapiExecutor",
  },
  {
    type: "openflow-node-base.theHive",
    modulePath: "./executors/theHive",
    exportName: "theHiveExecutor",
  },
  {
    type: "openflow-node-base.trelloTool",
    modulePath: "./executors/n8n-nodes-base.trelloTool",
    exportName: "trelloToolExecutor",
  },
  {
    type: "openflow-node-base.urlScanIo",
    modulePath: "./executors/n8n-nodes-base.urlScanIo",
    exportName: "urlScanIoExecutor",
  },
  {
    type: "openflow-node-langchain.chatHitlTool",
    modulePath: "./executors/n8n-nodes-langchain.chatHitlTool",
    exportName: "n8nNodesLangchainChatHitlToolExecutor",
  },
  {
    type: "openflow-node-base.vonage",
    modulePath: "./executors/vonage",
    exportName: "vonageExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatCohere",
    modulePath: "./executors/lm-chat-cohere",
    exportName: "lmChatCohereExecutor",
  },
  {
    type: "openflow-node-base.awsCertificateManager",
    modulePath: "./executors/awsCertificateManager",
    exportName: "awsCertificateManagerExecutor",
  },
  {
    type: "openflow-node-langchain.retrieverWorkflow",
    modulePath: "./executors/retrieverWorkflow",
    exportName: "retrieverWorkflowExecutor",
  },
  {
    type: "openflow-node-langchain.vectorStoreRedis",
    modulePath: "./executors/vectorStoreRedis",
    exportName: "vectorStoreRedisExecutor",
  },
  {
    type: "openflow-node-base.amqpTrigger",
    modulePath: "./executors/amqpTrigger",
    exportName: "amqpTriggerExecutor",
  },
  {
    type: "openflow-node-base.activeCampaign",
    modulePath: "./executors/n8n-nodes-base.activeCampaign",
    exportName: "activeCampaignExecutor",
  },
  {
    type: "openflow-node-base.asanaTrigger",
    modulePath: "./executors/n8n-nodes-base.asanaTrigger",
    exportName: "asanaTriggerExecutor",
  },
  {
    type: "openflow-node-base.coinGecko",
    modulePath: "./executors/coinGecko",
    exportName: "coinGeckoExecutor",
  },
  {
    type: "openflow-node-base.coinGeckoTool",
    modulePath: "./executors/n8n-nodes-base.coinGeckoTool",
    exportName: "coinGeckoToolExecutor",
  },
  {
    type: "openflow-node-base.cortex",
    modulePath: "./executors/n8n-nodes-base.cortex",
    exportName: "cortexExecutor",
  },
  {
    type: "openflow-node-base.activeCampaignTrigger",
    modulePath: "./executors/activeCampaignTrigger",
    exportName: "activeCampaignTriggerExecutor",
  },
  {
    type: "openflow-node-base.convertKit",
    modulePath: "./executors/convertKit",
    exportName: "convertKitExecutor",
  },
  {
    type: "openflow-node-base.convertKitTool",
    modulePath: "./executors/n8n-nodes-base.convertKitTool",
    exportName: "convertKitToolExecutor",
  },
  {
    type: "openflow-node-base.crateDb",
    modulePath: "./executors/n8n-nodes-base.crateDb",
    exportName: "crateDbExecutor",
  },
  {
    type: "openflow-node-base.dhl",
    modulePath: "./executors/n8n-nodes-base.dhl",
    exportName: "dhlExecutor",
  },
  {
    type: "openflow-node-base.dhlTool",
    modulePath: "./executors/dhlTool",
    exportName: "dhlToolExecutor",
  },
  {
    type: "openflow-node-base.goToWebinar",
    modulePath: "./executors/n8n-nodes-base.goToWebinar",
    exportName: "goToWebinarExecutor",
  },
  {
    type: "openflow-node-base.filemaker",
    modulePath: "./executors/filemaker",
    exportName: "filemakerExecutor",
  },
  {
    type: "openflow-node-base.googleAdsTool",
    modulePath: "./executors/n8n-nodes-base.googleAdsTool",
    exportName: "googleAdsToolExecutor",
  },
  {
    type: "openflow-node-base.googleBooks",
    modulePath: "./executors/googleBooks",
    exportName: "googleBooksExecutor",
  },
  {
    type: "openflow-node-base.googleDriveSearch",
    modulePath: "./executors/n8n-nodes-base.googleDriveSearch",
    exportName: "googleDriveSearchExecutor",
  },
  {
    type: "openflow-node-base.hunterTool",
    modulePath: "./executors/hunterTool",
    exportName: "hunterToolExecutor",
  },
  {
    type: "openflow-node-base.keap",
    modulePath: "./executors/n8n-nodes-base.keap",
    exportName: "keapExecutor",
  },
  {
    type: "openflow-node-base.linearTool",
    modulePath: "./executors/n8n-nodes-base.linearTool",
    exportName: "linearToolExecutor",
  },
  {
    type: "openflow-node-base.linkedInTool",
    modulePath: "./executors/linkedInTool",
    exportName: "linkedInToolExecutor",
  },
  {
    type: "openflow-node-base.nasaTool",
    modulePath: "./executors/nasaTool",
    exportName: "nasaToolExecutor",
  },
  {
    type: "openflow-node-base.mongoDbTool",
    modulePath: "./executors/n8n-nodes-base.mongoDbTool",
    exportName: "mongoDbToolExecutor",
  },
  {
    type: "openflow-node-base.nocoDbTool",
    modulePath: "./executors/n8n-nodes-base.nocoDbTool",
    exportName: "nocoDbToolExecutor",
  },
  {
    type: "openflow-node-base.netlifyTrigger",
    modulePath: "./executors/netlifyTrigger",
    exportName: "netlifyTriggerExecutor",
  },
  {
    type: "openflow-node-base.oneSimpleApi",
    modulePath: "./executors/oneSimpleApi",
    exportName: "oneSimpleApiExecutor",
  },
  {
    type: "openflow-node-base.signl4",
    modulePath: "./executors/signl4",
    exportName: "signl4Executor",
  },
  {
    type: "openflow-node-base.spotifyTool",
    modulePath: "./executors/n8n-nodes-base.spotifyTool",
    exportName: "spotifyToolExecutor",
  },
  {
    type: "openflow-node-base.theHiveProject",
    modulePath: "./executors/theHiveProject",
    exportName: "theHiveProjectExecutor",
  },
  {
    type: "openflow-node-base.webSearch",
    modulePath: "./executors/webSearch",
    exportName: "webSearchExecutor",
  },
  {
    type: "openflow-node-base.webSearchTool",
    modulePath: "./executors/webSearchTool",
    exportName: "webSearchToolExecutor",
  },
  {
    type: "openflow-node-base.gitTool",
    modulePath: "./executors/gitTool",
    exportName: "gitToolExecutor",
  },
  {
    type: "openflow-node-base.filesystemTool",
    modulePath: "./executors/filesystemTool",
    exportName: "filesystemToolExecutor",
  },
  {
    type: "openflow-node-base.webflowTool",
    modulePath: "./executors/n8n-nodes-base.webflowTool",
    exportName: "webflowToolExecutor",
  },
  {
    type: "openflow-node-base.whatsAppTool",
    modulePath: "./executors/whatsapp-tool",
    exportName: "whatsAppToolExecutor",
  },
  {
    type: "openflow-node-base.zulip",
    modulePath: "./executors/n8n-nodes-base.zulip",
    exportName: "zulipExecutor",
  },
  {
    type: "openflow-node-langchain.anthropicTool",
    modulePath: "./executors/n8n-nodes-langchain.anthropicTool",
    exportName: "anthropicToolExecutor",
  },
  {
    type: "openflow-node-langchain.embeddingsAwsBedrock",
    modulePath: "./executors/embeddings-aws-bedrock",
    exportName: "embeddingsAwsBedrockExecutor",
  },
  {
    type: "openflow-node-langchain.lmChatMoonshot",
    modulePath: "./executors/lm-chat-moonshot",
    exportName: "lmChatMoonshotExecutor",
  },
  {
    type: "openflow-node-langchain.ollama",
    modulePath: "./executors/ollama-app",
    exportName: "ollamaAppExecutor",
  },
  {
    type: "openflow-node-langchain.vectorStoreSupabaseInsert",
    modulePath: "./executors/vectorStoreSupabaseInsert",
    exportName: "vectorStoreSupabaseInsertExecutor",
  },
  {
    type: "openflow-node-base.rundeck",
    modulePath: "./executors/rundeck",
    exportName: "rundeckExecutor",
  },
  {
    type: "openflow-node-base.acuitySchedulingTrigger",
    modulePath: "./executors/acuitySchedulingTrigger",
    exportName: "acuitySchedulingTriggerExecutor",
  },
  {
    type: "openflow-node-base.actionNetworkTool",
    modulePath: "./executors/ActionNetworkTool",
    exportName: "actionNetworkToolExecutor",
  },
  {
    type: "openflow-node-base.affinity",
    modulePath: "./executors/affinity",
    exportName: "affinityExecutor",
  },
  {
    type: "openflow-node-base.affinityTrigger",
    modulePath: "./executors/affinityTrigger",
    exportName: "affinityTriggerExecutor",
  },
  {
    type: "openflow-node-base.affinityTool",
    modulePath: "./executors/n8n-nodes-base.affinityTool",
    exportName: "affinityToolExecutor",
  },
  {
    type: "openflow-node-base.agileCrm",
    modulePath: "./executors/n8n-nodes-base.agileCrm",
    exportName: "agileCrmExecutor",
  },
  {
    type: "openflow-node-base.autopilotTool",
    modulePath: "./executors/n8n-nodes-base.autopilotTool",
    exportName: "autopilotToolExecutor",
  },
  {
    type: "openflow-node-base.autopilotTrigger",
    modulePath: "./executors/autopilot-trigger",
    exportName: "autopilotTriggerExecutor",
  },
  {
    type: "openflow-node-base.awsRekognition",
    modulePath: "./executors/awsRekognition",
    exportName: "awsRekognitionExecutor",
  },
  {
    type: "openflow-node-base.awsDynamoDb",
    modulePath: "./executors/awsDynamoDb",
    exportName: "awsDynamoDbExecutor",
  },
  {
    type: "openflow-node-base.awsSns",
    modulePath: "./executors/awsSns",
    exportName: "awsSnsExecutor",
  },
  {
    type: "openflow-node-base.awsSqs",
    modulePath: "./executors/awsSqs",
    exportName: "awsSqsExecutor",
  },
  {
    type: "openflow-node-base.awsSnsTrigger",
    modulePath: "./executors/awsSnsTrigger",
    exportName: "awsSnsTriggerExecutor",
  },
  {
    type: "openflow-node-base.awsTranscribeTool",
    modulePath: "./executors/awsTranscribeTool",
    exportName: "awsTranscribeToolExecutor",
  },
  {
    type: "openflow-node-base.beeminderTool",
    modulePath: "./executors/n8n-nodes-base.beeminderTool",
    exportName: "beeminderToolExecutor",
  },
  {
    type: "openflow-node-base.bitlyTool",
    modulePath: "./executors/n8n-nodes-base.bitlyTool",
    exportName: "bitlyToolExecutor",
  },
  {
    type: "openflow-node-base.boxTrigger",
    modulePath: "./executors/box-trigger",
    exportName: "boxTriggerExecutor",
  },
  {
    type: "openflow-node-base.bitwardenTool",
    modulePath: "./executors/bitwardenTool",
    exportName: "bitwardenToolExecutor",
  },
  {
    type: "openflow-node-base.bubbleTool",
    modulePath: "./executors/n8n-nodes-base.bubbleTool",
    exportName: "bubbleToolExecutor",
  },
  {
    type: "openflow-node-base.chargebee",
    modulePath: "./executors/Chargebee",
    exportName: "chargebeeExecutor",
  },
  {
    type: "openflow-node-base.cheerio",
    modulePath: "./executors/cheerio",
    exportName: "cheerioExecutor",
  },
  {
    type: "openflow-node-base.circleCiTool",
    modulePath: "./executors/n8n-nodes-base.circleCiTool",
    exportName: "circleCiToolExecutor",
  },
  {
    type: "openflow-node-base.clearbitTool",
    modulePath: "./executors/n8n-nodes-base.clearbitTool",
    exportName: "clearbitToolExecutor",
  },
  {
    type: "openflow-node-base.clockifyTrigger",
    modulePath: "./executors/n8n-nodes-base.clockifyTrigger",
    exportName: "clockifyTriggerExecutor",
  },
  {
    type: "openflow-node-base.cloudflareTool",
    modulePath: "./executors/cloudflareTool",
    exportName: "cloudflareToolExecutor",
  },
  {
    type: "openflow-node-base.cockpit",
    modulePath: "./executors/cockpit",
    exportName: "cockpitExecutor",
  },
  {
    type: "openflow-node-base.codaTool",
    modulePath: "./executors/n8n-nodes-base.codaTool",
    exportName: "codaToolExecutor",
  },
  {
    type: "openflow-node-base.contentful",
    modulePath: "./executors/contentful",
    exportName: "contentfulExecutor",
  },
  {
    type: "openflow-node-base.copper",
    modulePath: "./executors/copper",
    exportName: "copperExecutor",
  },
  {
    type: "openflow-node-base.copperTool",
    modulePath: "./executors/n8n-nodes-base.copperTool",
    exportName: "copperToolExecutor",
  },
  {
    type: "openflow-node-base.copperTrigger",
    modulePath: "./executors/copperTrigger",
    exportName: "copperTriggerExecutor",
  },
  {
    type: "openflow-node-base.customerIoTool",
    modulePath: "./executors/n8n-nodes-base.customerIoTool",
    exportName: "customerIoToolExecutor",
  },
  {
    type: "openflow-node-base.customerIoTrigger",
    modulePath: "./executors/n8n-nodes-base.customerIoTrigger",
    exportName: "customerIoTriggerExecutor",
  },
  {
    type: "openflow-node-base.disqus",
    modulePath: "./executors/n8n-nodes-base.disqus",
    exportName: "disqusExecutor",
  },
  {
    type: "openflow-node-base.drift",
    modulePath: "./executors/drift",
    exportName: "driftExecutor",
  },
  {
    type: "openflow-node-base.driftTool",
    modulePath: "./executors/n8n-nodes-base.driftTool",
    exportName: "driftToolExecutor",
  },
  {
    type: "openflow-node-base.dropcontactTool",
    modulePath: "./executors/n8n-nodes-base.dropcontactTool",
    exportName: "dropcontactToolExecutor",
  },
  {
    type: "openflow-node-base.egoi",
    modulePath: "./executors/n8n-nodes-base.egoi",
    exportName: "egoiExecutor",
  },
  {
    type: "openflow-node-base.elasticSecurityTool",
    modulePath: "./executors/ElasticSecurityExecutor",
    exportName: "elasticSecurityExecutor",
  },
  {
    type: "openflow-node-base.elevenLabs",
    modulePath: "./executors/ElevenLabs",
    exportName: "elevenLabsExecutor",
  },
  {
    type: "openflow-node-base.emailSendHitlTool",
    modulePath: "./executors/n8n-nodes-base.emailSendHitlTool",
    exportName: "emailSendHitlToolExecutor",
  },
  {
    type: "openflow-node-base.emelia",
    modulePath: "./executors/n8n-nodes-base.emelia",
    exportName: "emeliaExecutor",
  },
  {
    type: "openflow-node-base.emeliaTrigger",
    modulePath: "./executors/n8n-nodes-base.emeliaTrigger",
    exportName: "emeliaTriggerExecutor",
  },
  {
    type: "openflow-node-base.flowTrigger",
    modulePath: "./executors/flowTrigger",
    exportName: "flowTriggerExecutor",
  },
  {
    type: "openflow-node-base.formIoTrigger",
    modulePath: "./executors/formIoTrigger",
    exportName: "formIoTriggerExecutor",
  },
  {
    type: "openflow-node-base.freshworksCrm",
    modulePath: "./executors/n8n-nodes-base.freshworksCrm",
    exportName: "freshworksCrmExecutor",
  },
  {
    type: "openflow-node-base.getResponse",
    modulePath: "./executors/getResponse",
    exportName: "getResponseExecutor",
  },
  {
    type: "openflow-node-base.gong",
    modulePath: "./executors/gong",
    exportName: "gongExecutor",
  },
  {
    type: "openflow-node-base.gongTool",
    modulePath: "./executors/gongTool",
    exportName: "gongToolExecutor",
  },
  {
    type: "openflow-node-base.grafanaTool",
    modulePath: "./executors/grafana",
    exportName: "grafanaExecutor",
  },
  {
    type: "openflow-node-base.googleCloudStorageTool",
    modulePath: "./executors/n8n-nodes-base.googleCloudStorageTool",
    exportName: "googleCloudStorageToolExecutor",
  },
  {
    type: "openflow-node-base.googleCloudNaturalLanguageTool",
    modulePath: "./executors/googleCloudNaturalLanguageTool",
    exportName: "googleCloudNaturalLanguageToolExecutor",
  },
  {
    type: "openflow-node-base.googleCustomSearch",
    modulePath: "./executors/googleCustomSearch",
    exportName: "googleCustomSearchExecutor",
  },
  {
    type: "openflow-node-base.googleFirebaseRealtimeDatabase",
    modulePath: "./executors/googleFirebaseRealtimeDatabase",
    exportName: "googleFirebaseRealtimeDatabaseExecutor",
  },
  {
    type: "openflow-node-base.googlePageSpeedInsights",
    modulePath: "./executors/googlePageSpeedInsights",
    exportName: "googlePageSpeedInsightsExecutor",
  },
  {
    type: "openflow-node-base.googlePerspective",
    modulePath: "./executors/googlePerspective",
    exportName: "googlePerspectiveExecutor",
  },
  {
    type: "openflow-node-base.googleSearchConsole",
    modulePath: "./executors/googleSearchConsole",
    exportName: "googleSearchConsoleExecutor",
  },
  {
    type: "openflow-node-base.googleTranslateTool",
    modulePath: "./executors/googleTranslateTool",
    exportName: "googleTranslateToolExecutor",
  },
  {
    type: "openflow-node-base.plivoTool",
    modulePath: "./executors/PlivoTool",
    exportName: "plivoToolExecutor",
  },
  {
    type: "openflow-node-base.postBinTool",
    modulePath: "./executors/postBinTool",
    exportName: "postBinToolExecutor",
  },
  {
    type: "openflow-node-base.postHogTool",
    modulePath: "./executors/postHogTool",
    exportName: "postHogToolExecutor",
  },
  {
    type: "openflow-node-base.profitWell",
    modulePath: "./executors/profitWell",
    exportName: "profitWellExecutor",
  },
  {
    type: "openflow-node-base.profitWellTool",
    modulePath: "./executors/profitWellTool",
    exportName: "profitWellToolExecutor",
  },
  {
    type: "openflow-node-base.pushcut",
    modulePath: "./executors/pushcut",
    exportName: "pushcutExecutor",
  },
  {
    type: "openflow-node-base.pushcutTrigger",
    modulePath: "./executors/pushcutTrigger",
    exportName: "pushcutTriggerExecutor",
  },
  {
    type: "openflow-node-base.pushoverTool",
    modulePath: "./executors/pushoverTool",
    exportName: "pushoverToolExecutor",
  },
  {
    type: "openflow-node-base.questDb",
    modulePath: "./executors/n8n-nodes-base.questDb",
    exportName: "questDbExecutor",
  },
  {
    type: "openflow-node-base.quickbase",
    modulePath: "./executors/QuickBase",
    exportName: "quickBaseExecutor",
  },
  {
    type: "openflow-node-base.salesmate",
    modulePath: "./executors/salesmate",
    exportName: "salesmateExecutor",
  },
  {
    type: "openflow-node-base.seaTable",
    modulePath: "./executors/seaTable",
    exportName: "seaTableExecutor",
  },
  {
    type: "openflow-node-base.securityScorecard",
    modulePath: "./executors/securityScorecard",
    exportName: "securityScorecardExecutor",
  },
  {
    type: "openflow-node-base.sendy",
    modulePath: "./executors/n8n-nodes-base.sendy",
    exportName: "sendyExecutor",
  },
  {
    type: "openflow-node-base.sendyTool",
    modulePath: "./executors/sendyTool",
    exportName: "sendyToolExecutor",
  },
  {
    type: "openflow-node-base.sentryIo",
    modulePath: "./executors/sentryIo",
    exportName: "sentryIoExecutor",
  },
  {
    type: "openflow-node-base.sentryIoTool",
    modulePath: "./executors/sentryIoTool",
    exportName: "sentryIoToolExecutor",
  },
  {
    type: "openflow-node-base.signl4Tool",
    modulePath: "./executors/signl4Tool",
    exportName: "signl4ToolExecutor",
  },
  {
    type: "openflow-node-base.sms77Tool",
    modulePath: "./executors/sms77Tool",
    exportName: "sms77ToolExecutor",
  },
  {
    type: "openflow-node-base.spontit",
    modulePath: "./executors/spontit",
    exportName: "spontitExecutor",
  },
  {
    type: "openflow-node-base.storyblok",
    modulePath: "./executors/n8n-nodes-base.storyblok",
    exportName: "storyblokExecutor",
  },
  {
    type: "openflow-node-base.strapiTool",
    modulePath: "./executors/StrapiTool",
    exportName: "strapiToolExecutor",
  },
  {
    type: "openflow-node-base.stravaTool",
    modulePath: "./executors/stravaTool",
    exportName: "stravaToolExecutor",
  },
  {
    type: "openflow-node-base.stravaTrigger",
    modulePath: "./executors/stravaTrigger",
    exportName: "stravaTriggerExecutor",
  },
  {
    type: "openflow-node-base.surveyMonkeyTrigger",
    modulePath: "./executors/surveyMonkeyTrigger",
    exportName: "surveyMonkeyTriggerExecutor",
  },
  {
    type: "openflow-node-base.tapfiliate",
    modulePath: "./executors/tapfiliate",
    exportName: "tapfiliateExecutor",
  },
  {
    type: "openflow-node-base.taiga",
    modulePath: "./executors/n8n-nodes-base.taiga",
    exportName: "taigaExecutor",
  },
  {
    type: "openflow-node-base.theHiveProjectTrigger",
    modulePath: "./executors/theHiveProjectTrigger",
    exportName: "theHiveProjectTriggerExecutor",
  },
  {
    type: "openflow-node-base.theHiveTrigger",
    modulePath: "./executors/theHiveTrigger",
    exportName: "theHiveTriggerExecutor",
  },
  {
    type: "openflow-node-base.theHiveTool",
    modulePath: "./executors/theHiveTool",
    exportName: "theHiveToolExecutor",
  },
  {
    type: "openflow-node-base.timescaleDb",
    modulePath: "./executors/timescaleDb",
    exportName: "timescaleDbExecutor",
  },
  {
    type: "openflow-node-base.travisCiTool",
    modulePath: "./executors/n8n-nodes-base.travisCiTool",
    exportName: "travisCiToolExecutor",
  },
  {
    type: "openflow-node-base.twake",
    modulePath: "./executors/n8n-nodes-base.twake",
    exportName: "twakeExecutor",
  },
  {
    type: "openflow-node-base.twilioTool",
    modulePath: "./executors/n8n-nodes-base.twilioTool",
    exportName: "twilioToolExecutor",
  },
  {
    type: "openflow-node-base.twist",
    modulePath: "./executors/twist",
    exportName: "twistExecutor",
  },
  {
    type: "openflow-node-base.unleashedSoftware",
    modulePath: "./executors/unleashedSoftware",
    exportName: "unleashedSoftwareExecutor",
  },
  {
    type: "openflow-node-base.uplead",
    modulePath: "./executors/n8n-nodes-base.uplead",
    exportName: "upleadExecutor",
  },
  {
    type: "openflow-node-base.urlScanIoTool",
    modulePath: "./executors/n8n-nodes-base.urlScanIoTool",
    exportName: "urlScanIoToolExecutor",
  },
  {
    type: "openflow-node-base.uptimeRobotTool",
    modulePath: "./executors/uptimeRobotTool",
    exportName: "uptimeRobotToolExecutor",
  },
  {
    type: "openflow-node-base.venafiTlsProtectCloudTool",
    modulePath: "./executors/venafiTlsProtectCloud",
    exportName: "venafiTlsProtectCloudToolExecutor",
  },
  {
    type: "openflow-node-base.venafiTlsProtectDatacenterTool",
    modulePath: "./executors/venafiTlsProtectDatacenterTool",
    exportName: "venafiTlsProtectDatacenterToolExecutor",
  },
  {
    type: "openflow-node-base.vero",
    modulePath: "./executors/n8n-nodes-base.vero",
    exportName: "veroExecutor",
  },
  {
    type: "openflow-node-base.wise",
    modulePath: "./executors/wise",
    exportName: "wiseExecutor",
  },
  {
    type: "openflow-node-base.wekanTool",
    modulePath: "./executors/wekanTool",
    exportName: "wekanToolExecutor",
  },
  {
    type: "openflow-node-base.wiseTrigger",
    modulePath: "./executors/wiseTrigger",
    exportName: "wiseTriggerExecutor",
  },
{
    type: "openflow-node-base.vonage",
    modulePath: "./executors/vonage",
    exportName: "vonageExecutor",
  },
  {
    type: "openflow-node-base.yourlsTool",
    modulePath: "./executors/yourlsTool",
    exportName: "yourlsToolExecutor",
  },
  {
    type: "openflow-node-base.zohoCrmTool",
    modulePath: "./executors/n8n-nodes-base.zohoCrmTool",
    exportName: "zohoCrmToolExecutor",
  },
  // Partial-job repairs: alternate ids + missing registrations
  {
    type: "openflow-node-base.discourseTool",
    modulePath: "./executors/n8n-nodes-base.discourseTool",
    exportName: "discourseToolExecutor",
  },
  {
    type: "openflow-node-base.egoiTool",
    modulePath: "./executors/egoiTool",
    exportName: "egoiToolExecutor",
  },
  {
    type: "openflow-node-base.humanticAiTool",
    modulePath: "./executors/humantic-ai-tool",
    exportName: "humanticAiToolExecutor",
  },
  {
    type: "openflow-node-base.iCal",
    modulePath: "./executors/iCalendar",
    exportName: "iCalendarExecutor",
  },
  {
    type: "openflow-node-base.mandrill",
    modulePath: "./executors/mandrill",
    exportName: "mandrillExecutor",
  },
  {
    type: "openflow-node-base.mattermostTool",
    modulePath: "./executors/n8n-nodes-base.mattermostTool",
    exportName: "mattermostToolExecutor",
  },
  {
    type: "openflow-node-base.microsoftGraphSecurity",
    modulePath: "./executors/microsoftGraphSecurityExecutor",
    exportName: "microsoftGraphSecurityExecutor",
  },
  {
    type: "openflow-node-base.microsoftGraphSecurityTool",
    modulePath: "./executors/microsoftGraphSecurityExecutor",
    exportName: "microsoftGraphSecurityExecutor",
  },
  {
    type: "openflow-node-base.microsoftOneDriveTool",
    modulePath: "./executors/microsoft-one-drive",
    exportName: "microsoftOneDriveExecutor",
  },
  {
    type: "openflow-node-base.mocean",
    modulePath: "./executors/mocean",
    exportName: "moceanExecutor",
  },
  {
    type: "openflow-node-base.monicaCrmTool",
    modulePath: "./executors/n8n-nodes-base.monicaCrmTool",
    exportName: "monicaCrmToolExecutor",
  },
  {
    type: "openflow-node-base.ouraTool",
    modulePath: "./executors/ouraTool",
    exportName: "ouraExecutor",
  },
  {
    type: "openflow-node-base.postHog",
    modulePath: "./executors/postHogTool",
    exportName: "postHogToolExecutor",
  },
  {
    type: "openflow-node-base.schedule",
    modulePath: "./executors/schedule-trigger",
    exportName: "scheduleTriggerExecutor",
  },
  {
    type: "openflow-node-base.sendEmail",
    modulePath: "./executors/email-send",
    exportName: "emailSendExecutor",
  },
  {
    type: "openflow-node-base.twistTool",
    modulePath: "./executors/twist",
    exportName: "twistExecutor",
  },
  {
    type: "openflow-node-base.venafiTlsProtectCloud",
    modulePath: "./executors/venafiTlsProtectCloud",
    exportName: "venafiTlsProtectCloudToolExecutor",
  },
  {
    type: "openflow-node-base.wordPress",
    modulePath: "./executors/wordpress",
    exportName: "wordpressExecutor",
  },
  {
    type: "openflow-node-base.mandrillTool",
    modulePath: "./executors/n8n-nodes-base.mandrillTool",
    exportName: "mandrillToolExecutor",
  },
  {
    type: "openflow-node-base.moceanTool",
    modulePath: "./executors/moceanTool",
    exportName: "moceanToolExecutor",
  },
  {
    type: "openflow-node-base.oura",
    modulePath: "./executors/ouraTool",
    exportName: "ouraExecutor",
  },
  // Previously defined in palette but missing from the executor manifest
  {
    type: "openflow-node-base.haloPSATool",
    modulePath: "./executors/n8n-nodes-base.haloPSATool",
    exportName: "haloPSAToolExecutor",
  },
  {
    type: "openflow-node-base.harvest",
    modulePath: "./executors/harvest",
    exportName: "harvestExecutor",
  },
  {
    type: "openflow-node-base.helpScout",
    modulePath: "./executors/helpScout",
    exportName: "helpScoutExecutor",
  },
  {
    type: "openflow-node-base.helpScoutTrigger",
    modulePath: "./executors/n8n-nodes-base.helpScoutTrigger",
    exportName: "helpScoutTriggerExecutor",
  },
  {
    type: "openflow-node-base.hubGPT",
    modulePath: "./executors/hub-gpt",
    exportName: "hubGPTExecutor",
  },
  {
    type: "openflow-node-base.invoiceNinja",
    modulePath: "./executors/invoice-ninja",
    exportName: "invoiceNinjaExecutor",
  },
  {
    type: "openflow-node-base.invoiceNinjaTrigger",
    modulePath: "./executors/invoice-ninja-trigger",
    exportName: "invoiceNinjaTriggerExecutor",
  },
  {
    type: "openflow-node-base.iterable",
    modulePath: "./executors/iterable",
    exportName: "iterableExecutor",
  },
  {
    type: "openflow-node-base.iterableTool",
    modulePath: "./executors/n8n-nodes-base.iterableTool",
    exportName: "iterableToolExecutor",
  },
  {
    type: "openflow-node-base.keapTrigger",
    modulePath: "./executors/n8n-nodes-base.keapTrigger",
    exportName: "keapTriggerExecutor",
  },
  {
    type: "openflow-node-base.kitemakerTool",
    modulePath: "./executors/kitemakerTool",
    exportName: "kitemakerToolExecutor",
  },
  {
    type: "openflow-node-base.koBoToolboxTool",
    modulePath: "./executors/koBoToolboxTool",
    exportName: "koBoToolboxToolExecutor",
  },
  {
    type: "openflow-node-base.magento2",
    modulePath: "./executors/magento2",
    exportName: "magento2Executor",
  },
  {
    type: "openflow-node-base.mailcheck",
    modulePath: "./executors/mailcheck",
    exportName: "mailcheckExecutor",
  },
  {
    type: "openflow-node-base.mailcheckTool",
    modulePath: "./executors/mailcheckTool",
    exportName: "mailcheckToolExecutor",
  },
  {
    type: "openflow-node-base.mailerLite",
    modulePath: "./executors/mailerLite",
    exportName: "mailerLiteExecutor",
  },
  {
    type: "openflow-node-base.mailerLiteTool",
    modulePath: "./executors/n8n-nodes-base.mailerLiteTool",
    exportName: "mailerLiteToolExecutor",
  },
  {
    type: "openflow-node-base.mailerLiteTrigger",
    modulePath: "./executors/mailerLiteTrigger",
    exportName: "mailerLiteTriggerExecutor",
  },
  {
    type: "openflow-node-base.mailjetTrigger",
    modulePath: "./executors/n8n-nodes-base.mailjetTrigger",
    exportName: "mailjetTriggerExecutor",
  },
  {
    type: "openflow-node-base.marketstack",
    modulePath: "./executors/n8n-nodes-base.marketstack",
    exportName: "marketstackExecutor",
  },
  {
    type: "openflow-node-base.matrixTool",
    modulePath: "./executors/matrixTool",
    exportName: "matrixToolExecutor",
  },
  {
    type: "openflow-node-base.mauticTool",
    modulePath: "./executors/n8n-nodes-base.mauticTool",
    exportName: "mauticToolExecutor",
  },
  {
    type: "openflow-node-base.microsoftDynamicsCrmTool",
    modulePath: "./executors/n8n-nodes-base.microsoftDynamicsCrmTool",
    exportName: "microsoftDynamicsCrmToolExecutor",
  },
  {
    type: "openflow-node-base.microsoftEntraTool",
    modulePath: "./executors/n8n-nodes-base.microsoftEntraTool",
    exportName: "microsoftEntraToolExecutor",
  },
  {
    type: "openflow-node-base.microsoftExcelTool",
    modulePath: "./executors/n8n-nodes-base.microsoftExcelTool",
    exportName: "microsoftExcelToolExecutor",
  },
  {
    type: "openflow-node-base.microsoftSharePointTool",
    modulePath: "./executors/microsoftSharePointTool",
    exportName: "microsoftSharePointToolExecutor",
  },
  {
    type: "openflow-node-base.mispTool",
    modulePath: "./executors/n8n-nodes-base.mispTool",
    exportName: "mispToolExecutor",
  },
  {
    type: "openflow-node-base.mondayComTool",
    modulePath: "./executors/n8n-nodes-base.mondayComTool",
    exportName: "mondayComToolExecutor",
  },
  {
    type: "openflow-node-base.msg91",
    modulePath: "./executors/n8n-nodes-base.msg91",
    exportName: "msg91Executor",
  },
  {
    type: "openflow-node-base.netlifyTool",
    modulePath: "./executors/netlifyTool",
    exportName: "netlifyToolExecutor",
  },
  {
    type: "openflow-node-base.nextCloudTool",
    modulePath: "./executors/n8n-nodes-base.nextCloudTool",
    exportName: "nextCloudToolExecutor",
  },
  {
    type: "openflow-node-base.npmTool",
    modulePath: "./executors/n8n-nodes-base.npmTool",
    exportName: "npmToolExecutor",
  },
  {
    type: "openflow-node-base.odooTool",
    modulePath: "./executors/n8n-nodes-base.odooTool",
    exportName: "odooToolExecutor",
  },
  {
    type: "openflow-node-base.oktaTool",
    modulePath: "./executors/okta",
    exportName: "oktaToolExecutor",
  },
  {
    type: "openflow-node-base.oneSimpleApiTool",
    modulePath: "./executors/oneSimpleApiTool",
    exportName: "oneSimpleApiToolExecutor",
  },
  {
    type: "openflow-node-base.onfleetTool",
    modulePath: "./executors/n8n-nodes-base.onfleetTool",
    exportName: "onfleetToolExecutor",
  },
  {
    type: "openflow-node-base.orbit",
    modulePath: "./executors/n8n-nodes-base.orbit",
    exportName: "orbitExecutor",
  },
  {
    type: "openflow-node-base.paddle",
    modulePath: "./executors/paddle",
    exportName: "paddleExecutor",
  },
  {
    type: "openflow-node-base.paddleTool",
    modulePath: "./executors/n8n-nodes-base.paddleTool",
    exportName: "paddleToolExecutor",
  },
  {
    type: "openflow-node-base.payPalTrigger",
    modulePath: "./executors/n8n-nodes-base.payPalTrigger",
    exportName: "payPalTriggerExecutor",
  },
  {
    type: "openflow-node-base.peekalink",
    modulePath: "./executors/peekalink",
    exportName: "peekalinkExecutor",
  },
  {
    type: "openflow-node-base.phantombusterTool",
    modulePath: "./executors/n8n-nodes-base.phantombusterTool",
    exportName: "phantombusterToolExecutor",
  },
  {
    type: "openflow-node-base.philipsHue",
    modulePath: "./executors/n8n-nodes-base.philipsHue",
    exportName: "philipsHueExecutor",
  },
  {
    type: "openflow-node-base.philipsHueTool",
    modulePath: "./executors/n8n-nodes-base.philipsHueTool",
    exportName: "philipsHueToolExecutor",
  },
  {
    type: "openflow-node-base.plivo",
    modulePath: "./executors/plivo",
    exportName: "plivoExecutor",
  },
  {
    type: "openflow-node-base.postBin",
    modulePath: "./executors/postBin",
    exportName: "postBinExecutor",
  },
  {
    type: "openflow-node-base.wufooTrigger",
    modulePath: "./executors/wufooTrigger",
    exportName: "wufooTriggerExecutor",
  },
];

/** Types OpenFlow ships an executor for. Derived, so it needs no maintenance. */
const builtinExecutorTypes = new Set(
  BUILTIN_EXECUTOR_MODULES.flatMap((e) => typeKeys(e.type)),
);

const builtinUnavailable = new Map(
  BUILTIN_EXECUTOR_MODULES.filter((e) => e.unavailable).flatMap((e) => {
    const u = e.unavailable!;
    return typeKeys(e.type).map((k) => [k, u] as const);
  }),
);

/**
 * Re-import builtin executor modules (cache-busted) and re-register.
 * Dev / OPENFLOW_HOT_NODES only in the HTTP route; safe to call from tests too.
 */
export async function reloadBuiltinExecutors(): Promise<{
  reloaded: string[];
  errors: Array<{ type: string; error: string }>;
}> {
  // Stub implementation
  return { reloaded: [], errors: [] };
}


