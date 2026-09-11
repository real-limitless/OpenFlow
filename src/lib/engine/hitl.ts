import type { INodeExecutionData } from "../workflow/types";

export type HitlDecision = "approve" | "deny";

export function applyHitlDecision(
  items: INodeExecutionData[],
  decision: HitlDecision,
  comment?: string,
): INodeExecutionData[] {
  const base = items.length > 0 ? items : [{ json: {} }];
  return base.map((item) => ({
    ...item,
    json: {
      ...(item.json ?? {}),
      approved: decision === "approve",
      decision,
      ...(comment ? { comment } : {}),
    },
  }));
}

export function isHitlWait(resume: string | undefined): boolean {
  return resume === "webhook" || resume === "form" || resume === "approval" || resume === "hitl";
}
