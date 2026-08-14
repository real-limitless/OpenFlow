import type { IWorkflow } from "../workflow/types";
import { isLiteNodeType } from "./allowlist";
import { LiteRuntimeError } from "./errors";

export function unsupportedLiteNodes(workflow: IWorkflow): Array<{ name: string; type: string }> {
  return workflow.nodes
    .filter((n) => !isLiteNodeType(n.type))
    .map((n) => ({ name: n.name, type: n.type }));
}

export function assertLiteCompatible(workflow: IWorkflow): void {
  const unsupported = unsupportedLiteNodes(workflow);
  if (unsupported.length === 0) return;
  const list = unsupported.map((n) => `${n.name} (${n.type})`).join(", ");
  throw new LiteRuntimeError(
    `Workflow is not lite-runtime compatible: ${list}`,
    "unsupported_nodes",
    unsupported,
  );
}
