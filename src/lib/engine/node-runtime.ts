/**
 * Mutable node runtime registry.
 * Boot seeds builtins; dev hot-reload can re-register without a full redesign.
 */
import type { NodeExecutor } from "@/sdk";
import type { INodeTypeDescription } from "@/lib/nodes/types";

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

function dualKeys(type: string): string[] {
  const keys = [type];
  if (type.startsWith("n8n-")) {
    keys.push(type.replace(/^n8n-/, ""));
  }
  return keys;
}

export function registerExecutor(type: string, executor: NodeExecutor): void {
  for (const key of dualKeys(type)) {
    executors.set(key, executor);
  }
}

export function registerDescription(description: INodeTypeDescription): void {
  for (const key of dualKeys(description.name)) {
    descriptions.set(key, description);
  }
}

export function registerAlias(fromType: string, toType: string): void {
  aliases.set(fromType, toType);
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
  const resolved = aliases.get(type) ?? type;
  return executors.get(resolved);
}

export function getDescription(type: string): INodeTypeDescription | undefined {
  const resolved = aliases.get(type) ?? type;
  return descriptions.get(resolved);
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
  const resolved = aliases.get(type) ?? type;
  return builtinExecutorTypes.has(resolved) || executors.has(resolved);
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
  const resolved = aliases.get(type) ?? type;
  // Deliberately does not consult the live `executors` map: seedBuiltinExecutors
  // registers these very executors, so presence there proves nothing about
  // whether a transport was supplied.
  return builtinUnavailable.get(resolved) ?? null;
}

export function listUnavailableExecutorTypes(): string[] {
  return [...builtinUnavailable.keys()].sort();
}

export function listExecutorTypes(): string[] {
  const types = new Set<string>();
  for (const key of executors.keys()) {
    if (key.startsWith("n8n-nodes-base.") || key.startsWith("openflow.")) {
      types.add(key);
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
    type: "n8n-nodes-base.manualTrigger",
    modulePath: "./executors/manual-trigger",
    exportName: "manualTriggerExecutor",
  },
  { type: "n8n-nodes-base.set", modulePath: "./executors/set", exportName: "setExecutor" },
  { type: "n8n-nodes-base.noOp", modulePath: "./executors/noop", exportName: "noopExecutor" },
  {
    type: "n8n-nodes-base.automizy",
    modulePath: "./executors/n8n-nodes-base.automizy",
    exportName: "automizyExecutor",
  },
  {
    type: "n8n-nodes-base.moveBinaryData",
    modulePath: "./executors/move-binary-data",
    exportName: "moveBinaryDataExecutor",
  },
  { type: "n8n-nodes-base.if", modulePath: "./executors/if", exportName: "ifExecutor" },
  {
    type: "n8n-nodes-base.httpRequest",
    modulePath: "./executors/http-request",
    exportName: "httpRequestExecutor",
  },
  { type: "n8n-nodes-base.code", modulePath: "./executors/code", exportName: "codeExecutor" },
  {
    type: "n8n-nodes-base.aiTransform",
    modulePath: "./executors/aiTransform",
    exportName: "aiTransformExecutor",
  },
  {
    type: "n8n-nodes-base.webhook",
    modulePath: "./executors/webhook",
    exportName: "webhookExecutor",
  },
  {
    type: "n8n-nodes-base.respondToWebhook",
    modulePath: "./executors/respond-to-webhook",
    exportName: "respondToWebhookExecutor",
  },
  {
    type: "n8n-nodes-base.switch",
    modulePath: "./executors/switch",
    exportName: "switchExecutor",
  },
  { type: "n8n-nodes-base.merge", modulePath: "./executors/merge", exportName: "mergeExecutor" },
  {
    type: "n8n-nodes-base.compareDatasets",
    modulePath: "./executors/compare-datasets",
    exportName: "compareDatasetsExecutor",
  },
  { type: "n8n-nodes-base.wait", modulePath: "./executors/wait", exportName: "waitExecutor" },
  {
    type: "n8n-nodes-base.splitOut",
    modulePath: "./executors/split-out",
    exportName: "splitOutExecutor",
  },
  {
    type: "n8n-nodes-base.aggregate",
    modulePath: "./executors/aggregate",
    exportName: "aggregateExecutor",
  },
  {
    type: "n8n-nodes-base.summarize",
    modulePath: "./executors/summarize",
    exportName: "summarizeExecutor",
  },
  {
    type: "n8n-nodes-base.filter",
    modulePath: "./executors/filter",
    exportName: "filterExecutor",
  },
  { type: "n8n-nodes-base.limit", modulePath: "./executors/limit", exportName: "limitExecutor" },
  {
    type: "n8n-nodes-base.removeDuplicates",
    modulePath: "./executors/remove-duplicates",
    exportName: "removeDuplicatesExecutor",
  },
  {
    type: "n8n-nodes-base.itemLists",
    modulePath: "./executors/item-lists",
    exportName: "itemListsExecutor",
  },
  {
    type: "n8n-nodes-base.dateTime",
    modulePath: "./executors/date-time",
    exportName: "dateTimeExecutor",
  },
  {
    type: "n8n-nodes-base.splitInBatches",
    modulePath: "./executors/split-in-batches",
    exportName: "splitInBatchesExecutor",
  },
  {
    type: "n8n-nodes-base.executeWorkflow",
    modulePath: "./executors/execute-workflow",
    exportName: "executeWorkflowExecutor",
  },
  {
    type: "n8n-nodes-base.executeWorkflowTrigger",
    modulePath: "./executors/execute-workflow-trigger",
    exportName: "executeWorkflowTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.executeCommandTool",
    modulePath: "./executors/executeCommandTool",
    exportName: "executeCommandToolExecutor",
  },
  {
    type: "n8n-nodes-base.stopAndError",
    modulePath: "./executors/stop-and-error",
    exportName: "stopAndErrorExecutor",
  },
  {
    type: "n8n-nodes-base.scheduleTrigger",
    modulePath: "./executors/schedule-trigger",
    exportName: "scheduleTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.sort",
    modulePath: "./executors/sort",
    exportName: "sortExecutor",
  },
  {
    type: "n8n-nodes-base.renameKeys",
    modulePath: "./executors/rename-keys",
    exportName: "renameKeysExecutor",
  },
  {
    type: "n8n-nodes-base.errorTrigger",
    modulePath: "./executors/error-trigger",
    exportName: "errorTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.ftp",
    modulePath: "./executors/ftp",
    exportName: "ftpExecutor",
  },
  {
    type: "n8n-nodes-base.ssh",
    modulePath: "./executors/ssh",
    exportName: "sshExecutor",
  },
  {
    type: "n8n-nodes-base.convertToFile",
    modulePath: "./executors/convert-to-file",
    exportName: "convertToFileExecutor",
  },
  {
    type: "n8n-nodes-base.extractFromFile",
    modulePath: "./executors/extract-from-file",
    exportName: "extractFromFileExecutor",
  },
  {
    type: "n8n-nodes-base.readPDF",
    modulePath: "./executors/read-pdf",
    exportName: "readPDFExecutor",
  },
  {
    type: "n8n-nodes-base.spreadsheetFile",
    modulePath: "./executors/spreadsheet-file",
    exportName: "spreadsheetFileExecutor",
  },
  {
    type: "n8n-nodes-base.readBinaryFile",
    modulePath: "./executors/readBinaryFile",
    exportName: "readBinaryFileExecutor",
  },
  {
    type: "n8n-nodes-base.readWriteFile",
    modulePath: "./executors/readWriteFile",
    exportName: "readWriteFileExecutor",
  },
  {
    type: "n8n-nodes-base.readBinaryFiles",
    modulePath: "./executors/readBinaryFiles",
    exportName: "readBinaryFilesExecutor",
  },
  {
    type: "n8n-nodes-base.writeBinaryFile",
    modulePath: "./executors/write-binary-file",
    exportName: "writeBinaryFileExecutor",
  },
  {
    type: "n8n-nodes-base.rssFeedRead",
    modulePath: "./executors/rss-feed-read",
    exportName: "rssFeedReadExecutor",
  },
  {
    type: "n8n-nodes-base.rssFeedReadTrigger",
    modulePath: "./executors/rss-feed-read-trigger",
    exportName: "rssFeedReadTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.emailSend",
    modulePath: "./executors/email-send",
    exportName: "emailSendExecutor",
  },
  {
    type: "n8n-nodes-base.dataTable",
    modulePath: "./executors/data-table",
    exportName: "dataTableExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    modulePath: "./executors/lm-chat-openai",
    exportName: "lmChatOpenAiExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmOpenAi",
    modulePath: "./executors/lm-openai",
    exportName: "lmOpenAiExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
    modulePath: "./executors/lm-chat-google-gemini",
    exportName: "lmChatGoogleGeminiExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatAnthropic",
    modulePath: "./executors/lm-chat-anthropic",
    exportName: "lmChatAnthropicExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatOllama",
    modulePath: "./executors/lm-chat-ollama",
    exportName: "lmChatOllamaExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenRouter",
    modulePath: "./executors/lm-chat-open-router",
    exportName: "lmChatOpenRouterExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.agent",
    modulePath: "./executors/langchain-agent",
    exportName: "langchainAgentExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.chainRetrievalQa",
    modulePath: "./executors/langchain-chain-retrieval-qa",
    exportName: "langchainChainRetrievalQaExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.chainSummarization",
    modulePath: "./executors/langchain-chain-summarization",
    exportName: "langchainChainSummarizationExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.chainLlm",
    modulePath: "./executors/chain-llm",
    exportName: "chainLlmExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.outputParserStructured",
    modulePath: "./executors/langchain-output-parser-structured",
    exportName: "langchainOutputParserStructuredExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.outputParserItemList",
    modulePath: "./executors/langchain-output-parser-item-list",
    exportName: "langchainOutputParserItemListExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.outputParserAutofixing",
    modulePath: "./executors/langchain-output-parser-autofixing",
    exportName: "langchainOutputParserAutofixingExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
    modulePath: "./executors/memory-buffer-window",
    exportName: "memoryBufferWindowExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.mcpClientTool",
    modulePath: "./executors/mcp-client-tool",
    exportName: "mcpClientToolExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.mcpTrigger",
    modulePath: "./executors/mcp-trigger",
    exportName: "mcpTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.microsoftAgent365Trigger",
    modulePath: "./executors/microsoft-agent-365-trigger",
    exportName: "microsoftAgent365TriggerExecutor",
  },
  {
    type: "n8n-nodes-base.stickyNote",
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
    type: "n8n-nodes-base.crypto",
    modulePath: "./executors/crypto",
    exportName: "cryptoExecutor",
  },
  {
    type: "n8n-nodes-base.xml",
    modulePath: "./executors/xml",
    exportName: "xmlExecutor",
  },
  {
    type: "n8n-nodes-base.html",
    modulePath: "./executors/html",
    exportName: "htmlExecutor",
  },
  {
    type: "n8n-nodes-base.markdown",
    modulePath: "./executors/markdown",
    exportName: "markdownExecutor",
  },
  {
    type: "n8n-nodes-base.editImage",
    modulePath: "./executors/editImage",
    exportName: "editImageExecutor",
  },
  {
    type: "n8n-nodes-base.jwt",
    modulePath: "./executors/jwt",
    exportName: "jwtExecutor",
  },
  {
    type: "n8n-nodes-base.compression",
    modulePath: "./executors/compression",
    exportName: "compressionExecutor",
  },
  {
    type: "n8n-nodes-base.executionData",
    modulePath: "./executors/executionData",
    exportName: "executionDataExecutor",
  },
  {
    type: "n8n-nodes-base.git",
    modulePath: "./executors/git",
    exportName: "gitExecutor",
  },
  {
    type: "n8n-nodes-base.formTrigger",
    modulePath: "./executors/form-trigger",
    exportName: "formTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.sseTrigger",
    modulePath: "./executors/sse-trigger",
    exportName: "sseTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.localFileTrigger",
    modulePath: "./executors/local-file-trigger",
    exportName: "localFileTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.chatTrigger",
    modulePath: "./executors/langchain-chat-trigger",
    exportName: "langchainChatTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.workflowTrigger",
    modulePath: "./executors/workflow-trigger",
    exportName: "workflowTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.activationTrigger",
    modulePath: "./executors/activation-trigger",
    exportName: "activationTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.n8nTrigger",
    modulePath: "./executors/n8n-trigger",
    exportName: "n8nTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.graphql",
    modulePath: "./executors/graphql",
    exportName: "graphqlExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.openAi",
    modulePath: "./executors/openai",
    exportName: "openAiExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
    modulePath: "./executors/vectorStoreInMemory",
    exportName: "vectorStoreInMemoryExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.vectorStoreMilvus",
    modulePath: "./executors/vectorStoreMilvus",
    exportName: "vectorStoreMilvusExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.code",
    modulePath: "./executors/langchain-code",
    exportName: "langchainCodeExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
    modulePath: "./executors/langchain-document-default-data-loader",
    exportName: "langchainDocumentDefaultDataLoaderExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
    modulePath: "./executors/langchain-text-splitter-recursive-character",
    exportName: "langchainTextSplitterRecursiveCharacterExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.embeddingsCohere",
    modulePath: "./executors/embeddings-cohere",
    exportName: "embeddingsCohereExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.anthropic",
    modulePath: "./executors/n8n-nodes-langchain.anthropic",
    exportName: "anthropicExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini",
    modulePath: "./executors/embeddings-google-gemini",
    exportName: "embeddingsGoogleGeminiExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.embeddingsOpenAi",
    modulePath: "./executors/embeddings-openai",
    exportName: "embeddingsOpenAiExecutor",
  },
  {
    type: "n8n-nodes-base.airtable",
    modulePath: "./executors/n8n-nodes-base.airtable",
    exportName: "airtableExecutor",
  },
  {
    type: "n8n-nodes-base.notion",
    modulePath: "./executors/notion",
    exportName: "notionExecutor",
  },
  {
    type: "n8n-nodes-base.notionTool",
    modulePath: "./executors/n8n-nodes-base.notionTool",
    exportName: "notionToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleDriveTool",
    modulePath: "./executors/n8n-nodes-base.googleDriveTool",
    exportName: "googleDriveToolExecutor",
  },
  {
    type: "n8n-nodes-base.whatsApp",
    modulePath: "./executors/n8n-nodes-base.whatsApp",
    exportName: "whatsAppExecutor",
  },
  {
    type: "n8n-nodes-base.telegram",
    modulePath: "./executors/telegram",
    exportName: "telegramExecutor",
  },
  {
    type: "n8n-nodes-base.telegramTool",
    modulePath: "./executors/n8n-nodes-base.telegramTool",
    exportName: "telegramToolExecutor",
  },
  {
    type: "n8n-nodes-base.webflow",
    modulePath: "./executors/webflow",
    exportName: "webflowExecutor",
  },
  {
    type: "n8n-nodes-base.gmail",
    modulePath: "./executors/n8n-nodes-base.gmail",
    exportName: "gmailExecutor",
  },
  {
    type: "n8n-nodes-base.slack",
    modulePath: "./executors/n8n-nodes-base.slack",
    exportName: "slackExecutor",
  },
  {
    type: "n8n-nodes-base.discord",
    modulePath: "./executors/n8n-nodes-base.discord",
    exportName: "discordExecutor",
  },
  {
    type: "n8n-nodes-base.discordTool",
    modulePath: "./executors/n8n-nodes-base.discordTool",
    exportName: "discordToolExecutor",
  },
  {
    type: "n8n-nodes-base.jira",
    modulePath: "./executors/n8n-nodes-base.jira",
    exportName: "jiraExecutor",
  },
  {
    type: "n8n-nodes-base.jiraTool",
    modulePath: "./executors/n8n-nodes-base.jiraTool",
    exportName: "jiraToolExecutor",
  },
  {
    type: "n8n-nodes-base.twilio",
    modulePath: "./executors/n8n-nodes-base.twilio",
    exportName: "twilioExecutor",
  },
  {
    type: "n8n-nodes-base.googleSheets",
    modulePath: "./executors/n8n-nodes-base.googleSheets",
    exportName: "googleSheetsExecutor",
  },
  {
    type: "n8n-nodes-base.googleDocs",
    modulePath: "./executors/n8n-nodes-base.googleDocs",
    exportName: "googleDocsExecutor",
  },
  {
    type: "n8n-nodes-base.googleCalendar",
    modulePath: "./executors/google-calendar",
    exportName: "googleCalendarExecutor",
  },
  {
    type: "n8n-nodes-base.youTube",
    modulePath: "./executors/youTube",
    exportName: "youTubeExecutor",
  },
  {
    type: "n8n-nodes-base.postgres",
    modulePath: "./executors/postgres",
    exportName: "postgresExecutor",
  },
  {
    type: "n8n-nodes-base.mySql",
    modulePath: "./executors/mySql",
    exportName: "mySqlExecutor",
  },
  {
    type: "n8n-nodes-base.mySqlTool",
    modulePath: "./executors/MySqlTool",
    exportName: "mySqlToolExecutor",
  },
  {
    type: "n8n-nodes-base.s3",
    modulePath: "./executors/s3",
    exportName: "s3Executor",
  },
  {
    type: "n8n-nodes-base.redis",
    modulePath: "./executors/redis",
    exportName: "redisExecutor",
  },
  {
    type: "n8n-nodes-base.hubspot",
    modulePath: "./executors/hubspot",
    exportName: "hubspotExecutor",
  },
  {
    type: "n8n-nodes-base.mongoDb",
    modulePath: "./executors/mongo-db",
    exportName: "mongoDbExecutor",
  },
  {
    type: "n8n-nodes-base.supabase",
    modulePath: "./executors/supabase",
    exportName: "supabaseExecutor",
  },
  {
    type: "n8n-nodes-base.supabaseTool",
    modulePath: "./executors/SupabaseTool",
    exportName: "supabaseToolExecutor",
  },
  {
    type: "n8n-nodes-base.facebookGraphApi",
    modulePath: "./executors/facebook-graph-api",
    exportName: "facebookGraphApiExecutor",
  },
  {
    type: "n8n-nodes-base.wordpress",
    modulePath: "./executors/wordpress",
    exportName: "wordpressExecutor",
  },
  {
    type: "n8n-nodes-base.debugHelper",
    modulePath: "./executors/debug-helper",
    exportName: "debugHelperExecutor",
  },
  {
    type: "n8n-nodes-base.executeCommand",
    modulePath: "./executors/execute-command",
    exportName: "executeCommandExecutor",
  },
  {
    type: "n8n-nodes-base.n8n",
    modulePath: "./executors/n8n",
    exportName: "n8nExecutor",
  },
  {
    type: "n8n-nodes-base.hackerNews",
    modulePath: "./executors/hacker-news",
    exportName: "hackerNewsExecutor",
  },
  {
    type: "n8n-nodes-base.hackerNewsTool",
    modulePath: "./executors/n8n-nodes-base.hackerNewsTool",
    exportName: "hackerNewsToolExecutor",
  },
  {
    type: "n8n-nodes-base.marketstackTool",
    modulePath: "./executors/n8n-nodes-base.marketstackTool",
    exportName: "marketstackToolExecutor",
  },
  {
    type: "n8n-nodes-base.evaluation",
    modulePath: "./executors/evaluation",
    exportName: "evaluationExecutor",
  },
  {
    type: "n8n-nodes-base.evaluationTrigger",
    modulePath: "./executors/evaluation-trigger",
    exportName: "evaluationTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.form",
    modulePath: "./executors/form",
    exportName: "formExecutor",
  },
  {
    type: "n8n-nodes-base.gmailTrigger",
    modulePath: "./executors/gmail-trigger",
    exportName: "gmailTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.totp",
    modulePath: "./executors/totp",
    exportName: "totpExecutor",
  },
  {
    type: "n8n-nodes-base.timeSaved",
    modulePath: "./executors/n8n-nodes-base.timeSaved",
    exportName: "timeSavedExecutor",
  },
  {
    type: "n8n-nodes-base.ldap",
    modulePath: "./executors/ldap",
    exportName: "ldapExecutor",
    unavailable: {
      setter: "setLdapClientFactory",
      reason: "Directory queries need an LDAP client (e.g. ldapjs), which is not bundled in this build.",
    },
  },
  {
    type: "n8n-nodes-base.iCalendar",
    modulePath: "./executors/iCalendar",
    exportName: "iCalendarExecutor",
  },
  {
    type: "n8n-nodes-base.quickChart",
    modulePath: "./executors/quick-chart",
    exportName: "quickChartExecutor",
  },
  {
    type: "n8n-nodes-mcp.mcpClientTool",
    modulePath: "./executors/mcp-community-client",
    exportName: "mcpCommunityClientExecutor",
  },
  {
    type: "n8n-nodes-base.awsS3",
    modulePath: "./executors/awsS3",
    exportName: "awsS3Executor",
  },
  {
    type: "n8n-nodes-base.awsS3Tool",
    modulePath: "./executors/awsS3Tool",
    exportName: "awsS3ToolExecutor",
  },
  {
    type: "n8n-nodes-base.homeAssistant",
    modulePath: "./executors/home-assistant",
    exportName: "homeAssistantExecutor",
  },
  {
    type: "n8n-nodes-base.mailgun",
    modulePath: "./executors/mailgun",
    exportName: "mailgunExecutor",
  },
  {
    type: "n8n-nodes-base.mattermost",
    modulePath: "./executors/n8n-nodes-base.mattermost",
    exportName: "mattermostExecutor",
  },
  {
    type: "n8n-nodes-base.googleSlides",
    modulePath: "./executors/n8n-nodes-base.googleSlides",
    exportName: "googleSlidesExecutor",
  },
  {
    type: "n8n-nodes-base.matrix",
    modulePath: "./executors/matrix",
    exportName: "matrixExecutor",
  },
  {
    type: "n8n-nodes-base.rocketchat",
    modulePath: "./executors/rocketchat",
    exportName: "rocketchatExecutor",
  },
  {
    type: "n8n-nodes-base.gotify",
    modulePath: "./executors/gotify",
    exportName: "gotifyExecutor",
  },
  {
    type: "n8n-nodes-base.pushbullet",
    modulePath: "./executors/pushbullet",
    exportName: "pushbulletExecutor",
  },
  {
    type: "n8n-nodes-base.pushover",
    modulePath: "./executors/pushover",
    exportName: "pushoverExecutor",
  },
  {
    type: "n8n-nodes-base.messageBird",
    modulePath: "./executors/message-bird",
    exportName: "messageBirdExecutor",
  },
  {
    type: "n8n-nodes-base.sms77",
    modulePath: "./executors/n8n-nodes-base.sms77",
    exportName: "sms77Executor",
  },
  {
    type: "n8n-nodes-base.sendGrid",
    modulePath: "./executors/n8n-nodes-base.sendGrid",
    exportName: "sendGridExecutor",
  },
  {
    type: "n8n-nodes-base.sendInBlue",
    modulePath: "./executors/sendInBlue",
    exportName: "sendInBlueExecutor",
  },
  {
    type: "n8n-nodes-base.mailjet",
    modulePath: "./executors/mailjet",
    exportName: "mailjetExecutor",
  },
  {
    type: "n8n-nodes-base.mailchimp",
    modulePath: "./executors/mailchimp",
    exportName: "mailchimpExecutor",
  },
  {
    type: "n8n-nodes-base.postmarkTrigger",
    modulePath: "./executors/postmark-trigger",
    exportName: "postmarkTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.emailReadImap",
    modulePath: "./executors/email-read-imap",
    exportName: "emailReadImapExecutor",
    unavailable: {
      setter: "setImapTransportFactory",
      reason: "Reading mail needs an IMAP client (e.g. imapflow), which is not bundled in this build.",
    },
  },
  {
    type: "n8n-nodes-base.microsoftOneDrive",
    modulePath: "./executors/microsoft-one-drive",
    exportName: "microsoftOneDriveExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftExcel",
    modulePath: "./executors/microsoft-excel",
    exportName: "microsoftExcelExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftSharePoint",
    modulePath: "./executors/microsoft-sharepoint",
    exportName: "microsoftSharePointExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftSql",
    modulePath: "./executors/microsoftSql",
    exportName: "microsoftSqlExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftEntra",
    modulePath: "./executors/microsoft-entra",
    exportName: "microsoftEntraExecutor",
  },
  {
    type: "n8n-nodes-base.googleAnalytics",
    modulePath: "./executors/google-analytics",
    exportName: "googleAnalyticsExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftTeams",
    modulePath: "./executors/microsoft-teams",
    exportName: "microsoftTeamsExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftToDo",
    modulePath: "./executors/microsoft-to-do",
    exportName: "microsoftToDoExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftToDoTool",
    modulePath: "./executors/n8n-nodes-base.microsoftToDoTool",
    exportName: "microsoftToDoToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleTasks",
    modulePath: "./executors/n8n-nodes-base.googleTasks",
    exportName: "googleTasksExecutor",
  },
  {
    type: "n8n-nodes-base.googleContacts",
    modulePath: "./executors/google-contacts",
    exportName: "googleContactsExecutor",
  },
  {
    type: "n8n-nodes-base.googleTranslate",
    modulePath: "./executors/google-translate",
    exportName: "googleTranslateExecutor",
  },
  {
    type: "n8n-nodes-base.googleAds",
    modulePath: "./executors/google-ads",
    exportName: "googleAdsExecutor",
  },
  {
    type: "n8n-nodes-base.googleBigQuery",
    modulePath: "./executors/google-bigquery",
    exportName: "googleBigQueryExecutor",
  },
  {
    type: "n8n-nodes-base.googleBusinessProfile",
    modulePath: "./executors/google-business-profile",
    exportName: "googleBusinessProfileExecutor",
  },
  {
    type: "n8n-nodes-base.googleBusinessProfileTrigger",
    modulePath: "./executors/google-business-profile-trigger",
    exportName: "googleBusinessProfileTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.googleCloudStorage",
    modulePath: "./executors/google-cloud-storage",
    exportName: "googleCloudStorageExecutor",
  },
  {
    type: "n8n-nodes-base.gSuiteAdmin",
    modulePath: "./executors/g-suite-admin",
    exportName: "gSuiteAdminExecutor",
  },
  {
    type: "n8n-nodes-base.gSuiteAdminTool",
    modulePath: "./executors/g-suite-admin-tool",
    exportName: "gSuiteAdminToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleChat",
    modulePath: "./executors/googleChat",
    exportName: "googleChatExecutor",
  },
  {
    type: "n8n-nodes-base.clickUp",
    modulePath: "./executors/clickUp",
    exportName: "clickUpExecutor",
  },
  {
    type: "n8n-nodes-base.clickUpTool",
    modulePath: "./executors/n8n-nodes-base.clickUpTool",
    exportName: "clickUpToolExecutor",
  },
  {
    type: "n8n-nodes-base.trello",
    modulePath: "./executors/trello",
    exportName: "trelloExecutor",
  },
  {
    type: "n8n-nodes-base.asana",
    modulePath: "./executors/asana",
    exportName: "asanaExecutor",
  },
  {
    type: "n8n-nodes-base.asanaTool",
    modulePath: "./executors/n8n-nodes-base.asanaTool",
    exportName: "asanaToolExecutor",
  },
  {
    type: "n8n-nodes-base.githubTrigger",
    modulePath: "./executors/github-trigger",
    exportName: "githubTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.mondayCom",
    modulePath: "./executors/monday-com",
    exportName: "mondayComExecutor",
  },
  {
    type: "n8n-nodes-base.todoist",
    modulePath: "./executors/todoist",
    exportName: "todoistExecutor",
  },
  {
    type: "n8n-nodes-base.linear",
    modulePath: "./executors/linear",
    exportName: "linearExecutor",
  },
  {
    type: "n8n-nodes-base.gitlab",
    modulePath: "./executors/gitlab",
    exportName: "gitlabExecutor",
  },
  {
    type: "n8n-nodes-base.gitlabTrigger",
    modulePath: "./executors/gitlab-trigger",
    exportName: "gitlabTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.bitbucketTrigger",
    modulePath: "./executors/bitbucket-trigger",
    exportName: "bitbucketTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.jenkins",
    modulePath: "./executors/jenkins",
    exportName: "jenkinsExecutor",
  },
  {
    type: "n8n-nodes-base.circleCi",
    modulePath: "./executors/circle-ci",
    exportName: "circleCiExecutor",
  },
  {
    type: "n8n-nodes-base.salesforce",
    modulePath: "./executors/salesforce",
    exportName: "salesforceExecutor",
  },
  {
    type: "n8n-nodes-base.salesforceTool",
    modulePath: "./executors/n8n-nodes-base.salesforceTool",
    exportName: "salesforceToolExecutor",
  },
  {
    type: "n8n-nodes-base.pipedrive",
    modulePath: "./executors/pipedrive",
    exportName: "pipedriveExecutor",
  },
  {
    type: "n8n-nodes-base.pipedriveTool",
    modulePath: "./executors/n8n-nodes-base.pipedriveTool",
    exportName: "pipedriveToolExecutor",
  },
  {
    type: "n8n-nodes-base.zammad",
    modulePath: "./executors/n8n-nodes-base.zammad",
    exportName: "zammadExecutor",
  },
  {
    type: "n8n-nodes-base.zendesk",
    modulePath: "./executors/zendesk",
    exportName: "zendeskExecutor",
  },
  {
    type: "n8n-nodes-base.zendeskTool",
    modulePath: "./executors/n8n-nodes-base.zendeskTool",
    exportName: "zendeskToolExecutor",
  },
  {
    type: "n8n-nodes-base.zendeskTrigger",
    modulePath: "./executors/zendesk-trigger",
    exportName: "zendeskTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.zohoCrm",
    modulePath: "./executors/zoho-crm",
    exportName: "zohoCrmExecutor",
  },
  {
    type: "n8n-nodes-base.highLevel",
    modulePath: "./executors/highLevel",
    exportName: "highLevelExecutor",
  },
  {
    type: "n8n-nodes-base.odoo",
    modulePath: "./executors/odoo",
    exportName: "odooExecutor",
  },
  {
    type: "n8n-nodes-base.hubspotTrigger",
    modulePath: "./executors/hubspot-trigger",
    exportName: "hubspotTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.wooCommerce",
    modulePath: "./executors/woo-commerce",
    exportName: "wooCommerceExecutor",
  },
  {
    type: "n8n-nodes-base.shopify",
    modulePath: "./executors/shopify",
    exportName: "shopifyExecutor",
  },
  {
    type: "n8n-nodes-base.stripe",
    modulePath: "./executors/n8n-nodes-base.stripe",
    exportName: "stripeExecutor",
  },
  {
    type: "n8n-nodes-base.stripeTool",
    modulePath: "./executors/n8n-nodes-base.stripeTool",
    exportName: "stripeToolExecutor",
  },
{
    type: "n8n-nodes-base.snowflake",
    modulePath: "./executors/n8n-nodes-base.snowflake",
    exportName: "snowflakeExecutor",
  },
  {
    type: "n8n-nodes-base.kafka",
    modulePath: "./executors/kafkaNode",
    exportName: "kafkaExecutor",
  },
  {
    type: "n8n-nodes-base.mqtt",
    modulePath: "./executors/mqtt",
    exportName: "mqttExecutor",
  },
  {
    type: "n8n-nodes-base.rabbitmqTrigger",
    modulePath: "./executors/rabbitmqTrigger",
    exportName: "rabbitmqTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.nocoDb",
    modulePath: "./executors/n8n-nodes-base.nocoDb",
    exportName: "nocoDbExecutor",
  },
  {
    type: "n8n-nodes-base.stripeTrigger",
    modulePath: "./executors/stripe-trigger",
    exportName: "stripeTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.quickbooks",
    modulePath: "./executors/n8n-nodes-base.quickbooks",
    exportName: "quickbooksExecutor",
  },
  {
    type: "n8n-nodes-base.xero",
    modulePath: "./executors/n8n-nodes-base.xero",
    exportName: "xeroExecutor",
  },
  {
    type: "n8n-nodes-base.payPal",
    modulePath: "./executors/n8n-nodes-base.payPal",
    exportName: "payPalExecutor",
  },
  {
    type: "n8n-nodes-base.pagerDuty",
    modulePath: "./executors/pagerDuty",
    exportName: "pagerDutyExecutor",
  },
  {
    type: "n8n-nodes-base.pagerDutyTool",
    modulePath: "./executors/n8n-nodes-base.pagerDutyTool",
    exportName: "pagerDutyToolExecutor",
  },
  {
    type: "n8n-nodes-base.baserow",
    modulePath: "./executors/n8n-nodes-base.baserow",
    exportName: "baserowExecutor",
  },
  {
    type: "n8n-nodes-base.dropbox",
    modulePath: "./executors/n8n-nodes-base.dropbox",
    exportName: "dropboxExecutor",
  },
  {
    type: "n8n-nodes-base.nextCloud",
    modulePath: "./executors/nextCloud",
    exportName: "nextCloudExecutor",
  },
  {
    type: "n8n-nodes-base.awsLambda",
    modulePath: "./executors/aws-lambda",
    exportName: "awsLambdaExecutor",
  },
  {
    type: "n8n-nodes-base.awsSes",
    modulePath: "./executors/n8n-nodes-base.awsSes",
    exportName: "awsSesExecutor",
  },
  {
    type: "n8n-nodes-base.awsIam",
    modulePath: "./executors/n8n-nodes-base.awsIam",
    exportName: "awsIamExecutor",
  },
  {
    type: "n8n-nodes-base.elasticsearch",
    modulePath: "./executors/elasticsearch",
    exportName: "elasticsearchExecutor",
  },
  {
    type: "n8n-nodes-base.rabbitmq",
    modulePath: "./executors/rabbitmq",
    exportName: "rabbitmqExecutor",
  },
  {
    type: "n8n-nodes-base.amqp",
    modulePath: "./executors/amqp",
    exportName: "amqpExecutor",
  },
  {
    // Not `unavailable`: redisTrigger.ts ships a real lazy-import default over
    // ioredis (a declared dependency), exactly like the redis executor.
    type: "n8n-nodes-base.redisTrigger",
    modulePath: "./executors/redisTrigger",
    exportName: "redisTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.postgresTrigger",
    modulePath: "./executors/postgres-trigger",
    exportName: "postgresTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.modelSelector",
    modulePath: "./executors/langchain-model-selector",
    exportName: "langchainModelSelectorExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.guardrails",
    modulePath: "./executors/guardrails",
    exportName: "guardrailsExecutor",
  },
  {
    type: "n8n-nodes-base.httpRequestTool",
    modulePath: "./executors/httpRequestTool",
    exportName: "httpRequestToolExecutor",
  },
  {
    type: "n8n-nodes-base.gmailTool",
    modulePath: "./executors/n8n-nodes-base.gmailTool",
    exportName: "gmailToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleSheetsTool",
    modulePath: "./executors/n8n-nodes-base.googleSheetsTool",
    exportName: "googleSheetsToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleCalendarTool",
    modulePath: "./executors/n8n-nodes-base.googleCalendarTool",
    exportName: "googleCalendarToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleTasksTool",
    modulePath: "./executors/n8n-nodes-base.googleTasksTool",
    exportName: "googleTasksToolExecutor",
  },
  {
    type: "n8n-nodes-base.wooCommerceTool",
    modulePath: "./executors/n8n-nodes-base.wooCommerceTool",
    exportName: "wooCommerceToolExecutor",
  },
  {
    type: "n8n-nodes-base.cryptoTool",
    modulePath: "./executors/cryptoTool",
    exportName: "cryptoToolExecutor",
  },
  {
    type: "n8n-nodes-base.rssFeedReadTool",
    modulePath: "./executors/rssFeedReadTool",
    exportName: "rssFeedReadToolExecutor",
  },
  {
    type: "n8n-nodes-base.dateTimeTool",
    modulePath: "./executors/dateTimeTool",
    exportName: "dateTimeToolExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.toolSearXng",
    modulePath: "./executors/tool-searxng",
    exportName: "toolSearXngExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.toolWikipedia",
    modulePath: "./executors/toolWikipedia",
    exportName: "toolWikipediaExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.toolWolframAlpha",
    modulePath: "./executors/tool-wolfram-alpha",
    exportName: "toolWolframAlphaExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.retrieverVectorStore",
    modulePath: "./executors/retrieverVectorStore",
    exportName: "retrieverVectorStoreExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.memoryManager",
    modulePath: "./executors/n8n-nodes-langchain.memoryManager",
    exportName: "n8nNodesLangchainMemoryManagerExecutor",
  },
  {
    type: "n8n-nodes-base.chargebeeTrigger",
    modulePath: "./executors/n8n-nodes-base.chargebeeTrigger",
    exportName: "chargebeeTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.convertKitTrigger",
    modulePath: "./executors/convertKitTrigger",
    exportName: "convertKitTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.perplexity",
    modulePath: "./executors/perplexity",
    exportName: "perplexityExecutor",
  },
  {
    type: "n8n-nodes-base.telegramTrigger",
    modulePath: "./executors/telegram-trigger",
    exportName: "telegramTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.googleGemini",
    modulePath: "./executors/google-gemini",
    exportName: "googleGeminiExecutor",
  },
  {
    type: "n8n-nodes-base.googleDrive",
    modulePath: "./executors/googleDrive",
    exportName: "googleDriveExecutor",
  },
  {
    type: "n8n-nodes-base.googleDriveTrigger",
    modulePath: "./executors/google-drive-trigger",
    exportName: "googleDriveTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.toolWorkflow",
    modulePath: "./executors/toolWorkflow",
    exportName: "toolWorkflowExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.informationExtractor",
    modulePath: "./executors/langchain-information-extractor",
    exportName: "langchainInformationExtractorExecutor",
  },
  {
    type: "n8n-nodes-base.googleSheetsTrigger",
    modulePath: "./executors/google-sheets-trigger",
    exportName: "googleSheetsTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatGroq",
    modulePath: "./executors/lm-chat-groq",
    exportName: "lmChatGroqExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatMistralCloud",
    modulePath: "./executors/lm-chat-mistral-cloud",
    exportName: "lmChatMistralCloudExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.toolThink",
    modulePath: "./executors/toolThink",
    exportName: "toolThinkExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.vectorStoreSupabase",
    modulePath: "./executors/vectorStoreSupabase",
    exportName: "vectorStoreSupabaseExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.vectorStorePinecone",
    modulePath: "./executors/vectorStorePinecone",
    exportName: "vectorStorePineconeExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.toolCalculator",
    modulePath: "./executors/toolCalculator",
    exportName: "toolCalculatorExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
    modulePath: "./executors/lm-chat-deepseek",
    exportName: "lmChatDeepSeekExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatAzureOpenAi",
    modulePath: "./executors/lm-chat-azure-openai",
    exportName: "lmChatAzureOpenAiExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.agentTool",
    modulePath: "./executors/langchain-agent-tool",
    exportName: "langchainAgentToolExecutor",
  },
  {
    type: "n8n-nodes-base.linkedIn",
    modulePath: "./executors/linkedin",
    exportName: "linkedInExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.textClassifier",
    modulePath: "./executors/langchain-text-classifier",
    exportName: "langchainTextClassifierExecutor",
  },
  {
    type: "n8n-nodes-base.whatsAppTrigger",
    modulePath: "./executors/whatsapp-trigger",
    exportName: "whatsAppTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.github",
    modulePath: "./executors/github",
    exportName: "githubExecutor",
  },
  {
    type: "n8n-nodes-base.twitter",
    modulePath: "./executors/twitter",
    exportName: "twitterExecutor",
  },
  {
    type: "n8n-nodes-base.twitterTool",
    modulePath: "./executors/twitterTool",
    exportName: "twitterToolExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftOutlook",
    modulePath: "./executors/microsoft-outlook",
    exportName: "microsoftOutlookExecutor",
  },
  {
    type: "n8n-nodes-base.openThesaurus",
    modulePath: "./executors/openThesaurus",
    exportName: "openThesaurusExecutor",
  },
  {
    type: "n8n-nodes-base.openAi",
    modulePath: "./executors/openai",
    exportName: "openAiExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.googleGeminiTool",
    modulePath: "./executors/n8n-nodes-langchain.googleGeminiTool",
    exportName: "googleGeminiToolExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.toolCode",
    modulePath: "./executors/toolCode",
    exportName: "toolCodeExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.vectorStoreQdrant",
    modulePath: "./executors/vectorStoreQdrant",
    exportName: "vectorStoreQdrantExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.vectorStorePGVector",
    modulePath: "./executors/vectorStorePGVector",
    exportName: "vectorStorePGVectorExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.memoryPostgresChat",
    modulePath: "./executors/memory-postgres-chat",
    exportName: "memoryPostgresChatExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.memoryRedisChat",
    modulePath: "./executors/memory-redis-chat",
    exportName: "memoryRedisChatExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.memoryMongoDbChat",
    modulePath: "./executors/memory-mongodb-chat",
    exportName: "memoryMongoDbChatExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.toolHttpRequest",
    modulePath: "./executors/toolHttpRequest",
    exportName: "toolHttpRequestExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.toolVectorStore",
    modulePath: "./executors/toolVectorStore",
    exportName: "toolVectorStoreExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.toolSerpApi",
    modulePath: "./executors/toolSerpApi",
    exportName: "toolSerpApiExecutor",
  },
  {
    type: "n8n-nodes-base.slackTrigger",
    modulePath: "./executors/slack-trigger",
    exportName: "slackTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.jotFormTrigger",
    modulePath: "./executors/jotform-trigger",
    exportName: "jotFormTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.reddit",
    modulePath: "./executors/reddit",
    exportName: "redditExecutor",
  },
  {
    type: "n8n-nodes-base.perplexityTool",
    modulePath: "./executors/n8n-nodes-base.perplexityTool",
    exportName: "perplexityToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleDocsTool",
    modulePath: "./executors/n8n-nodes-base.googleDocsTool",
    exportName: "googleDocsToolExecutor",
  },
  {
    type: "n8n-nodes-base.airtableTool",
    modulePath: "./executors/n8n-nodes-base.airtableTool",
    exportName: "airtableToolExecutor",
  },
  {
    type: "n8n-nodes-base.airtop",
    modulePath: "./executors/n8n-nodes-base.airtop",
    exportName: "airtopExecutor",
  },
  {
    type: "n8n-nodes-base.airtopTool",
    modulePath: "./executors/n8n-nodes-base.airtopTool",
    exportName: "airtopToolExecutor",
  },
  {
    type: "n8n-nodes-base.shopifyTrigger",
    modulePath: "./executors/n8n-nodes-base.shopifyTrigger",
    exportName: "shopifyTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.sentimentAnalysis",
    modulePath: "./executors/sentimentAnalysis",
    exportName: "sentimentAnalysisExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.chat",
    modulePath: "./executors/n8n-nodes-langchain.chat",
    exportName: "n8nNodesLangchainChatExecutor",
  },
  {
    type: "n8n-nodes-base.postgresTool",
    modulePath: "./executors/PostgresTool",
    exportName: "postgresToolExecutor",
  },
  {
    type: "n8n-nodes-base.typeformTrigger",
    modulePath: "./executors/n8n-nodes-base.typeformTrigger",
    exportName: "typeformTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.slackTool",
    modulePath: "./executors/n8n-nodes-base.slackTool",
    exportName: "slackToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleSlidesTool",
    modulePath: "./executors/n8n-nodes-base.googleSlidesTool",
    exportName: "googleSlidesToolExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.rerankerCohere",
    modulePath: "./executors/reranker-cohere",
    exportName: "rerankerCohereExecutor",
  },
  {
    type: "n8n-nodes-base.airtableTrigger",
    modulePath: "./executors/n8n-nodes-base.airtableTrigger",
    exportName: "airtableTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.textSplitterCharacterTextSplitter",
    modulePath: "./executors/textSplitterCharacterTextSplitter",
    exportName: "textSplitterCharacterTextSplitterExecutor",
  },
  {
    type: "n8n-nodes-base.googleCalendarTrigger",
    modulePath: "./executors/google-calendar-trigger",
    exportName: "googleCalendarTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.dataTableTool",
    modulePath: "./executors/n8n-nodes-base.dataTableTool",
    exportName: "dataTableToolExecutor",
  },
  {
    type: "n8n-nodes-base.discourse",
    modulePath: "./executors/discourse",
    exportName: "discourseExecutor",
  },
  {
    type: "n8n-nodes-base.hunter",
    modulePath: "./executors/n8n-nodes-base.hunter",
    exportName: "hunterExecutor",
  },
  {
    type: "n8n-nodes-base.notionTrigger",
    modulePath: "./executors/n8n-nodes-base.notionTrigger",
    exportName: "notionTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.calendlyTrigger",
    modulePath: "./executors/n8n-nodes-base.calendlyTrigger",
    exportName: "calendlyTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.textSplitterTokenSplitter",
    modulePath: "./executors/textSplitterTokenSplitter",
    exportName: "textSplitterTokenSplitterExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmOllama",
    modulePath: "./executors/lm-ollama",
    exportName: "lmOllamaExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftOutlookTrigger",
    modulePath: "./executors/microsoft-outlook-trigger",
    exportName: "microsoftOutlookTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.openWeatherMap",
    modulePath: "./executors/n8n-nodes-base.openWeatherMap",
    exportName: "openWeatherMapExecutor",
  },
  {
    type: "n8n-nodes-base.openWeatherMapTool",
    modulePath: "./executors/n8n-nodes-base.openWeatherMapTool",
    exportName: "openWeatherMapToolExecutor",
  },
  {
    type: "n8n-nodes-base.htmlExtract",
    modulePath: "./executors/htmlExtract",
    exportName: "htmlExtractExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatXAiGrok",
    modulePath: "./executors/lm-chat-xai-grok",
    exportName: "lmChatXAiGrokExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.embeddingsOllama",
    modulePath: "./executors/embeddings-ollama",
    exportName: "embeddingsOllamaExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas",
    modulePath: "./executors/vectorStoreMongoDBAtlas",
    exportName: "vectorStoreMongoDBAtlasExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.embeddingsMistralCloud",
    modulePath: "./executors/embeddings-mistral-cloud",
    exportName: "embeddingsMistralCloudExecutor",
  },
  {
    type: "n8n-nodes-base.spotify",
    modulePath: "./executors/spotify",
    exportName: "spotifyExecutor",
  },
  {
    type: "n8n-nodes-base.strava",
    modulePath: "./executors/n8n-nodes-base.strava",
    exportName: "stravaExecutor",
  },
  {
    type: "n8n-nodes-base.wooCommerceTrigger",
    modulePath: "./executors/n8n-nodes-base.wooCommerceTrigger",
    exportName: "wooCommerceTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.Brandfetch",
    modulePath: "./executors/Brandfetch",
    exportName: "brandfetchExecutor",
  },
  {
    type: "n8n-nodes-base.clearbit",
    modulePath: "./executors/n8n-nodes-base.clearbit",
    exportName: "clearbitExecutor",
  },
  {
    type: "n8n-nodes-base.deepL",
    modulePath: "./executors/deepL",
    exportName: "deepLExecutor",
  },
  {
    type: "n8n-nodes-base.deepLTool",
    modulePath: "./executors/deepLTool",
    exportName: "deepLToolExecutor",
  },
  {
    type: "n8n-nodes-base.zoom",
    modulePath: "./executors/n8n-nodes-base.zoom",
    exportName: "zoomExecutor",
  },
  {
    type: "n8n-nodes-base.twilioTrigger",
    modulePath: "./executors/n8n-nodes-base.twilioTrigger",
    exportName: "twilioTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.apiTemplateIo",
    modulePath: "./executors/ApiTemplateIoExecutor",
    exportName: "apiTemplateIoExecutor",
  },
  {
    type: "n8n-nodes-base.jinaAi",
    modulePath: "./executors/n8n-nodes-base.jinaAi",
    exportName: "jinaAiExecutor",
  },
  {
    type: "n8n-nodes-base.mistralAi",
    modulePath: "./executors/n8n-nodes-base.mistralAi",
    exportName: "mistralAiExecutor",
  },
  {
    type: "n8n-nodes-base.phantombuster",
    modulePath: "./executors/n8n-nodes-base.phantombuster",
    exportName: "phantombusterExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.mcpClient",
    modulePath: "./executors/mcp-client",
    exportName: "mcpClientExecutor",
  },
  {
    type: "n8n-nodes-base.mautic",
    modulePath: "./executors/mautic",
    exportName: "mauticExecutor",
  },
  {
    type: "n8n-nodes-base.mauticTrigger",
    modulePath: "./executors/n8n-nodes-base.mauticTrigger",
    exportName: "mauticTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.pipedriveTrigger",
    modulePath: "./executors/n8n-nodes-base.pipedriveTrigger",
    exportName: "pipedriveTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.calTrigger",
    modulePath: "./executors/cal-trigger",
    exportName: "calTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.serviceNow",
    modulePath: "./executors/serviceNow",
    exportName: "serviceNowExecutor",
  },
  {
    type: "n8n-nodes-base.uproc",
    modulePath: "./executors/n8n-nodes-base.uproc",
    exportName: "uprocExecutor",
  },
  {
    type: "n8n-nodes-base.dropcontact",
    modulePath: "./executors/n8n-nodes-base.dropcontact",
    exportName: "dropcontactExecutor",
  },
  {
    type: "n8n-nodes-base.highLevelTool",
    modulePath: "./executors/n8n-nodes-base.highLevelTool",
    exportName: "highLevelToolExecutor",
  },
  {
    type: "n8n-nodes-base.wordpressTool",
    modulePath: "./executors/n8n-nodes-base.wordpressTool",
    exportName: "wordpressToolExecutor",
  },
  {
    type: "n8n-nodes-base.nasa",
    modulePath: "./executors/nasa",
    exportName: "nasaExecutor",
  },
  {
    type: "n8n-nodes-base.hubspotTool",
    modulePath: "./executors/n8n-nodes-base.hubspotTool",
    exportName: "hubspotToolExecutor",
  },
  {
    type: "n8n-nodes-base.lemlist",
    modulePath: "./executors/n8n-nodes-base.lemlist",
    exportName: "lemlistExecutor",
  },
  {
    type: "n8n-nodes-base.githubTool",
    modulePath: "./executors/n8n-nodes-base.githubTool",
    exportName: "githubToolExecutor",
  },
  {
    type: "n8n-nodes-base.webflowTrigger",
    modulePath: "./executors/n8n-nodes-base.webflowTrigger",
    exportName: "webflowTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.figmaTrigger",
    modulePath: "./executors/n8n-nodes-base.figmaTrigger",
    exportName: "figmaTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatGoogleVertex",
    modulePath: "./executors/lm-chat-google-vertex",
    exportName: "lmChatGoogleVertexExecutor",
  },
  {
    type: "n8n-nodes-base.clickUpTrigger",
    modulePath: "./executors/clickUpTrigger",
    exportName: "clickUpTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.jiraTrigger",
    modulePath: "./executors/jira-trigger",
    exportName: "jiraTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.googleCloudNaturalLanguage",
    modulePath: "./executors/googleCloudNaturalLanguage",
    exportName: "googleCloudNaturalLanguageExecutor",
  },
  {
    type: "n8n-nodes-base.jinaAiTool",
    modulePath: "./executors/jinaAiTool",
    exportName: "jinaAiToolExecutor",
  },
  {
    type: "n8n-nodes-base.salesforceTrigger",
    modulePath: "./executors/n8n-nodes-base.salesforceTrigger",
    exportName: "salesforceTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.telegramHitlTool",
    modulePath: "./executors/n8n-nodes-base.telegramHitlTool",
    exportName: "telegramHitlToolExecutor",
  },
  {
    type: "n8n-nodes-base.slackHitlTool",
    modulePath: "./executors/n8n-nodes-base.slackHitlTool",
    exportName: "slackHitlToolExecutor",
  },
  {
    type: "n8n-nodes-base.todoistTool",
    modulePath: "./executors/n8n-nodes-base.todoistTool",
    exportName: "todoistToolExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.vectorStoreWeaviate",
    modulePath: "./executors/vectorStoreWeaviate",
    exportName: "vectorStoreWeaviateExecutor",
  },
  {
    type: "n8n-nodes-base.emailSendTool",
    modulePath: "./executors/emailSendTool",
    exportName: "emailSendToolExecutor",
  },
  {
    type: "n8n-nodes-base.facebookLeadAdsTrigger",
    modulePath: "./executors/n8n-nodes-base.facebookLeadAdsTrigger",
    exportName: "facebookLeadAdsTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.linearTrigger",
    modulePath: "./executors/linearTrigger",
    exportName: "linearTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftOutlookTool",
    modulePath: "./executors/n8n-nodes-base.microsoftOutlookTool",
    exportName: "microsoftOutlookToolExecutor",
  },
  {
    type: "n8n-nodes-base.mqttTrigger",
    modulePath: "./executors/mqttTrigger",
    exportName: "mqttTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.shopifyTool",
    modulePath: "./executors/n8n-nodes-base.shopifyTool",
    exportName: "shopifyToolExecutor",
  },
  {
    type: "n8n-nodes-base.trelloTrigger",
    modulePath: "./executors/trelloTrigger",
    exportName: "trelloTriggerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.embeddingsAzureOpenAi",
    modulePath: "./executors/embeddings-azure-openai",
    exportName: "embeddingsAzureOpenAiExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatAwsBedrock",
    modulePath: "./executors/lm-chat-aws-bedrock",
    exportName: "lmChatAwsBedrockExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.manualChatTrigger",
    modulePath: "./executors/langchain-manual-chat-trigger",
    exportName: "langchainManualChatTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.bambooHr",
    modulePath: "./executors/n8n-nodes-base.bambooHr",
    exportName: "bambooHrExecutor",
  },
  {
    type: "n8n-nodes-base.bannerbear",
    modulePath: "./executors/BannerbearExecutor",
    exportName: "bannerbearExecutor",
  },
  {
    type: "n8n-nodes-base.baserowTool",
    modulePath: "./executors/baserowTool",
    exportName: "baserowToolExecutor",
  },
  {
    type: "n8n-nodes-base.box",
    modulePath: "./executors/box",
    exportName: "boxExecutor",
  },
  {
    type: "n8n-nodes-base.googleContactsTool",
    modulePath: "./executors/n8n-nodes-base.googleContactsTool",
    exportName: "googleContactsToolExecutor",
  },
  {
    type: "n8n-nodes-base.clockify",
    modulePath: "./executors/clockify",
    exportName: "clockifyExecutor",
  },
  {
    type: "n8n-nodes-base.clockifyTool",
    modulePath: "./executors/n8n-nodes-base.clockifyTool",
    exportName: "clockifyToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleFirebaseCloudFirestore",
    modulePath: "./executors/googleFirebaseCloudFirestore",
    exportName: "googleFirebaseCloudFirestoreExecutor",
  },
  {
    type: "n8n-nodes-base.googleFirebaseCloudFirestoreTool",
    modulePath: "./executors/googleFirebaseCloudFirestoreTool",
    exportName: "googleFirebaseCloudFirestoreToolExecutor",
  },
  {
    type: "n8n-nodes-base.onfleetTrigger",
    modulePath: "./executors/n8n-nodes-base.onfleetTrigger",
    exportName: "onfleetTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.mindee",
    modulePath: "./executors/mindee",
    exportName: "mindeeExecutor",
  },
  {
    type: "n8n-nodes-base.redditTool",
    modulePath: "./executors/n8n-nodes-base.redditTool",
    exportName: "redditToolExecutor",
  },
  {
    type: "n8n-nodes-base.uptimeRobot",
    modulePath: "./executors/uptimeRobot",
    exportName: "uptimeRobotExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.embeddingsHuggingFaceInference",
    modulePath: "./executors/embeddings-huggingface-inference",
    exportName: "embeddingsHuggingFaceInferenceExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmOpenHuggingFaceInference",
    modulePath: "./executors/lmOpenHuggingFaceInference",
    exportName: "lmOpenHuggingFaceInferenceExecutor",
  },
  {
    type: "n8n-nodes-base.awsTextract",
    modulePath: "./executors/awsTextract",
    exportName: "awsTextractExecutor",
  },
  {
    type: "n8n-nodes-base.awsTranscribe",
    modulePath: "./executors/awsTranscribe",
    exportName: "awsTranscribeExecutor",
  },
  {
    type: "n8n-nodes-base.azureStorage",
    modulePath: "./executors/azureStorage",
    exportName: "azureStorageExecutor",
  },
  {
    type: "n8n-nodes-base.bitly",
    modulePath: "./executors/n8n-nodes-base.bitly",
    exportName: "bitlyExecutor",
  },
  {
    type: "n8n-nodes-base.dropboxTool",
    modulePath: "./executors/n8n-nodes-base.dropboxTool",
    exportName: "dropboxToolExecutor",
  },
  {
    type: "n8n-nodes-base.eventbriteTrigger",
    modulePath: "./executors/eventbriteTrigger",
    exportName: "eventbriteTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.facebookTrigger",
    modulePath: "./executors/facebookTrigger",
    exportName: "facebookTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.freshdesk",
    modulePath: "./executors/freshdesk",
    exportName: "freshdeskExecutor",
  },
  {
    type: "n8n-nodes-base.freshdeskTool",
    modulePath: "./executors/freshdeskTool",
    exportName: "freshdeskToolExecutor",
  },
  {
    type: "n8n-nodes-base.ghost",
    modulePath: "./executors/ghost",
    exportName: "ghostExecutor",
  },
  {
    type: "n8n-nodes-base.gumroadTrigger",
    modulePath: "./executors/gumroad-trigger",
    exportName: "gumroadTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.humanticAi",
    modulePath: "./executors/humantic-ai",
    exportName: "humanticAiExecutor",
  },
  {
    type: "n8n-nodes-base.googleAnalyticsTool",
    modulePath: "./executors/googleAnalyticsTool",
    exportName: "googleAnalyticsToolExecutor",
  },
  {
    type: "n8n-nodes-base.demio",
    modulePath: "./executors/communication/demio",
    exportName: "demioExecutor",
  },
  {
    type: "n8n-nodes-base.intercom",
    modulePath: "./executors/n8n-nodes-base.intercom",
    exportName: "intercomExecutor",
  },
  {
    type: "n8n-nodes-base.lemlistTrigger",
    modulePath: "./executors/n8n-nodes-base.lemlistTrigger",
    exportName: "lemlistTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.lingvaNex",
    modulePath: "./executors/lingvaNex",
    exportName: "lingvaNexExecutor",
  },
  {
    type: "n8n-nodes-base.mailchimpTrigger",
    modulePath: "./executors/n8n-nodes-base.mailchimpTrigger",
    exportName: "mailchimpTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.medium",
    modulePath: "./executors/medium",
    exportName: "mediumExecutor",
  },
  {
    type: "n8n-nodes-base.microsoftOneDriveTrigger",
    modulePath: "./executors/microsoft-one-drive-trigger",
    exportName: "microsoftOneDriveTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.onfleet",
    modulePath: "./executors/n8n-nodes-base.onfleet",
    exportName: "onfleetExecutor",
  },
  {
    type: "n8n-nodes-base.quickbooksTool",
    modulePath: "./executors/n8n-nodes-base.quickbooksTool",
    exportName: "quickbooksToolExecutor",
  },
  {
    type: "n8n-nodes-base.redisTool",
    modulePath: "./executors/n8n-nodes-base.redisTool",
    exportName: "redisToolExecutor",
  },
  {
    type: "n8n-nodes-base.raindrop",
    modulePath: "./executors/raindrop",
    exportName: "raindropExecutor",
  },
  {
    type: "n8n-nodes-base.sendInBlueTrigger",
    modulePath: "./executors/brevoTrigger",
    exportName: "brevoTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.strapi",
    modulePath: "./executors/n8n-nodes-base.strapi",
    exportName: "strapiExecutor",
  },
  {
    type: "n8n-nodes-base.theHive",
    modulePath: "./executors/theHive",
    exportName: "theHiveExecutor",
  },
  {
    type: "n8n-nodes-base.trelloTool",
    modulePath: "./executors/n8n-nodes-base.trelloTool",
    exportName: "trelloToolExecutor",
  },
  {
    type: "n8n-nodes-base.urlScanIo",
    modulePath: "./executors/n8n-nodes-base.urlScanIo",
    exportName: "urlScanIoExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.chatHitlTool",
    modulePath: "./executors/n8n-nodes-langchain.chatHitlTool",
    exportName: "n8nNodesLangchainChatHitlToolExecutor",
  },
  {
    type: "n8n-nodes-base.vonage",
    modulePath: "./executors/vonage",
    exportName: "vonageExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatCohere",
    modulePath: "./executors/lm-chat-cohere",
    exportName: "lmChatCohereExecutor",
  },
  {
    type: "n8n-nodes-base.awsCertificateManager",
    modulePath: "./executors/awsCertificateManager",
    exportName: "awsCertificateManagerExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.retrieverWorkflow",
    modulePath: "./executors/retrieverWorkflow",
    exportName: "retrieverWorkflowExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.vectorStoreRedis",
    modulePath: "./executors/vectorStoreRedis",
    exportName: "vectorStoreRedisExecutor",
  },
  {
    type: "n8n-nodes-base.amqpTrigger",
    modulePath: "./executors/amqpTrigger",
    exportName: "amqpTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.activeCampaign",
    modulePath: "./executors/n8n-nodes-base.activeCampaign",
    exportName: "activeCampaignExecutor",
  },
  {
    type: "n8n-nodes-base.asanaTrigger",
    modulePath: "./executors/n8n-nodes-base.asanaTrigger",
    exportName: "asanaTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.coinGecko",
    modulePath: "./executors/coinGecko",
    exportName: "coinGeckoExecutor",
  },
  {
    type: "n8n-nodes-base.coinGeckoTool",
    modulePath: "./executors/n8n-nodes-base.coinGeckoTool",
    exportName: "coinGeckoToolExecutor",
  },
  {
    type: "n8n-nodes-base.cortex",
    modulePath: "./executors/n8n-nodes-base.cortex",
    exportName: "cortexExecutor",
  },
  {
    type: "n8n-nodes-base.activeCampaignTrigger",
    modulePath: "./executors/activeCampaignTrigger",
    exportName: "activeCampaignTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.convertKit",
    modulePath: "./executors/convertKit",
    exportName: "convertKitExecutor",
  },
  {
    type: "n8n-nodes-base.convertKitTool",
    modulePath: "./executors/n8n-nodes-base.convertKitTool",
    exportName: "convertKitToolExecutor",
  },
  {
    type: "n8n-nodes-base.crateDb",
    modulePath: "./executors/n8n-nodes-base.crateDb",
    exportName: "crateDbExecutor",
  },
  {
    type: "n8n-nodes-base.dhl",
    modulePath: "./executors/n8n-nodes-base.dhl",
    exportName: "dhlExecutor",
  },
  {
    type: "n8n-nodes-base.dhlTool",
    modulePath: "./executors/dhlTool",
    exportName: "dhlToolExecutor",
  },
  {
    type: "n8n-nodes-base.goToWebinar",
    modulePath: "./executors/n8n-nodes-base.goToWebinar",
    exportName: "goToWebinarExecutor",
  },
  {
    type: "n8n-nodes-base.filemaker",
    modulePath: "./executors/filemaker",
    exportName: "filemakerExecutor",
  },
  {
    type: "n8n-nodes-base.googleAdsTool",
    modulePath: "./executors/n8n-nodes-base.googleAdsTool",
    exportName: "googleAdsToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleBooks",
    modulePath: "./executors/googleBooks",
    exportName: "googleBooksExecutor",
  },
  {
    type: "n8n-nodes-base.googleDriveSearch",
    modulePath: "./executors/n8n-nodes-base.googleDriveSearch",
    exportName: "googleDriveSearchExecutor",
  },
  {
    type: "n8n-nodes-base.hunterTool",
    modulePath: "./executors/hunterTool",
    exportName: "hunterToolExecutor",
  },
  {
    type: "n8n-nodes-base.keap",
    modulePath: "./executors/n8n-nodes-base.keap",
    exportName: "keapExecutor",
  },
  {
    type: "n8n-nodes-base.linearTool",
    modulePath: "./executors/n8n-nodes-base.linearTool",
    exportName: "linearToolExecutor",
  },
  {
    type: "n8n-nodes-base.linkedInTool",
    modulePath: "./executors/linkedInTool",
    exportName: "linkedInToolExecutor",
  },
  {
    type: "n8n-nodes-base.nasaTool",
    modulePath: "./executors/nasaTool",
    exportName: "nasaToolExecutor",
  },
  {
    type: "n8n-nodes-base.mongoDbTool",
    modulePath: "./executors/n8n-nodes-base.mongoDbTool",
    exportName: "mongoDbToolExecutor",
  },
  {
    type: "n8n-nodes-base.nocoDbTool",
    modulePath: "./executors/n8n-nodes-base.nocoDbTool",
    exportName: "nocoDbToolExecutor",
  },
  {
    type: "n8n-nodes-base.netlifyTrigger",
    modulePath: "./executors/netlifyTrigger",
    exportName: "netlifyTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.oneSimpleApi",
    modulePath: "./executors/oneSimpleApi",
    exportName: "oneSimpleApiExecutor",
  },
  {
    type: "n8n-nodes-base.signl4",
    modulePath: "./executors/signl4",
    exportName: "signl4Executor",
  },
  {
    type: "n8n-nodes-base.spotifyTool",
    modulePath: "./executors/n8n-nodes-base.spotifyTool",
    exportName: "spotifyToolExecutor",
  },
  {
    type: "n8n-nodes-base.theHiveProject",
    modulePath: "./executors/theHiveProject",
    exportName: "theHiveProjectExecutor",
  },
  {
    type: "n8n-nodes-base.webSearch",
    modulePath: "./executors/webSearch",
    exportName: "webSearchExecutor",
  },
  {
    type: "n8n-nodes-base.webflowTool",
    modulePath: "./executors/n8n-nodes-base.webflowTool",
    exportName: "webflowToolExecutor",
  },
  {
    type: "n8n-nodes-base.whatsAppTool",
    modulePath: "./executors/whatsapp-tool",
    exportName: "whatsAppToolExecutor",
  },
  {
    type: "n8n-nodes-base.zulip",
    modulePath: "./executors/n8n-nodes-base.zulip",
    exportName: "zulipExecutor",
  },
  {
    type: "n8n-nodes-base.discourse",
    modulePath: "./executors/discourse",
    exportName: "discourseExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.anthropicTool",
    modulePath: "./executors/n8n-nodes-langchain.anthropicTool",
    exportName: "anthropicToolExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.embeddingsAwsBedrock",
    modulePath: "./executors/embeddings-aws-bedrock",
    exportName: "embeddingsAwsBedrockExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.lmChatMoonshot",
    modulePath: "./executors/lm-chat-moonshot",
    exportName: "lmChatMoonshotExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.ollama",
    modulePath: "./executors/ollama-app",
    exportName: "ollamaAppExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.vectorStoreSupabaseInsert",
    modulePath: "./executors/vectorStoreSupabaseInsert",
    exportName: "vectorStoreSupabaseInsertExecutor",
  },
  {
    type: "n8n-nodes-base.acuitySchedulingTrigger",
    modulePath: "./executors/acuitySchedulingTrigger",
    exportName: "acuitySchedulingTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.actionNetworkTool",
    modulePath: "./executors/ActionNetworkTool",
    exportName: "actionNetworkToolExecutor",
  },
  {
    type: "n8n-nodes-base.affinity",
    modulePath: "./executors/affinity",
    exportName: "affinityExecutor",
  },
  {
    type: "n8n-nodes-base.affinityTrigger",
    modulePath: "./executors/affinityTrigger",
    exportName: "affinityTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.affinityTool",
    modulePath: "./executors/n8n-nodes-base.affinityTool",
    exportName: "affinityToolExecutor",
  },
  {
    type: "n8n-nodes-base.agileCrm",
    modulePath: "./executors/n8n-nodes-base.agileCrm",
    exportName: "agileCrmExecutor",
  },
  {
    type: "n8n-nodes-base.autopilotTool",
    modulePath: "./executors/n8n-nodes-base.autopilotTool",
    exportName: "autopilotToolExecutor",
  },
  {
    type: "n8n-nodes-base.autopilotTrigger",
    modulePath: "./executors/autopilot-trigger",
    exportName: "autopilotTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.awsRekognition",
    modulePath: "./executors/awsRekognition",
    exportName: "awsRekognitionExecutor",
  },
  {
    type: "n8n-nodes-base.awsDynamoDb",
    modulePath: "./executors/awsDynamoDb",
    exportName: "awsDynamoDbExecutor",
  },
  {
    type: "n8n-nodes-base.awsSns",
    modulePath: "./executors/awsSns",
    exportName: "awsSnsExecutor",
  },
  {
    type: "n8n-nodes-base.awsSqs",
    modulePath: "./executors/awsSqs",
    exportName: "awsSqsExecutor",
  },
  {
    type: "n8n-nodes-base.awsSnsTrigger",
    modulePath: "./executors/awsSnsTrigger",
    exportName: "awsSnsTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.awsTranscribeTool",
    modulePath: "./executors/awsTranscribeTool",
    exportName: "awsTranscribeToolExecutor",
  },
  {
    type: "n8n-nodes-base.beeminderTool",
    modulePath: "./executors/n8n-nodes-base.beeminderTool",
    exportName: "beeminderToolExecutor",
  },
  {
    type: "n8n-nodes-base.bitlyTool",
    modulePath: "./executors/n8n-nodes-base.bitlyTool",
    exportName: "bitlyToolExecutor",
  },
  {
    type: "n8n-nodes-base.boxTrigger",
    modulePath: "./executors/box-trigger",
    exportName: "boxTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.bitwardenTool",
    modulePath: "./executors/bitwardenTool",
    exportName: "bitwardenToolExecutor",
  },
  {
    type: "n8n-nodes-base.bubbleTool",
    modulePath: "./executors/n8n-nodes-base.bubbleTool",
    exportName: "bubbleToolExecutor",
  },
  {
    type: "n8n-nodes-base.chargebee",
    modulePath: "./executors/Chargebee",
    exportName: "chargebeeExecutor",
  },
  {
    type: "n8n-nodes-base.cheerio",
    modulePath: "./executors/cheerio",
    exportName: "cheerioExecutor",
  },
  {
    type: "n8n-nodes-base.circleCiTool",
    modulePath: "./executors/n8n-nodes-base.circleCiTool",
    exportName: "circleCiToolExecutor",
  },
  {
    type: "n8n-nodes-base.clearbitTool",
    modulePath: "./executors/n8n-nodes-base.clearbitTool",
    exportName: "clearbitToolExecutor",
  },
  {
    type: "n8n-nodes-base.clockifyTrigger",
    modulePath: "./executors/n8n-nodes-base.clockifyTrigger",
    exportName: "clockifyTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.cloudflareTool",
    modulePath: "./executors/cloudflareTool",
    exportName: "cloudflareToolExecutor",
  },
  {
    type: "n8n-nodes-base.cockpit",
    modulePath: "./executors/cockpit",
    exportName: "cockpitExecutor",
  },
  {
    type: "n8n-nodes-base.codaTool",
    modulePath: "./executors/n8n-nodes-base.codaTool",
    exportName: "codaToolExecutor",
  },
  {
    type: "n8n-nodes-base.contentful",
    modulePath: "./executors/contentful",
    exportName: "contentfulExecutor",
  },
  {
    type: "n8n-nodes-base.copper",
    modulePath: "./executors/copper",
    exportName: "copperExecutor",
  },
  {
    type: "n8n-nodes-base.copperTool",
    modulePath: "./executors/n8n-nodes-base.copperTool",
    exportName: "copperToolExecutor",
  },
  {
    type: "n8n-nodes-base.copperTrigger",
    modulePath: "./executors/copperTrigger",
    exportName: "copperTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.customerIoTool",
    modulePath: "./executors/n8n-nodes-base.customerIoTool",
    exportName: "customerIoToolExecutor",
  },
  {
    type: "n8n-nodes-base.customerIoTrigger",
    modulePath: "./executors/n8n-nodes-base.customerIoTrigger",
    exportName: "customerIoTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.discourse",
    modulePath: "./executors/discourse",
    exportName: "discourseExecutor",
  },
  {
    type: "n8n-nodes-base.disqus",
    modulePath: "./executors/n8n-nodes-base.disqus",
    exportName: "disqusExecutor",
  },
  {
    type: "n8n-nodes-base.drift",
    modulePath: "./executors/drift",
    exportName: "driftExecutor",
  },
  {
    type: "n8n-nodes-base.driftTool",
    modulePath: "./executors/n8n-nodes-base.driftTool",
    exportName: "driftToolExecutor",
  },
  {
    type: "n8n-nodes-base.dropcontactTool",
    modulePath: "./executors/n8n-nodes-base.dropcontactTool",
    exportName: "dropcontactToolExecutor",
  },
  {
    type: "n8n-nodes-base.egoi",
    modulePath: "./executors/n8n-nodes-base.egoi",
    exportName: "egoiExecutor",
  },
  {
    type: "n8n-nodes-base.elasticSecurityTool",
    modulePath: "./executors/ElasticSecurityExecutor",
    exportName: "elasticSecurityExecutor",
  },
  {
    type: "n8n-nodes-base.elevenLabs",
    modulePath: "./executors/ElevenLabs",
    exportName: "elevenLabsExecutor",
  },
  {
    type: "n8n-nodes-base.emailSendHitlTool",
    modulePath: "./executors/n8n-nodes-base.emailSendHitlTool",
    exportName: "emailSendHitlToolExecutor",
  },
  {
    type: "n8n-nodes-base.emelia",
    modulePath: "./executors/n8n-nodes-base.emelia",
    exportName: "emeliaExecutor",
  },
  {
    type: "n8n-nodes-base.emeliaTrigger",
    modulePath: "./executors/n8n-nodes-base.emeliaTrigger",
    exportName: "emeliaTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.flowTrigger",
    modulePath: "./executors/flowTrigger",
    exportName: "flowTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.formIoTrigger",
    modulePath: "./executors/formIoTrigger",
    exportName: "formIoTriggerExecutor",
  },
  {
    type: "n8n-nodes-base.freshworksCrm",
    modulePath: "./executors/n8n-nodes-base.freshworksCrm",
    exportName: "freshworksCrmExecutor",
  },
  {
    type: "n8n-nodes-base.getResponse",
    modulePath: "./executors/getResponse",
    exportName: "getResponseExecutor",
  },
  {
    type: "n8n-nodes-base.gong",
    modulePath: "./executors/gong",
    exportName: "gongExecutor",
  },
  {
    type: "n8n-nodes-base.gongTool",
    modulePath: "./executors/gongTool",
    exportName: "gongToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleCloudStorageTool",
    modulePath: "./executors/n8n-nodes-base.googleCloudStorageTool",
    exportName: "googleCloudStorageToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleCloudNaturalLanguageTool",
    modulePath: "./executors/googleCloudNaturalLanguageTool",
    exportName: "googleCloudNaturalLanguageToolExecutor",
  },
  {
    type: "n8n-nodes-base.googleCustomSearch",
    modulePath: "./executors/googleCustomSearch",
    exportName: "googleCustomSearchExecutor",
  },
];

/** Types OpenFlow ships an executor for. Derived, so it needs no maintenance. */
const builtinExecutorTypes = new Set(BUILTIN_EXECUTOR_MODULES.map((e) => e.type));

const builtinUnavailable = new Map(
  BUILTIN_EXECUTOR_MODULES.filter((e) => e.unavailable).map(
    (e) => [e.type, e.unavailable!] as const,
  ),
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


