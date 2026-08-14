import { evaluateExpression } from "@/lib/expressions/evaluate";
import type { INodeExecutionData } from "@/lib/workflow/types";

export function evaluateOnItem(
  expression: string,
  itemJson: Record<string, unknown> = {},
  extras?: {
    nodeData?: Record<string, INodeExecutionData[]>;
    env?: Record<string, string>;
    envAllowlist?: string[];
    vars?: Record<string, unknown>;
  },
): unknown {
  const result = evaluateExpression(expression, {
    json: itemJson,
    nodeData: extras?.nodeData
      ? Object.fromEntries(
          Object.entries(extras.nodeData).map(([k, v]) => [k, v.map((i) => ({ json: i.json }))]),
        )
      : undefined,
    env: extras?.env,
    envAllowlist: extras?.envAllowlist,
    vars: extras?.vars,
  });
  if (result.ok) return result.value;
  return expression;
}
