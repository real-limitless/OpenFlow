import type { INode } from "@/lib/workflow/types";

export function getParam<T = unknown>(
  node: INode,
  name: string,
  defaultValue?: T,
): T {
  const params = node.parameters ?? {};
  if (Object.prototype.hasOwnProperty.call(params, name)) {
    return params[name] as T;
  }
  return defaultValue as T;
}

export function getParams(node: INode): Record<string, unknown> {
  return { ...(node.parameters ?? {}) };
}
