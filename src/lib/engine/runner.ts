import type { IWorkflow, INodeExecutionData } from "../workflow/types";
import type { ExecutionPlan, ExecutionRunData, NodeExecutor } from "./types";
import { NodeExecutionError } from "./agent-trace";
import type { AgentTrace } from "./agent-trace";
import type { CredentialResolver } from "./credentials";
import type { DataTableAccess } from "@/lib/data-tables/access";
import {
  addSubNodeDependencies,
  buildAdjacency,
  buildIncoming,
  filterAdjacency,
  isTriggerNode,
  nodesLeadingTo,
  nodesReachableFrom,
  resolveStartNodes,
  topologicalSort,
} from "./graph";
import { evaluateExpression, isExpression } from "../expressions/evaluate";
import { createExecutionContext } from "@/sdk";

export function createExecutionPlan(
  workflow: IWorkflow,
  preferredStart?: string | null,
  /**
   * When set with stopBefore, only ancestors of this node run (for
   * “Execute previous nodes”). When set without stopBefore, run through
   * this node inclusive.
   */
  destinationNode?: string | null,
  stopBefore = true,
): ExecutionPlan {
  const fullAdjacency = buildAdjacency(workflow.connections);
  const incoming = buildIncoming(workflow.connections);
  const startNodes = resolveStartNodes(workflow, preferredStart);
  let reachable =
    startNodes.length > 0
      ? nodesReachableFrom(fullAdjacency, startNodes)
      : new Set(workflow.nodes.map((n) => n.name));
  // Isolated start with no outgoing edges still runs
  for (const s of startNodes) reachable.add(s);

  if (destinationNode && workflow.nodes.some((n) => n.name === destinationNode)) {
    const leading = nodesLeadingTo(incoming, destinationNode, {
      includeTarget: !stopBefore,
    });
    // Intersect path-from-start with path-to-destination
    reachable = new Set([...reachable].filter((n) => leading.has(n)));
    // Always keep starts that can reach destination via leading set
    for (const s of startNodes) {
      if (leading.has(s) || s === destinationNode) reachable.add(s);
    }
  }

  addSubNodeDependencies(incoming, reachable);
  const adjacency = filterAdjacency(fullAdjacency, reachable);
  // Ensure every reachable node appears even with zero edges
  for (const name of reachable) {
    if (!adjacency.has(name)) adjacency.set(name, []);
  }
  const runOrder = topologicalSort(adjacency);
  // Prefer start nodes first when they have no edges yet
  for (const s of startNodes) {
    if (!runOrder.includes(s)) runOrder.unshift(s);
  }
  return { workflow, adjacency, startNodes, runOrder };
}

export interface RunOptions {
  workflow: IWorkflow;
  nodeExecutors: Record<string, NodeExecutor>;
  pinData?: Record<string, INodeExecutionData[]>;
  credentialResolver?: CredentialResolver;
  /** Called when node status changes or a node reports mid-run progress. */
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
  /** Product Data Tables access for Evaluation / DataTable nodes. */
  dataTables?: DataTableAccess;
  /** Instance + project custom variables exposed as `$vars`. */
  vars?: Record<string, unknown>;
  /**
   * Env map for `$env`. When omitted, falls back to `process.env` (product host).
   * Lite runtime should pass an explicit map (empty object to expose nothing).
   */
  env?: Record<string, string>;
  /** When set, only these `$env` keys are visible. */
  envAllowlist?: string[];
  /**
   * Optional URL policy forwarded to HTTP-capable nodes via the execution context.
   */
  allowUrl?: (url: string) => boolean;
  /** Jail root for filesystem / git tool paths. */
  fsRoot?: string;
  /**
   * Optional start node (usually a trigger name). When set, only that node and
   * its downstream graph run — like n8n’s “execute this trigger”.
   */
  startNode?: string | null;
  /**
   * Optional destination for partial upstream runs (“execute previous nodes”).
   * Combined with {@link stopBeforeDestination} (default true).
   */
  destinationNode?: string | null;
  /** When true (default), destination itself is not executed. */
  stopBeforeDestination?: boolean;
  /** Jail root for filesystem / git agent tools. */
  fsRoot?: string;
}

export interface RunResult {
  runData: ExecutionRunData;
  success: boolean;
}

/** Expressions that must be evaluated per input item inside the executor. */
function isItemScopedExpression(value: string): boolean {
  return /\$json\b|\$item\b|\$input\b|\$itemIndex\b/.test(value);
}

function resolveParameters(
  params: Record<string, unknown>,
  nodeOutputs: Map<string, INodeExecutionData[][]>,
  _nodeName: string,
  extras?: {
    vars?: Record<string, unknown>;
    env?: Record<string, string>;
    envAllowlist?: string[];
  },
): Record<string, unknown> {
  const nodeData: Record<string, INodeExecutionData[]> = {};
  for (const [name, outputs] of nodeOutputs) {
    nodeData[name] = outputs.flat();
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && isExpression(value)) {
      // Leave $json/$item/$input expressions for the executor (per-item eval).
      // Pre-resolving them with empty json collapses e.g. Filter expression mode.
      if (isItemScopedExpression(value)) {
        resolved[key] = value;
        continue;
      }
      const result = evaluateExpression(value, {
        json: {},
        nodeData,
        env: extras?.env ?? (process.env as Record<string, string>),
        envAllowlist: extras?.envAllowlist,
        vars: extras?.vars ?? {},
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
  const resolvedEnv =
    options.env ?? (typeof process !== "undefined" ? (process.env as Record<string, string>) : {});
  const depth = options._depth ?? 0;
  const maxDepth = options.maxSubWorkflowDepth ?? 5;
  const plan = createExecutionPlan(
    workflow,
    options.startNode,
    options.destinationNode,
    options.stopBeforeDestination !== false,
  );
  const runData: ExecutionRunData = {};
  const nodeOutputs: Map<string, INodeExecutionData[][]> = new Map();
  const customData: Record<string, string> = {};

  const emitProgress = async () => {
    if (!onProgress) return;
    const snapshot = JSON.parse(JSON.stringify(runData)) as ExecutionRunData;
    await onProgress(snapshot);
  };

  // Only track nodes in this run (selected trigger + downstream).
  for (const name of plan.runOrder) {
    runData[name] = { status: "pending" };
  }

  await emitProgress();

  const executedNodes: Set<string> = new Set();
  const incoming = buildIncoming(workflow.connections);

  const lookupInputItems = (nodeName: string, inputIndex: number): INodeExecutionData[] => {
    const edges = incoming.get(nodeName) ?? [];
    const items: INodeExecutionData[] = [];
    for (const e of edges) {
      // Only main-channel edges feed workflow item inputs; AI cluster edges are
      // resolved by name via getNodeInputItems(subNodeName) in root executors.
      if (e.channel !== "main") continue;
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

    // IF/Switch empty branches: do not run downstream nodes with no main items.
    // (Matches n8n — only the live branch executes.)
    const mainIncoming = (incoming.get(nodeName) ?? []).filter((e) => e.channel === "main");
    if (mainIncoming.length > 0 && !isTriggerNode(node)) {
      const hasMainItems = mainIncoming.some((e) => {
        const outs = nodeOutputs.get(e.source);
        return (outs?.[e.sourceOutput]?.length ?? 0) > 0;
      });
      if (!hasMainItems) {
        runData[nodeName].status = "skipped";
        runData[nodeName].items = [[]];
        nodeOutputs.set(nodeName, [[]]);
        executedNodes.add(nodeName);
        await emitProgress();
        continue;
      }
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
          parameters: resolveParameters(node.parameters, nodeOutputs, nodeName, {
            vars: options.vars,
            env: resolvedEnv,
            envAllowlist: options.envAllowlist,
          }),
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
            child.nodes.find((n) => {
              const t = n.type;
              return (
                t === "openflow-node-base.executeWorkflowTrigger" ||
                t === "openflow-node-base.manualTrigger" ||
                t === "openflow-node-base.webhook" ||
                t === "n8n-nodes-base.executeWorkflowTrigger" ||
                t === "n8n-nodes-base.manualTrigger" ||
                t === "n8n-nodes-base.webhook"
              );
            }) ?? child.nodes[0];

          const childPin =
            start && subOpts.items.length > 0 ? { [start.name]: subOpts.items } : undefined;

          const childResult = await executeWorkflow({
            workflow: child,
            nodeExecutors,
            pinData: childPin,
            credentialResolver: options.credentialResolver,
            subWorkflows: options.subWorkflows,
            resolveSubWorkflow: options.resolveSubWorkflow,
            maxSubWorkflowDepth: maxDepth,
            _depth: depth + 1,
            dataTables: options.dataTables,
            vars: options.vars,
            env: resolvedEnv,
            envAllowlist: options.envAllowlist,
            allowUrl: options.allowUrl,
            fsRoot: options.fsRoot,
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
                return options.credentialResolver!({ ...ref, type: name });
              }
            : undefined,
          nodeData,
          runSubWorkflow,
          customData,
          dataTables: options.dataTables,
          vars: options.vars,
          env: resolvedEnv,
          envAllowlist: options.envAllowlist,
          allowUrl: options.allowUrl,
          fsRoot: options.fsRoot,
          reportProgress: async (update) => {
            const entry = runData[nodeName];
            if (!entry || entry.status !== "running") return;
            if (update.progress) entry.progress = update.progress;
            if (update.trace) entry.trace = update.trace as AgentTrace;
            await emitProgress();
          },
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
      if (lastError instanceof NodeExecutionError) {
        if (lastError.trace) runData[nodeName].trace = lastError.trace;
        if (lastError.items) runData[nodeName].items = lastError.items;
      }
      if (nodeContinueOnFail || node.onError === "continueErrorOutput") {
        runData[nodeName].status = "error";
        runData[nodeName].error = lastError.message;
        // continueOnFail / continueRegularOutput: still emit items on main so
        // downstream nodes run (n8n passes prior input through on failure).
        if (lastError instanceof NodeExecutionError && lastError.items) {
          outputs = lastError.items;
          nodeOutputs.set(nodeName, outputs);
        } else if (nodeContinueOnFail || node.alwaysOutputData) {
          const inputItems = lookupInputItems(nodeName, 0);
          outputs = inputItems.length > 0 ? [inputItems] : [[{ json: {} }]];
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
