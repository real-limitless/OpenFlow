import type { INode } from "@/lib/workflow/types";
export declare function getParam<T = unknown>(node: INode, name: string, defaultValue?: T): T;
export declare function getParams(node: INode): Record<string, unknown>;
