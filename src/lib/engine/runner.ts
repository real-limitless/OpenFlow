import type { IWorkflow, INodeExecutionData } from "../workflow/types";
import type { ExecutionPlan, ExecutionRunData, IExecuteFunctions, NodeExecutor } from "./types";
import type { CredentialResolver } from "./credentials";
import { buildAdjacency, buildIncoming, resolveStartNodes, topologicalSort } from "./graph";
import { evaluateExpression, isExpression } from "../expressions/evaluate";

export function createExecutionPlan(workflow: IWorkflow): ExecutionPlan {
  const adjacency = buildAdjacency(workflow.connections);
  const startNodes = resolveStartNodes(workflow);
  const runOrder = topologicalSort(adjacency);
  return { workflow, adjacency, startNodes, runOrder };
}

export interface RunOptions {
  workflow: IWorkflow;
  nodeExecutors: Record<string, NodeExecutor>;
  pinData?: Record<string, INodeExecutionData[]>;
  credentialResolver?: CredentialResolver;
  /** Called when node status changes (pending → running → success/error). */
  onProgress?: (runData: ExecutionRunData) => void | Promise<void>;
}

export interface RunResult {
  runData: ExecutionRunData;
  success: boolean;
}

function resolveParameters(
  params: Record<string, unknown>,
  nodeOutputs: Map<string, INodeExecutionData[][]>,
  nodeName: string,
): Record<string, unknown> {
  const nodeData: Record<string, INodeExecutionData[]> = {};
  for (const [name, outputs] of nodeOutputs) {
    nodeData[name] = outputs.flat();
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && isExpression(value)) {
      const result = evaluateExpression(value, {
        json: {},
        nodeData,
        env: process.env as Record<string, string>,
      });
      resolved[key] = result.ok ? result.value : value;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

export async function executeWorkflow(options: RunOptions): Promise<RunResult> {
  const { workflow, nodeExecutors, pinData, onProgress } = options;
  const plan = createExecutionPlan(workflow);
  const runData: ExecutionRunData = {};
  const nodeOutputs: Map<string, INodeExecutionData[][]> = new Map();

  const emitProgress = async () => {
    if (!onProgress) return;
    // Clone so consumers don't mutate engine state
    const snapshot = JSON.parse(JSON.stringify(runData)) as ExecutionRunData;
    await onProgress(snapshot);
  };

  for (const name of plan.runOrder) {
    runData[name] = { status: "pending" };
  }

  for (const node of workflow.nodes) {
    if (!(node.name in runData)) {
      runData[node.name] = { status: "pending" };
    }
  }

  await emitProgress();

  const executedNodes: Set<string> = new Set();
  const incoming = buildIncoming(workflow.connections);

  for (const nodeName of plan.runOrder) {
    const node = workflow.nodes.find((n) => n.name === nodeName);
    if (!node) continue;

    if (node.disabled) {
      runData[nodeName].status = "skipped";
      await emitProgress();
      continue;
    }

    const executor = nodeExecutors[node.type];
    if (!executor) {
      runData[nodeName].status = "skipped";
      runData[nodeName].error = `No executor for node type: ${node.type}`;
      await emitProgress();
      continue;
    }

    if (node.executeOnce && executedNodes.has(nodeName)) {
      runData[nodeName].status = "skipped";
      await emitProgress();
      continue;
    }

    const pinned = pinData?.[nodeName];
    if (pinned && pinned.length > 0) {
      runData[nodeName].status = "success";
      runData[nodeName].items = [pinned];
      nodeOutputs.set(nodeName, [pinned]);
      executedNodes.add(nodeName);
      await emitProgress();
      continue;
    }

    const nodeContinueOnFail = node.continueOnFail || node.onError === "continueRegularOutput";

    const ctx: IExecuteFunctions = {
      getNodeInputItems: (sourceName: string, inputIndex: number) => {
        if (sourceName !== nodeName) {
          const outputs = nodeOutputs.get(sourceName);
          if (!outputs) return [];
          return outputs[inputIndex] ?? [];
        }
        const edges = incoming.get(nodeName) ?? [];
        const items: INodeExecutionData[] = [];
        for (const e of edges) {
          if (e.targetInput !== inputIndex) continue;
          const outs = nodeOutputs.get(e.source);
          if (outs) items.push(...(outs[e.sourceOutput] ?? []));
        }
        return items;
      },
      getWorkflow: () => workflow,
      continueOnFail: () => nodeContinueOnFail,
      getCredential: options.credentialResolver
        ? async (name: string) => {
            const ref = node.credentials?.[name];
            if (!ref) return null;
            return options.credentialResolver!(ref);
          }
        : undefined,
    };

    runData[nodeName].status = "running";
    runData[nodeName].startedAt = new Date().toISOString();
    await emitProgress();

    const maxAttempts = node.retryOnFail ? (node.maxTries ?? 3) : 1;
    let lastError: Error | null = null;
    let outputs: INodeExecutionData[][] | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const resolvedNode = {
          ...node,
          parameters: resolveParameters(node.parameters, nodeOutputs, nodeName),
        };
        outputs = await executor(ctx, resolvedNode);
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts && node.waitBetweenTries) {
          await new Promise((r) => setTimeout(r, node.waitBetweenTries));
        }
      }
    }

    if (lastError) {
      if (nodeContinueOnFail || node.onError === "continueErrorOutput") {
        runData[nodeName].status = "error";
        runData[nodeName].error = lastError.message;
        if (node.alwaysOutputData) {
          outputs = [[{ json: {} }]];
          nodeOutputs.set(nodeName, outputs);
          runData[nodeName].items = outputs;
        }
      } else {
        runData[nodeName].status = "error";
        runData[nodeName].error = lastError.message;
        runData[nodeName].finishedAt = new Date().toISOString();
        executedNodes.add(nodeName);
        await emitProgress();
        continue;
      }
    } else if (outputs) {
      if (
        node.alwaysOutputData &&
        (!outputs || outputs.length === 0 || outputs.every((o) => o.length === 0))
      ) {
        outputs = [[{ json: {} }]];
      }
      const inputItems = ctx.getNodeInputItems(nodeName, 0);
      outputs = outputs.map((outputItems) =>
        outputItems.map((item, idx) => {
          if (item.pairedItem) return item;
          if (inputItems.length === outputItems.length) {
            return { ...item, pairedItem: { item: idx, input: 0 } };
          }
          return { ...item, pairedItem: { item: 0, input: 0 } };
        }),
      );
      nodeOutputs.set(nodeName, outputs);
      runData[nodeName].status = "success";
      runData[nodeName].items = outputs;
    }

    runData[nodeName].finishedAt = new Date().toISOString();
    executedNodes.add(nodeName);
    await emitProgress();
  }

  const success = Object.values(runData).every((d) => d.status !== "error");
  return { runData, success };
}
