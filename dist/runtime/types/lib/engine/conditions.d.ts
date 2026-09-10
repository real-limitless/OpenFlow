import type { ExpressionContext } from "../expressions/evaluate";
export interface ConditionRow {
    leftValue?: unknown;
    rightValue?: unknown;
    operator?: unknown;
    operation?: string;
    value1?: unknown;
    value2?: unknown;
}
export type ConditionExprExtras = Pick<ExpressionContext, "vars" | "env" | "nodeData" | "allItems" | "envAllowlist">;
export declare function resolveConditionValue(raw: unknown, itemJson: Record<string, unknown>, extras?: ConditionExprExtras): unknown;
export declare function normalizeOperator(op: unknown): string;
export declare function evaluateCondition(left: unknown, right: unknown, op: string, ignoreCase: boolean): boolean;
export declare function evaluateConditionRow(row: ConditionRow, itemJson: Record<string, unknown>, ignoreCase: boolean, extras?: ConditionExprExtras): boolean;
export declare function combineConditionResults(results: boolean[], combinator: string): boolean;
