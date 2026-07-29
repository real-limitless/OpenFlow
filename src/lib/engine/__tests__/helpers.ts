import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IWorkflow } from "@/lib/workflow/types";
import { executeWorkflow } from "../runner";
import { getExecutorMap } from "../node-runtime";
import { seedBuiltinExecutors } from "../executors";

seedBuiltinExecutors();

export function makeNode(overrides: Partial<INode> = {}): INode {
  return {
    id: "1",
    name: "TestNode",
    type: "test",
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
    ...overrides,
  };
}

export function makeWorkflow(nodes: INode[], connections: IWorkflow["connections"] = {}): IWorkflow {
  return {
    id: "wf-test",
    name: "Test Workflow",
    active: false,
    nodes,
    connections,
    settings: {},
  };
}

export function makeCtx(
  items: Array<Record<string, unknown> | INodeExecutionData> = [],
  node: INode = makeNode(),
): ExecutionContext {
  const normalized: INodeExecutionData[] = items.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );

  return createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => normalized,
    continueOnFail: false,
  });
}

export async function runNode(
  type: string,
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown>> = [{}],
): Promise<INodeExecutionData[][]> {
  const map = getExecutorMap();
  const executor = map[type];
  if (!executor) {
    throw new Error(`No executor registered for ${type}`);
  }
  const node = makeNode({ name: "N", type, parameters });
  const ctx = makeCtx(inputItems, node);
  return executor(ctx, node);
}

export async function runWorkflowFixture(
  workflow: IWorkflow,
  opts?: { subWorkflows?: Record<string, IWorkflow> },
) {
  return executeWorkflow({
    workflow,
    nodeExecutors: getExecutorMap(),
    subWorkflows: opts?.subWorkflows,
  });
}

export function assertExecutorRegistered(type: string): void {
  const map = getExecutorMap();
  if (!map[type]) {
    throw new Error(`Expected executor for ${type}`);
  }
}
