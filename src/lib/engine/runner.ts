import type { IWorkflow, INodeExecutionData } from "../workflow/types";
import type { ExecutionPlan, ExecutionRunData, NodeExecutor } from "./types";
import type { CredentialResolver } from "./credentials";
import { buildAdjacency, buildIncoming, resolveStartNodes, topologicalSort } from "./graph";
import { evaluateExpression, isExpression } from "../expressions/evaluate";
import { createExecutionContext } from "@/sdk";

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
  /**
   * Nested workflows available to Execute Workflow, keyed by id and/or name.
   */
  subWorkflows?: Record<string, IWorkflow>;
  /**
   * Async loader for sub-workflows (e.g. database by id or name).
   * Used when the id is not already present in `subWorkflows`.
   */
  resolveSubWorkflow?: (idOrName: string) => Promise<IWorkflow | null>;
  /** Max nested executeWorkflow depth (default 5). */
  maxSubWorkflowDepth?: number;
  /** Internal recursion depth. */
  _depth?: number;
}

export interface RunResult {
  runData: ExecutionRunData;
  success: boolean;
}

function resolveParameters(
  params: Record<string, unknown>,
  nodeOutputs: Map<string, INodeExecutionData[][]>,
  _nodeName: string,
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

function collectTerminalItems(
  workflow: IWorkflow,
  runData: ExecutionRunData,
  adjacency: Map<string, string[]>,
): INodeExecutionData[] {
  const terminals = workflow.nodes.filter((n) => {
    const outs = adjacency.get(n.name);
    return !outs || outs.length === 0;
  });
  const items: INodeExecutionData[] = [];
  for (const n of terminals) {
    const rd = runData[n.name];
    if (rd?.status === "success" && rd.items) {
      items.push(...rd.items.flat());
    }
  }
  return items;
}

export async function executeWorkflow(options: RunOptions): Promise<RunResult> {
  const { workflow, nodeExecutors, pinData, onProgress } = options;
  const depth = options._depth ?? 0;
  const maxDepth = options.maxSubWorkflowDepth ?? 5;
  const plan = createExecutionPlan(workflow);
  const runData: ExecutionRunData = {};
  const nodeOutputs: Map<string, INodeExecutionData[][]> = new Map();

  const emitProgress = async () => {
    if (!onProgress) return;
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

  const lookupInputItems = (nodeName: string, inputIndex: number): INodeExecutionData[] => {
    const edges = incoming.get(nodeName) ?? [];
    const items: INodeExecutionData[] = [];
    for (const e of edges) {
      if (e.targetInput !== inputIndex) continue;
      const outs = nodeOutputs.get(e.source);
      if (outs) items.push(...(outs[e.sourceOutput] ?? []));
    }
    return items;
  };

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

    const getNodeInputItems = (sourceName: string, inputIndex: number): INodeExecutionData[] => {
      if (sourceName !== nodeName) {
        const outputs = nodeOutputs.get(sourceName);
        if (!outputs) return [];
        return outputs[inputIndex] ?? [];
      }
      return lookupInputItems(nodeName, inputIndex);
    };

    runData[nodeName].status = "running";
    runData[nodeName].startedAt = new Date().toISOString();
    await emitProgress();

    const maxAttempts = node.retryOnFail ? (node.maxTries ?? 3) : 1;
    let lastError: Error | null = null;
    let outputs: INodeExecutionData[][] | null = null;

    const nodeData: Record<string, INodeExecutionData[]> = {};
    for (const [name, outs] of nodeOutputs) {
      nodeData[name] = outs.flat();
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const resolvedNode = {
          ...node,
          parameters: resolveParameters(node.parameters, nodeOutputs, nodeName),
        };

        const runSubWorkflow = async (subOpts: {
          workflowId?: string;
          workflowJson?: IWorkflow;
          items: INodeExecutionData[];
        }): Promise<INodeExecutionData[]> => {
          if (depth >= maxDepth) {
            throw new Error(`Sub-workflow depth limit exceeded (max ${maxDepth})`);
          }
          let child: IWorkflow | undefined = subOpts.workflowJson;
          const idOrName = subOpts.workflowId?.trim();
          if (!child && idOrName) {
            if (options.subWorkflows) {
              child =
                options.subWorkflows[idOrName] ??
                Object.values(options.subWorkflows).find(
                  (w) => w.id === idOrName || w.name === idOrName,
                );
            }
            if (!child && options.resolveSubWorkflow) {
              child = (await options.resolveSubWorkflow(idOrName)) ?? undefined;
            }
          }
          if (!child) {
            const hint = idOrName
              ? `Sub-workflow not found: "${idOrName}". Save the child workflow first, then select it from the Workflow dropdown (id must exist in the database).`
              : "Sub-workflow not found: set workflowId or inline workflow JSON.";
            throw new Error(hint);
          }

          const start =
            child.nodes.find(
              (n) =>
                n.type === "n8n-nodes-base.executeWorkflowTrigger" ||
                n.type === "n8n-nodes-base.manualTrigger" ||
                n.type === "n8n-nodes-base.webhook",
            ) ?? child.nodes[0];

          const childPin =
            start && subOpts.items.length > 0
              ? { [start.name]: subOpts.items }
              : undefined;

          const childResult = await executeWorkflow({
            workflow: child,
            nodeExecutors,
            pinData: childPin,
            credentialResolver: options.credentialResolver,
            subWorkflows: options.subWorkflows,
            resolveSubWorkflow: options.resolveSubWorkflow,
            maxSubWorkflowDepth: maxDepth,
            _depth: depth + 1,
          });

          if (!childResult.success) {
            const errNode = Object.entries(childResult.runData).find(
              ([, v]) => v.status === "error",
            );
            throw new Error(
              errNode
                ? `Sub-workflow error in "${errNode[0]}": ${errNode[1].error ?? "unknown"}`
                : "Sub-workflow failed",
            );
          }

          const childPlan = createExecutionPlan(child);
          return collectTerminalItems(child, childResult.runData, childPlan.adjacency);
        };

        const ctx = createExecutionContext({
          node: resolvedNode,
          workflow,
          getNodeInputItems,
          continueOnFail: nodeContinueOnFail,
          getCredential: options.credentialResolver
            ? async (name: string) => {
                const ref = node.credentials?.[name];
                if (!ref) return null;
                return options.credentialResolver!(ref);
              }
            : undefined,
          nodeData,
          runSubWorkflow,
        });

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
      const inputItems = getNodeInputItems(nodeName, 0);
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
