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
import { waitExecutor } from "./wait";
import { splitOutExecutor } from "./split-out";
import { aggregateExecutor } from "./aggregate";
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
  ["n8n-nodes-base.set", setExecutor],
  ["n8n-nodes-base.noOp", noopExecutor],
  ["n8n-nodes-base.if", ifExecutor],
  ["n8n-nodes-base.httpRequest", httpRequestExecutor],
  ["n8n-nodes-base.code", codeExecutor],
  ["n8n-nodes-base.webhook", webhookExecutor],
  ["n8n-nodes-base.respondToWebhook", respondToWebhookExecutor],
  ["n8n-nodes-base.switch", switchExecutor],
  ["n8n-nodes-base.merge", mergeExecutor],
  ["n8n-nodes-base.wait", waitExecutor],
  ["n8n-nodes-base.splitOut", splitOutExecutor],
  ["n8n-nodes-base.aggregate", aggregateExecutor],
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
export { waitExecutor } from "./wait";
export { splitOutExecutor } from "./split-out";
export { aggregateExecutor } from "./aggregate";
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
