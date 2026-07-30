import type { CreateContextOptions, ExecutionContext } from "./types";
import { getParam, getParams } from "./helpers/params";
import { evaluateOnItem } from "./helpers/expressions";

export function createExecutionContext(
  options: CreateContextOptions,
): ExecutionContext {
  const {
    node,
    workflow,
    getNodeInputItems,
    continueOnFail,
    getCredential,
    nodeData,
  } = options;

  const customData: Record<string, string> = options.customData ?? {};

  const ctx: ExecutionContext = {
    node,
    getInputItems(inputIndex = 0) {
      return getNodeInputItems(node.name, inputIndex);
    },
    getParam<T = unknown>(name: string, defaultValue?: T): T {
      return getParam(node, name, defaultValue);
    },
    getParams() {
      return getParams(node);
    },
    getNode() {
      return node;
    },
    getWorkflow() {
      return workflow;
    },
    continueOnFail() {
      return continueOnFail;
    },
    async getCredential(name: string) {
      if (!getCredential) return null;
      return getCredential(name);
    },
    evaluate(expression: string, itemJson: Record<string, unknown> = {}) {
      return evaluateOnItem(expression, itemJson, {
        nodeData,
        env: typeof process !== "undefined" ? (process.env as Record<string, string>) : undefined,
      });
    },
    getNodeInputItems,
    runSubWorkflow: options.runSubWorkflow,
    setCustomData(key: string, value: string) {
      customData[key] = value;
    },
    getCustomData(key: string) {
      return customData[key];
    },
    getAllCustomData() {
      return { ...customData };
    },
  };

  return ctx;
}
