import type { INodeExecutionData } from "@/lib/workflow/types";
export declare function evaluateOnItem(expression: string, itemJson?: Record<string, unknown>, extras?: {
    nodeData?: Record<string, INodeExecutionData[]>;
    env?: Record<string, string>;
    envAllowlist?: string[];
    vars?: Record<string, unknown>;
}): unknown;
