import { prisma } from "../db";
import { enqueueOrRun } from "../execute";
import { config } from "../../config";
import {
  buildErrorWorkflowPayload,
  failedNodeName,
  inputItemsForNode,
  isErrorTriggerType,
} from "../../lib/engine/error-workflow";
import type { ExecutionRunData } from "../../lib/engine/types";
import type { IWorkflow } from "../../lib/workflow/types";
import { definitionFromRow } from "../workflow-loader";
import { log } from "../log";

export async function triggerErrorWorkflow(opts: {
  sourceWorkflowId: string;
  sourceExecutionId: string;
  mode: string;
  runData: ExecutionRunData;
  message: string;
}): Promise<string | null> {
  const source = await prisma.workflow.findUnique({ where: { id: opts.sourceWorkflowId } });
  if (!source) return null;
  let settings: { errorWorkflow?: string } = {};
  try {
    settings = source.settings ? (JSON.parse(source.settings) as { errorWorkflow?: string }) : {};
  } catch {
    settings = {};
  }
  const targetId = typeof settings.errorWorkflow === "string" ? settings.errorWorkflow.trim() : "";
  if (!targetId) return null;
  if (targetId === opts.sourceWorkflowId) return null;

  const sourceExec = await prisma.execution.findUnique({
    where: { id: opts.sourceExecutionId },
    select: { meta: true },
  });
  try {
    const meta = sourceExec?.meta ? (JSON.parse(sourceExec.meta) as { errorOf?: string }) : {};
    if (meta.errorOf) return null;
  } catch {
    /* continue */
  }

  const target =
    (await prisma.workflow.findUnique({ where: { id: targetId } })) ??
    (await prisma.workflow.findFirst({
      where: { name: targetId, projectId: source.projectId },
    }));
  if (!target) {
    log.warn("error workflow not found", {
      component: "error-replay",
      errorWorkflow: targetId,
      sourceWorkflowId: opts.sourceWorkflowId,
    });
    return null;
  }

  const definition = definitionFromRow(target) as IWorkflow;
  const trigger = definition.nodes.find((n) => isErrorTriggerType(n.type));
  if (!trigger) {
    log.warn("error workflow has no Error Trigger", {
      component: "error-replay",
      workflowId: target.id,
    });
    return null;
  }

  const lastNode = failedNodeName(opts.runData);
  const payload = buildErrorWorkflowPayload({
    executionId: opts.sourceExecutionId,
    mode: opts.mode,
    workflowId: source.id,
    workflowName: source.name,
    lastNodeExecuted: lastNode,
    message: opts.message,
    publicUrl: config.publicUrl || undefined,
  });

  const execution = await prisma.execution.create({
    data: {
      workflowId: target.id,
      status: "running",
      mode: "trigger",
      meta: JSON.stringify({ errorOf: opts.sourceExecutionId }),
    },
  });

  await enqueueOrRun(
    target.id,
    execution.id,
    "trigger",
    { [trigger.name]: [{ json: payload }] },
    definition,
    target.userId,
    target.projectId,
  );
  return execution.id;
}

export async function replayFailedExecution(executionId: string): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  executionId?: string;
  destinationNode?: string;
}> {
  const row = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { workflow: true },
  });
  if (!row) return { ok: false, status: 404, error: "Execution not found" };
  if (row.status !== "error") return { ok: false, status: 409, error: "Only failed executions can be replayed" };

  let runData: ExecutionRunData = {};
  try {
    runData = JSON.parse(row.runData || "{}") as ExecutionRunData;
  } catch {
    runData = {};
  }
  const definition = definitionFromRow(row.workflow) as IWorkflow;
  const nodeName = failedNodeName(runData);
  if (!nodeName) return { ok: false, status: 409, error: "No failed node to replay" };

  const startInputItems = inputItemsForNode(definition, runData, nodeName);
  const replay = await prisma.execution.create({
    data: {
      workflowId: row.workflowId,
      status: "running",
      mode: row.mode,
      meta: JSON.stringify({ replayOf: executionId, destinationNode: nodeName }),
    },
  });

  await enqueueOrRun(
    row.workflowId,
    replay.id,
    row.mode as "manual" | "webhook" | "trigger",
    undefined,
    definition,
    row.workflow.userId,
    row.workflow.projectId,
    undefined,
    nodeName,
    nodeName,
    false,
    startInputItems,
  );

  return { ok: true, executionId: replay.id, destinationNode: nodeName };
}
