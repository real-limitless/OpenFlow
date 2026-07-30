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
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
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

export function markRuntimeSeeded(): void {
  seeded = true;
}

/**
 * Known builtin executor modules for dev reload.
 * Add new builtins here when OpenCode batches land.
 */
export const BUILTIN_EXECUTOR_MODULES: Array<{
  type: string;
  modulePath: string;
  exportName: string;
}> = [
  {
    type: "n8n-nodes-base.manualTrigger",
    modulePath: "./executors/manual-trigger",
    exportName: "manualTriggerExecutor",
  },
  { type: "n8n-nodes-base.set", modulePath: "./executors/set", exportName: "setExecutor" },
  { type: "n8n-nodes-base.noOp", modulePath: "./executors/noop", exportName: "noopExecutor" },
  { type: "n8n-nodes-base.if", modulePath: "./executors/if", exportName: "ifExecutor" },
  {
    type: "n8n-nodes-base.httpRequest",
    modulePath: "./executors/http-request",
    exportName: "httpRequestExecutor",
  },
  { type: "n8n-nodes-base.code", modulePath: "./executors/code", exportName: "codeExecutor" },
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
    type: "@n8n/n8n-nodes-langchain.agent",
    modulePath: "./executors/langchain-agent",
    exportName: "langchainAgentExecutor",
  },
  {
    type: "@n8n/n8n-nodes-langchain.mcpClientTool",
    modulePath: "./executors/mcp-client-tool",
    exportName: "mcpClientToolExecutor",
  },
  {
    type: "n8n-nodes-base.stickyNote",
    modulePath: "./executors/sticky-note",
    exportName: "stickyNoteExecutor",
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
    type: "@n8n/n8n-nodes-langchain.chatTrigger",
    modulePath: "./executors/langchain-chat-trigger",
    exportName: "langchainChatTriggerExecutor",
  },
];

/**
 * Re-import builtin executor modules (cache-busted) and re-register.
 * Dev / OPENFLOW_HOT_NODES only in the HTTP route; safe to call from tests too.
 */
export async function reloadBuiltinExecutors(): Promise<{
  reloaded: string[];
  errors: Array<{ type: string; error: string }>;
}> {
  const reloaded: string[] = [];
  const errors: Array<{ type: string; error: string }> = [];
  const bust = `?t=${Date.now()}`;

  for (const entry of BUILTIN_EXECUTOR_MODULES) {
    try {
      const mod = await import(/* @vite-ignore */ `${entry.modulePath}.ts${bust}`);
      const executor = mod[entry.exportName] as NodeExecutor | undefined;
      if (typeof executor !== "function") {
        errors.push({ type: entry.type, error: `export ${entry.exportName} missing` });
        continue;
      }
      registerExecutor(entry.type, executor);
      reloaded.push(entry.type);
    } catch (err) {
      // Fallback without .ts suffix (vitest / node resolution)
      try {
        const mod = await import(/* @vite-ignore */ `${entry.modulePath}${bust}`);
        const executor = mod[entry.exportName] as NodeExecutor | undefined;
        if (typeof executor !== "function") {
          errors.push({ type: entry.type, error: `export ${entry.exportName} missing` });
          continue;
        }
        registerExecutor(entry.type, executor);
        reloaded.push(entry.type);
      } catch (err2) {
        errors.push({
          type: entry.type,
          error: err2 instanceof Error ? err2.message : String(err2 ?? err),
        });
      }
    }
  }

  return { reloaded, errors };
}
