import type { NodeExecutor } from "@/sdk";
import { expandTypeAliases, type RuntimePreset } from "./allowlist";
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
import { langchainAgentExecutor } from "../engine/executors/langchain-agent";
import { lmChatOpenRouterExecutor } from "../engine/executors/lm-chat-open-router";
import { httpRequestToolExecutor } from "../engine/executors/httpRequestTool";
import { githubToolExecutor } from "../engine/executors/n8n-nodes-base.githubTool";
import { executeCommandToolExecutor } from "../engine/executors/executeCommandTool";
import { webSearchToolExecutor } from "../engine/executors/webSearchTool";
import { gitToolExecutor } from "../engine/executors/gitTool";
import { filesystemToolExecutor } from "../engine/executors/filesystemTool";

function register(map: Record<string, NodeExecutor>, type: string, executor: NodeExecutor): void {
  for (const key of expandTypeAliases(type)) {
    map[key] = executor;
  }
}

export function createLiteExecutorMap(): Record<string, NodeExecutor> {
  return createRuntimeExecutorMap("lite");
}

export function createRuntimeExecutorMap(preset: RuntimePreset): Record<string, NodeExecutor> {
  const map: Record<string, NodeExecutor> = {};
  register(map, "n8n-nodes-base.manualTrigger", manualTriggerExecutor);
  register(map, "n8n-nodes-base.manualWorkflowTrigger", manualTriggerExecutor);
  register(map, "n8n-nodes-base.start", manualTriggerExecutor);
  register(map, "n8n-nodes-base.set", setExecutor);
  register(map, "n8n-nodes-base.if", ifExecutor);
  register(map, "n8n-nodes-base.switch", switchExecutor);
  register(map, "n8n-nodes-base.merge", mergeExecutor);
  register(map, "n8n-nodes-base.filter", filterExecutor);
  register(map, "n8n-nodes-base.noOp", noopExecutor);
  register(map, "n8n-nodes-base.httpRequest", httpRequestExecutor);
  register(map, "n8n-nodes-base.code", codeExecutor);
  register(map, "n8n-nodes-base.function", codeExecutor);
  register(map, "n8n-nodes-base.functionItem", codeExecutor);
  register(map, "n8n-nodes-base.stickyNote", stickyNoteExecutor);
  if (preset === "harness") {
    register(map, "@n8n/n8n-nodes-langchain.agent", langchainAgentExecutor);
    register(map, "@n8n/n8n-nodes-langchain.lmChatOpenRouter", lmChatOpenRouterExecutor);
    register(map, "n8n-nodes-base.httpRequestTool", httpRequestToolExecutor);
    register(map, "n8n-nodes-base.githubTool", githubToolExecutor);
    register(map, "n8n-nodes-base.executeCommandTool", executeCommandToolExecutor);
    register(map, "n8n-nodes-base.webSearchTool", webSearchToolExecutor);
    register(map, "n8n-nodes-base.gitTool", gitToolExecutor);
    register(map, "n8n-nodes-base.filesystemTool", filesystemToolExecutor);
  }
  return map;
}
