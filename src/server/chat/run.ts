import { prisma } from "../db";
import type { INode, IWorkflow } from "../../lib/workflow/types";
import { executeWorkflow } from "../../lib/engine/runner";
import { getExecutorMap } from "../../lib/engine";
import { credentialResolverForProject } from "../credentials";
import { dataTableAccessForProject } from "../services/data-tables-access";
import { resolveSubWorkflowFromDb } from "../workflow-loader";
import { loadVarsMap } from "../services/variables";
import { getDefaultEnvironment } from "../services/environments";
import { notifyExecutionFinished, notifyExecutionStarted } from "../services/workflow-events";
import { persistExecutionProgress } from "../services/persist-execution-progress";
import { chatTriggerParams } from "../../lib/chat/path";
import { extractChatWorkflowResponse } from "../../lib/chat/response";
import { getWebhookResponse, clearWebhookResponse } from "../../lib/engine/executors/respond-to-webhook";
import type { ExecutionRunData } from "../../lib/engine/types";

export type ChatRunResult = {
  success: boolean;
  output: string;
  executionId: string;
  error?: string;
  runData?: ExecutionRunData;
};

export function definitionFromWorkflowRow(workflow: {
  id: string;
  name: string;
  active: boolean;
  nodes: string;
  connections: string;
  settings: string | null;
  staticData: string | null;
  pinData: string | null;
  meta: string | null;
  versionId: string;
}): IWorkflow {
  return {
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    nodes: JSON.parse(workflow.nodes) as INode[],
    connections: JSON.parse(workflow.connections),
    settings: workflow.settings ? JSON.parse(workflow.settings) : undefined,
    staticData: workflow.staticData ? JSON.parse(workflow.staticData) : undefined,
    pinData: workflow.pinData ? JSON.parse(workflow.pinData) : undefined,
    meta: workflow.meta ? JSON.parse(workflow.meta) : undefined,
    versionId: workflow.versionId,
  } as IWorkflow;
}

export async function runChatWorkflow(opts: {
  definition: IWorkflow;
  trigger: INode;
  workflowRow: { id: string; userId: string; projectId: string };
  chatInput: string;
  sessionId?: string;
  action?: string;
  metadata?: unknown;
  mode?: "webhook" | "manual" | "trigger";
}): Promise<ChatRunResult> {
  const mode = opts.mode ?? "webhook";
  const execution = await prisma.execution.create({
    data: {
      workflowId: opts.workflowRow.id,
      status: "running",
      mode,
    },
  });
  notifyExecutionStarted(opts.workflowRow.id, execution.id, mode === "manual" ? "manual" : "webhook");

  const defaultEnv = await getDefaultEnvironment(opts.workflowRow.projectId);
  const environmentId = defaultEnv?.id;
  const vars = await loadVarsMap(opts.workflowRow.projectId, environmentId ?? null);

  const json: Record<string, unknown> = {
    chatInput: opts.chatInput,
    sessionId: opts.sessionId ?? "",
    action: opts.action ?? "sendMessage",
  };
  if (opts.metadata != null) json.metadata = opts.metadata;

  try {
    const runResult = await executeWorkflow({
      workflow: {
        ...opts.definition,
        __executionId: execution.id,
      } as IWorkflow & { __executionId: string },
      nodeExecutors: getExecutorMap(),
      pinData: { [opts.trigger.name]: [{ json }] },
      credentialResolver: credentialResolverForProject(
        opts.workflowRow.projectId,
        opts.workflowRow.userId,
      ),
      dataTables: dataTableAccessForProject(opts.workflowRow.projectId),
      vars,
      startNode: opts.trigger.name,
      resolveSubWorkflow: resolveSubWorkflowFromDb,
      onProgress: async (partial) => {
        await persistExecutionProgress(execution.id, partial);
      },
    });

    const status = runResult.success ? "success" : "error";
    const errText = Object.values(runResult.runData).find((d) => d.status === "error")?.error;
    await prisma.execution.update({
      where: { id: execution.id },
      data: {
        status,
        finishedAt: new Date(),
        runData: JSON.stringify(runResult.runData),
        error: runResult.success ? null : JSON.stringify({ message: errText ?? "Workflow failed" }),
      },
    });
    notifyExecutionFinished(opts.workflowRow.id, execution.id, status, mode === "manual" ? "manual" : "webhook");

    const webhook = getWebhookResponse(execution.id);
    clearWebhookResponse(execution.id);
    const params = chatTriggerParams(opts.trigger);
    const output = extractChatWorkflowResponse(
      opts.definition,
      runResult.runData,
      params.responseMode,
      webhook?.body,
    );

    return {
      success: runResult.success,
      output,
      executionId: execution.id,
      error: runResult.success ? undefined : String(errText ?? "Workflow failed"),
      runData: runResult.runData,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        error: JSON.stringify({ message }),
      },
    });
    notifyExecutionFinished(opts.workflowRow.id, execution.id, "error", mode === "manual" ? "manual" : "webhook");
    return { success: false, output: "", executionId: execution.id, error: message };
  }
}
