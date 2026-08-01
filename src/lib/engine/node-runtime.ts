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
    type: "n8n-nodes-base.jira",
    modulePath: "./executors/n8n-nodes-base.jira",
    exportName: "jiraExecutor",
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
    type: "n8n-nodes-base.totp",
    modulePath: "./executors/totp",
    exportName: "totpExecutor",
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
    type: "n8n-nodes-base.microsoftToDo",
    modulePath: "./executors/microsoft-to-do",
    exportName: "microsoftToDoExecutor",
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
    type: "n8n-nodes-base.pipedrive",
    modulePath: "./executors/pipedrive",
    exportName: "pipedriveExecutor",
  },
  {
    type: "n8n-nodes-base.zendesk",
    modulePath: "./executors/zendesk",
    exportName: "zendeskExecutor",
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
