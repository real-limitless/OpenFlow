import type { NodeExecutor } from "@/sdk";
import { manualTriggerExecutor } from "../engine/executors/manual-trigger";
import { setExecutor } from "../engine/executors/set";
import { ifExecutor } from "../engine/executors/if";
import { switchExecutor } from "../engine/executors/switch";
import { mergeExecutor } from "../engine/executors/merge";
import { filterExecutor } from "../engine/executors/filter";
import { noopExecutor } from "../engine/executors/noop";
import { httpRequestExecutor } from "../engine/executors/http-request";
import { codeExecutor } from "../engine/executors/code";
import { stickyNoteExecutor } from "../engine/executors/sticky-note";

function dualRegister(
  map: Record<string, NodeExecutor>,
  type: string,
  executor: NodeExecutor,
): void {
  map[type] = executor;
  if (type.startsWith("n8n-")) {
    map[type.slice(4)] = executor;
  }
}

export function createLiteExecutorMap(): Record<string, NodeExecutor> {
  const map: Record<string, NodeExecutor> = {};
  dualRegister(map, "n8n-nodes-base.manualTrigger", manualTriggerExecutor);
  dualRegister(map, "n8n-nodes-base.manualWorkflowTrigger", manualTriggerExecutor);
  dualRegister(map, "n8n-nodes-base.start", manualTriggerExecutor);
  dualRegister(map, "n8n-nodes-base.set", setExecutor);
  dualRegister(map, "n8n-nodes-base.if", ifExecutor);
  dualRegister(map, "n8n-nodes-base.switch", switchExecutor);
  dualRegister(map, "n8n-nodes-base.merge", mergeExecutor);
  dualRegister(map, "n8n-nodes-base.filter", filterExecutor);
  dualRegister(map, "n8n-nodes-base.noOp", noopExecutor);
  dualRegister(map, "n8n-nodes-base.httpRequest", httpRequestExecutor);
  dualRegister(map, "n8n-nodes-base.code", codeExecutor);
  dualRegister(map, "n8n-nodes-base.function", codeExecutor);
  dualRegister(map, "n8n-nodes-base.functionItem", codeExecutor);
  dualRegister(map, "n8n-nodes-base.stickyNote", stickyNoteExecutor);
  return map;
}
