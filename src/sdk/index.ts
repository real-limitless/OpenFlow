/**
 * OpenFlow Plugin SDK — public surface for node authors.
 * See docs/sdk/OVERVIEW.md and src/sdk/README.md.
 */

export type {
  Item,
  NodeOutput,
  ExecutionContext,
  NodeExecutor,
  NodeDefinition,
  CreateContextOptions,
  INode,
  IWorkflow,
  INodeExecutionData,
  INodeTypeDescription,
  CredentialData,
} from "./types";

export { createExecutionContext } from "./context";
export { defineNode, definitionToExecutor } from "./define-node";
export {
  createNodeRegistry,
  executorMapFromRecord,
  type NodeRegistry,
} from "./registry";
export { withAliases, type AliasContext } from "./aliases";

export { getParam, getParams } from "./helpers/params";
export { ensureItems, mapItems, withPairedItem } from "./helpers/items";
export { evaluateOnItem } from "./helpers/expressions";
export { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "./helpers/http";
export { requireCredential } from "./helpers/credentials";
