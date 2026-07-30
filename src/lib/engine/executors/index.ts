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
import { executeCommandExecutor } from "./n8n-nodes-base.executeCommand";
import { executeWorkflowExecutor } from "./execute-workflow";
import { executeWorkflowTriggerExecutor } from "./execute-workflow-trigger";
import { stopAndErrorExecutor } from "./stop-and-error";
import { scheduleTriggerExecutor } from "./schedule-trigger";
import { sortExecutor } from "./sort";
import { renameKeysExecutor } from "./rename-keys";
import { errorTriggerExecutor } from "./error-trigger";
import { ftpExecutor } from "./ftp";
import { sshExecutor } from "./ssh";
import { convertToFileExecutor } from "./convert-to-file";
import { extractFromFileExecutor } from "./extract-from-file";
import { readWriteFileExecutor } from "./readWriteFile";
import { rssFeedReadExecutor } from "./rss-feed-read";
import { emailSendExecutor } from "./email-send";
import { dataTableExecutor } from "./data-table";
import { lmChatOpenAiExecutor } from "./lm-chat-openai";
import { lmChatGoogleGeminiExecutor } from "./lm-chat-google-gemini";
import { lmChatAnthropicExecutor } from "./lm-chat-anthropic";
import { lmChatOllamaExecutor } from "./lm-chat-ollama";
import { lmChatOpenRouterExecutor } from "./lm-chat-open-router";
import { langchainAgentExecutor } from "./langchain-agent";
import { langchainChainRetrievalQaExecutor } from "./langchain-chain-retrieval-qa";
import { langchainChainSummarizationExecutor } from "./langchain-chain-summarization";
import { chainLlmExecutor } from "./chain-llm";
import { langchainOutputParserStructuredExecutor } from "./langchain-output-parser-structured";
import { memoryBufferWindowExecutor } from "./memory-buffer-window";
import { mcpClientToolExecutor } from "./mcp-client-tool";
import { mcpTriggerExecutor } from "./mcp-trigger";
import { stickyNoteExecutor } from "./sticky-note";
import { cryptoExecutor } from "./crypto";
import { xmlExecutor } from "./xml";
import { htmlExecutor } from "./html";
import { markdownExecutor } from "./markdown";
import { editImageExecutor } from "./editImage";
import { aiTransformExecutor } from "./aiTransform";
import { jwtExecutor } from "./jwt";
import { compressionExecutor } from "./compression";
import { executionDataExecutor } from "./executionData";
import { gitExecutor } from "./git";
import { formTriggerExecutor } from "./form-trigger";
import { sseTriggerExecutor } from "./sse-trigger";
import { localFileTriggerExecutor } from "./local-file-trigger";
import { langchainChatTriggerExecutor } from "./langchain-chat-trigger";
import { workflowTriggerExecutor } from "./workflow-trigger";
import { graphqlExecutor } from "./graphql";
import { openAiExecutor } from "./openai";
import { webflowExecutor } from "./webflow";
import { whatsAppExecutor } from "./n8n-nodes-base.whatsApp";
import { telegramExecutor } from "./telegram";
import { googleSheetsExecutor } from "./n8n-nodes-base.googleSheets";
import { slackExecutor } from "./n8n-nodes-base.slack";
import { discordExecutor } from "./n8n-nodes-base.discord";
import { twilioExecutor } from "./n8n-nodes-base.twilio";
import { vectorStoreInMemoryExecutor, clearMemoryVectorStore } from "./vectorStoreInMemory";
import { langchainDocumentDefaultDataLoaderExecutor } from "./langchain-document-default-data-loader";
import { langchainTextSplitterRecursiveCharacterExecutor } from "./langchain-text-splitter-recursive-character";
import { embeddingsOpenAiExecutor } from "./embeddings-openai";
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
  ["n8n-nodes-base.localFileTrigger", localFileTriggerExecutor],
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
  ["n8n-nodes-base.executeCommand", executeCommandExecutor],
  ["n8n-nodes-base.executeWorkflow", executeWorkflowExecutor],
  ["n8n-nodes-base.executeWorkflowTrigger", executeWorkflowTriggerExecutor],
  ["n8n-nodes-base.stopAndError", stopAndErrorExecutor],
  ["n8n-nodes-base.ftp", ftpExecutor],
  ["n8n-nodes-base.ssh", sshExecutor],
  ["n8n-nodes-base.convertToFile", convertToFileExecutor],
  ["n8n-nodes-base.extractFromFile", extractFromFileExecutor],
  ["n8n-nodes-base.readWriteFile", readWriteFileExecutor],
  ["n8n-nodes-base.rssFeedRead", rssFeedReadExecutor],
  ["n8n-nodes-base.emailSend", emailSendExecutor],
  ["n8n-nodes-base.dataTable", dataTableExecutor],
  ["@n8n/n8n-nodes-langchain.lmChatOpenAi", lmChatOpenAiExecutor],
  ["@n8n/n8n-nodes-langchain.lmChatGoogleGemini", lmChatGoogleGeminiExecutor],
  ["@n8n/n8n-nodes-langchain.lmChatAnthropic", lmChatAnthropicExecutor],
  ["@n8n/n8n-nodes-langchain.lmChatOllama", lmChatOllamaExecutor],
  ["@n8n/n8n-nodes-langchain.lmChatOpenRouter", lmChatOpenRouterExecutor],
  ["@n8n/n8n-nodes-langchain.agent", langchainAgentExecutor],
  ["@n8n/n8n-nodes-langchain.chainRetrievalQa", langchainChainRetrievalQaExecutor],
  ["@n8n/n8n-nodes-langchain.chainSummarization", langchainChainSummarizationExecutor],
  ["@n8n/n8n-nodes-langchain.chainLlm", chainLlmExecutor],
  ["@n8n/n8n-nodes-langchain.outputParserStructured", langchainOutputParserStructuredExecutor],
  ["@n8n/n8n-nodes-langchain.memoryBufferWindow", memoryBufferWindowExecutor],
  ["@n8n/n8n-nodes-langchain.mcpClientTool", mcpClientToolExecutor],
  ["@n8n/n8n-nodes-langchain.mcpTrigger", mcpTriggerExecutor],
  ["@n8n/n8n-nodes-langchain.vectorStoreInMemory", vectorStoreInMemoryExecutor],
  [
    "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
    langchainDocumentDefaultDataLoaderExecutor,
  ],
  [
    "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
    langchainTextSplitterRecursiveCharacterExecutor,
  ],
  ["@n8n/n8n-nodes-langchain.embeddingsOpenAi", embeddingsOpenAiExecutor],
  ["n8n-nodes-base.stickyNote", stickyNoteExecutor],
  ["n8n-nodes-base.crypto", cryptoExecutor],
  ["n8n-nodes-base.xml", xmlExecutor],
  ["n8n-nodes-base.html", htmlExecutor],
  ["n8n-nodes-base.markdown", markdownExecutor],
  ["n8n-nodes-base.editImage", editImageExecutor],
  ["n8n-nodes-base.aiTransform", aiTransformExecutor],
  ["n8n-nodes-base.jwt", jwtExecutor],
  ["n8n-nodes-base.compression", compressionExecutor],
  ["n8n-nodes-base.executionData", executionDataExecutor],
  ["n8n-nodes-base.git", gitExecutor],
  ["n8n-nodes-base.formTrigger", formTriggerExecutor],
  ["@n8n/n8n-nodes-langchain.chatTrigger", langchainChatTriggerExecutor],
  ["n8n-nodes-base.workflowTrigger", workflowTriggerExecutor],
  ["n8n-nodes-base.graphql", graphqlExecutor],
  ["@n8n/n8n-nodes-langchain.openAi", openAiExecutor],
  ["n8n-nodes-base.webflow", webflowExecutor],
  ["n8n-nodes-base.whatsApp", whatsAppExecutor],
  ["n8n-nodes-base.telegram", telegramExecutor],
  ["n8n-nodes-base.gmail", gmailExecutor],
  ["n8n-nodes-base.googleSheets", googleSheetsExecutor],
  ["n8n-nodes-base.discord", discordExecutor],
  ["n8n-nodes-base.twilio", twilioExecutor],
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
export { sshExecutor } from "./ssh";
export { convertToFileExecutor } from "./convert-to-file";
export { extractFromFileExecutor } from "./extract-from-file";
export { readWriteFileExecutor } from "./readWriteFile";
export { rssFeedReadExecutor } from "./rss-feed-read";
export { emailSendExecutor } from "./email-send";
export { dataTableExecutor } from "./data-table";
export {
  lmChatOpenAiExecutor,
  setOpenAiHttpClient,
  type OpenAiModelHandle,
  type OpenAiChatMessage,
  type OpenAiCompletionResult,
} from "./lm-chat-openai";
export {
  lmChatGoogleGeminiExecutor,
  setGeminiHttpClient,
  type GeminiModelHandle,
  type GeminiChatMessage,
  type GeminiCompletionResult,
} from "./lm-chat-google-gemini";
export {
  lmChatAnthropicExecutor,
  setAnthropicHttpClient,
  type AnthropicModelHandle,
  type AnthropicChatMessage,
  type AnthropicCompletionResult,
} from "./lm-chat-anthropic";
export {
  lmChatOllamaExecutor,
  setOllamaHttpClient,
  type OllamaModelHandle,
  type OllamaChatMessage,
  type OllamaCompletionResult,
} from "./lm-chat-ollama";
export {
  lmChatOpenRouterExecutor,
  setOpenRouterHttpClient,
  type OpenRouterModelHandle,
  type OpenRouterChatMessage,
  type OpenRouterCompletionResult,
} from "./lm-chat-open-router";
export { langchainAgentExecutor } from "./langchain-agent";
export { langchainChainRetrievalQaExecutor } from "./langchain-chain-retrieval-qa";
export { chainLlmExecutor } from "./chain-llm";
export {
  langchainOutputParserStructuredExecutor,
  type OutputParserHandle,
} from "./langchain-output-parser-structured";
export {
  memoryBufferWindowExecutor,
  clearMemoryBufferWindowStore,
  getMemoryBufferWindowSessionStore,
  type MemoryBufferWindowHandle,
  type MemoryChatMessage,
  type MemoryInteraction,
} from "./memory-buffer-window";
export {
  mcpClientToolExecutor,
  setMcpHttpClient,
  type McpClientToolHandle,
  type McpToolDescriptor,
  type McpToolCallResult,
  type McpTransport,
  type McpHttpClient,
} from "./mcp-client-tool";
export {
  mcpTriggerExecutor,
  getMcpTriggerTools,
  shapeMcpToolResult,
  type McpTriggerTool,
  type McpTriggerToolResult,
} from "./mcp-trigger";
export { stickyNoteExecutor } from "./sticky-note";
export { cryptoExecutor } from "./crypto";
export { xmlExecutor } from "./xml";
export { htmlExecutor } from "./html";
export { markdownExecutor } from "./markdown";
export { editImageExecutor } from "./editImage";
export { jwtExecutor } from "./jwt";
export { aiTransformExecutor } from "./aiTransform";
export { compressionExecutor } from "./compression";
export { executionDataExecutor } from "./executionData";
export {
  gitExecutor,
  setGitClientFactory,
  type GitClient,
  type GitClientFactory,
  type GitLogEntry,
  type GitReflogEntry,
  type GitOperation,
  type TagAction,
} from "./git";
export {
  formTriggerExecutor,
  getFormResponse,
  setFormResponse,
  clearFormResponse,
  clearAllFormResponses,
  type FormResponse,
} from "./form-trigger";
export { sseTriggerExecutor } from "./sse-trigger";
export { localFileTriggerExecutor } from "./local-file-trigger";
export { langchainChatTriggerExecutor, extractChatResponseText } from "./langchain-chat-trigger";
export { workflowTriggerExecutor } from "./workflow-trigger";
export { graphqlExecutor } from "./graphql";
export { openAiExecutor, setOpenAiAppHttpClient, type OpenAiAppHttpClient } from "./openai";
export { webflowExecutor } from "./webflow";
export { whatsAppExecutor } from "./n8n-nodes-base.whatsApp";
export { telegramExecutor } from "./telegram";
export { gmailExecutor } from "./n8n-nodes-base.gmail";
export { slackExecutor } from "./n8n-nodes-base.slack";
export { discordExecutor } from "./n8n-nodes-base.discord";
export { twilioExecutor } from "./n8n-nodes-base.twilio";
export { vectorStoreInMemoryExecutor, clearMemoryVectorStore } from "./vectorStoreInMemory";
export {
  langchainDocumentDefaultDataLoaderExecutor,
  type DocumentLoaderHandle,
} from "./langchain-document-default-data-loader";
export {
  langchainTextSplitterRecursiveCharacterExecutor,
  type TextSplitterHandle,
} from "./langchain-text-splitter-recursive-character";
export {
  embeddingsOpenAiExecutor,
  setEmbeddingsOpenAiHttpClient,
  type EmbeddingsOpenAiHandle,
  type EmbeddingsOpenAiHttpClient,
} from "./embeddings-openai";
