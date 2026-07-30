import type { NodeExecutor } from "../types";
import { manualTriggerExecutor } from "./manual-trigger";
import { setExecutor } from "./set";
import { noopExecutor } from "./noop";
import { ifExecutor } from "./if";
import { httpRequestExecutor } from "./http-request";
import { codeExecutor } from "./code";
import { webhookExecutor } from "./webhook";
import { respondToWebhookExecutor } from "./respond-to-webhook";
import { switchExecutor } from "./switch";
import { mergeExecutor } from "./merge";
import { compareDatasetsExecutor } from "./compare-datasets";
import { waitExecutor } from "./wait";
import { splitOutExecutor } from "./split-out";
import { aggregateExecutor } from "./aggregate";
import { summarizeExecutor } from "./summarize";
import { filterExecutor } from "./filter";
import { limitExecutor } from "./limit";
import { removeDuplicatesExecutor } from "./remove-duplicates";
import { itemListsExecutor } from "./item-lists";
import { dateTimeExecutor } from "./date-time";
import { splitInBatchesExecutor } from "./split-in-batches";
import { executeWorkflowExecutor } from "./execute-workflow";
import { executeWorkflowTriggerExecutor } from "./execute-workflow-trigger";
import { stopAndErrorExecutor } from "./stop-and-error";
import { scheduleTriggerExecutor } from "./schedule-trigger";
import { sortExecutor } from "./sort";
import { renameKeysExecutor } from "./rename-keys";
import { errorTriggerExecutor } from "./error-trigger";
import { ftpExecutor } from "./ftp";
import { convertToFileExecutor } from "./convert-to-file";
import { extractFromFileExecutor } from "./extract-from-file";
import { emailSendExecutor } from "./email-send";
import { dataTableExecutor } from "./data-table";
import { lmChatOpenAiExecutor } from "./lm-chat-openai";
import { langchainAgentExecutor } from "./langchain-agent";
import { mcpClientToolExecutor } from "./mcp-client-tool";
import { stickyNoteExecutor } from "./sticky-note";
import { cryptoExecutor } from "./crypto";
import { xmlExecutor } from "./xml";
import { htmlExecutor } from "./html";
import { markdownExecutor } from "./markdown";
import { jwtExecutor } from "./jwt";
import { compressionExecutor } from "./compression";
import { executionDataExecutor } from "./executionData";
import { formTriggerExecutor } from "./form-trigger";
import { sseTriggerExecutor } from "./sse-trigger";
import { langchainChatTriggerExecutor } from "./langchain-chat-trigger";
import {
  defaultExecutors,
  getExecutorMap,
  isRuntimeSeeded,
  markRuntimeSeeded,
  registerExecutor,
} from "../node-runtime";

const BUILTIN_PAIRS: Array<[string, NodeExecutor]> = [
  ["n8n-nodes-base.manualTrigger", manualTriggerExecutor],
  ["n8n-nodes-base.scheduleTrigger", scheduleTriggerExecutor],
  ["n8n-nodes-base.errorTrigger", errorTriggerExecutor],
  ["n8n-nodes-base.sseTrigger", sseTriggerExecutor],
  ["n8n-nodes-base.set", setExecutor],
  ["n8n-nodes-base.noOp", noopExecutor],
  ["n8n-nodes-base.if", ifExecutor],
  ["n8n-nodes-base.httpRequest", httpRequestExecutor],
  ["n8n-nodes-base.code", codeExecutor],
  ["n8n-nodes-base.webhook", webhookExecutor],
  ["n8n-nodes-base.respondToWebhook", respondToWebhookExecutor],
  ["n8n-nodes-base.switch", switchExecutor],
  ["n8n-nodes-base.merge", mergeExecutor],
  ["n8n-nodes-base.compareDatasets", compareDatasetsExecutor],
  ["n8n-nodes-base.wait", waitExecutor],
  ["n8n-nodes-base.splitOut", splitOutExecutor],
  ["n8n-nodes-base.aggregate", aggregateExecutor],
  ["n8n-nodes-base.summarize", summarizeExecutor],
  ["n8n-nodes-base.filter", filterExecutor],
  ["n8n-nodes-base.limit", limitExecutor],
  ["n8n-nodes-base.removeDuplicates", removeDuplicatesExecutor],
  ["n8n-nodes-base.itemLists", itemListsExecutor],
  ["n8n-nodes-base.dateTime", dateTimeExecutor],
  ["n8n-nodes-base.sort", sortExecutor],
  ["n8n-nodes-base.renameKeys", renameKeysExecutor],
  ["n8n-nodes-base.splitInBatches", splitInBatchesExecutor],
  ["n8n-nodes-base.executeWorkflow", executeWorkflowExecutor],
  ["n8n-nodes-base.executeWorkflowTrigger", executeWorkflowTriggerExecutor],
  ["n8n-nodes-base.stopAndError", stopAndErrorExecutor],
  ["n8n-nodes-base.ftp", ftpExecutor],
  ["n8n-nodes-base.convertToFile", convertToFileExecutor],
  ["n8n-nodes-base.extractFromFile", extractFromFileExecutor],
  ["n8n-nodes-base.emailSend", emailSendExecutor],
  ["n8n-nodes-base.dataTable", dataTableExecutor],
  ["@n8n/n8n-nodes-langchain.lmChatOpenAi", lmChatOpenAiExecutor],
  ["@n8n/n8n-nodes-langchain.agent", langchainAgentExecutor],
  ["@n8n/n8n-nodes-langchain.mcpClientTool", mcpClientToolExecutor],
  ["n8n-nodes-base.stickyNote", stickyNoteExecutor],
  ["n8n-nodes-base.crypto", cryptoExecutor],
  ["n8n-nodes-base.xml", xmlExecutor],
  ["n8n-nodes-base.html", htmlExecutor],
  ["n8n-nodes-base.markdown", markdownExecutor],
  ["n8n-nodes-base.jwt", jwtExecutor],
  ["n8n-nodes-base.compression", compressionExecutor],
  ["n8n-nodes-base.executionData", executionDataExecutor],
  ["n8n-nodes-base.formTrigger", formTriggerExecutor],
  ["@n8n/n8n-nodes-langchain.chatTrigger", langchainChatTriggerExecutor],
];

/** Seed the live runtime from static builtin imports (idempotent). */
export function seedBuiltinExecutors(): void {
  for (const [type, executor] of BUILTIN_PAIRS) {
    registerExecutor(type, executor);
  }
  markRuntimeSeeded();
}

if (!isRuntimeSeeded()) {
  seedBuiltinExecutors();
} else {
  // Re-seed on hot module re-evaluation so new builtins register
  seedBuiltinExecutors();
}

export { defaultExecutors, getExecutorMap };

export { manualTriggerExecutor } from "./manual-trigger";
export { setExecutor } from "./set";
export { noopExecutor } from "./noop";
export { ifExecutor } from "./if";
export { httpRequestExecutor } from "./http-request";
export { codeExecutor } from "./code";
export { webhookExecutor } from "./webhook";
export { respondToWebhookExecutor } from "./respond-to-webhook";
export { switchExecutor } from "./switch";
export { mergeExecutor } from "./merge";
export { compareDatasetsExecutor } from "./compare-datasets";
export { waitExecutor } from "./wait";
export { splitOutExecutor } from "./split-out";
export { aggregateExecutor } from "./aggregate";
export { summarizeExecutor } from "./summarize";
export { filterExecutor } from "./filter";
export { limitExecutor } from "./limit";
export { removeDuplicatesExecutor } from "./remove-duplicates";
export { itemListsExecutor } from "./item-lists";
export { dateTimeExecutor } from "./date-time";
export { splitInBatchesExecutor } from "./split-in-batches";
export { executeWorkflowExecutor } from "./execute-workflow";
export { executeWorkflowTriggerExecutor } from "./execute-workflow-trigger";
export { stopAndErrorExecutor } from "./stop-and-error";
export { scheduleTriggerExecutor } from "./schedule-trigger";
export { sortExecutor } from "./sort";
export { renameKeysExecutor } from "./rename-keys";
export { errorTriggerExecutor } from "./error-trigger";
export { ftpExecutor } from "./ftp";
export { convertToFileExecutor } from "./convert-to-file";
export { extractFromFileExecutor } from "./extract-from-file";
export { emailSendExecutor } from "./email-send";
export { dataTableExecutor } from "./data-table";
export {
  lmChatOpenAiExecutor,
  setOpenAiHttpClient,
  type OpenAiModelHandle,
  type OpenAiChatMessage,
  type OpenAiCompletionResult,
} from "./lm-chat-openai";
export { langchainAgentExecutor } from "./langchain-agent";
export {
  mcpClientToolExecutor,
  setMcpHttpClient,
  type McpClientToolHandle,
  type McpToolDescriptor,
  type McpToolCallResult,
  type McpTransport,
  type McpHttpClient,
} from "./mcp-client-tool";
export { stickyNoteExecutor } from "./sticky-note";
export { cryptoExecutor } from "./crypto";
export { xmlExecutor } from "./xml";
export { htmlExecutor } from "./html";
export { markdownExecutor } from "./markdown";
export { jwtExecutor } from "./jwt";
export { compressionExecutor } from "./compression";
export { executionDataExecutor } from "./executionData";
export {
  formTriggerExecutor,
  getFormResponse,
  setFormResponse,
  clearFormResponse,
  clearAllFormResponses,
  type FormResponse,
} from "./form-trigger";
export { sseTriggerExecutor } from "./sse-trigger";
export {
  langchainChatTriggerExecutor,
  extractChatResponseText,
} from "./langchain-chat-trigger";
