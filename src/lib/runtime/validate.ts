import type { IWorkflow } from "../workflow/types";
import { isAllowedType, isHarnessToolType, toolPolicyKey, type RuntimePreset } from "./allowlist";
import { LiteRuntimeError } from "./errors";

export function unsupportedRuntimeNodes(
  workflow: IWorkflow,
  preset: RuntimePreset = "lite",
): Array<{ name: string; type: string }> {
  return workflow.nodes
    .filter((n) => !isAllowedType(n.type, preset))
    .map((n) => ({ name: n.name, type: n.type }));
}

export function unsupportedLiteNodes(workflow: IWorkflow): Array<{ name: string; type: string }> {
  return unsupportedRuntimeNodes(workflow, "lite");
}

export function assertLiteCompatible(workflow: IWorkflow, preset: RuntimePreset = "lite"): void {
  const unsupported = unsupportedRuntimeNodes(workflow, preset);
  if (unsupported.length === 0) return;
  const list = unsupported.map((n) => `${n.name} (${n.type})`).join(", ");
  throw new LiteRuntimeError(
    `Workflow is not ${preset}-runtime compatible: ${list}`,
    "unsupported_nodes",
    unsupported,
  );
}

export function assertToolPolicy(workflow: IWorkflow, allowedTools?: string[]): void {
  if (allowedTools === undefined) return;
  const allow = new Set(allowedTools);
  const extras = workflow.nodes.filter((n) => {
    if (n.disabled) return false;
    if (!isHarnessToolType(n.type)) return false;
    return !allow.has(n.type) && !allow.has(toolPolicyKey(n.type));
  });
  if (extras.length === 0) return;
  throw new LiteRuntimeError(
    `Tool policy rejected: ${extras.map((n) => `${n.name} (${n.type})`).join(", ")}`,
    "tool_policy",
    extras.map((n) => ({ name: n.name, type: n.type })),
  );
}
