/**
 * Minimal client-side expression preview.
 *
 * Supports the documented public surface most commonly seen in shared
 * workflows: `{{ ... }}` interpolation, a leading `=` to mark an expression
 * field, and the `$json`, `$item`, `$itemIndex`, `$now`, `$today`, `$input`,
 * `$("Node Name")`, `$vars` and `$env` helpers. This is a *preview* evaluator
 * for the editor only — the real engine will run server-side in a sandbox.
 */
export interface ExpressionContext {
    json: Record<string, unknown>;
    itemIndex?: number;
    allItems?: Array<{
        json: Record<string, unknown>;
    }>;
    nodeData?: Record<string, Array<{
        json: Record<string, unknown>;
    }>>;
    vars?: Record<string, unknown>;
    env?: Record<string, string>;
    /** When set, only these env var names are exposed to expressions. */
    envAllowlist?: string[];
    /** Execution metadata; defaults to a preview placeholder when omitted. */
    execution?: {
        id: string;
        mode: "manual" | "webhook" | "trigger" | "runtime";
        resumeUrl?: string;
    };
}
export interface EvalResult {
    ok: boolean;
    value?: unknown;
    error?: string;
    /** True when the input contained no expression at all. */
    literal: boolean;
}
export declare function isExpression(value: unknown): boolean;
export declare function evaluateExpression(input: unknown, ctx: ExpressionContext): EvalResult;
export declare const EXPRESSION_HELPERS: Array<{
    label: string;
    detail: string;
}>;
