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

export const defaultExecutors: Record<string, NodeExecutor> = {
  "n8n-nodes-base.manualTrigger": manualTriggerExecutor,
  "n8n-nodes-base.set": setExecutor,
  "n8n-nodes-base.noOp": noopExecutor,
  "n8n-nodes-base.if": ifExecutor,
  "n8n-nodes-base.httpRequest": httpRequestExecutor,
  "n8n-nodes-base.code": codeExecutor,
  "n8n-nodes-base.webhook": webhookExecutor,
  "n8n-nodes-base.respondToWebhook": respondToWebhookExecutor,
  "n8n-nodes-base.switch": switchExecutor,
  "n8n-nodes-base.merge": mergeExecutor,
  "n8n-nodes-base.wait": waitExecutor,
  "n8n-nodes-base.splitOut": splitOutExecutor,
  "n8n-nodes-base.aggregate": aggregateExecutor,
  "n8n-nodes-base.filter": filterExecutor,
  "n8n-nodes-base.limit": limitExecutor,
  "n8n-nodes-base.removeDuplicates": removeDuplicatesExecutor,
  "n8n-nodes-base.itemLists": itemListsExecutor,
  "n8n-nodes-base.dateTime": dateTimeExecutor,
  "n8n-nodes-base.splitInBatches": splitInBatchesExecutor,
  "n8n-nodes-base.executeWorkflow": executeWorkflowExecutor,
};

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
