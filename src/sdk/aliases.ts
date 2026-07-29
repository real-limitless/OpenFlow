/**
 * Optional familiar helper names mapped onto native ExecutionContext.
 *
 * These exist for human porters who prefer short aliases. They are NOT a
 * third-party compatibility layer and are intentionally incomplete.
 *
 * New OpenFlow code and AI implement agents should use native methods:
 *   getInputItems, getParam, getNode, evaluate, …
 *
 * Do not expand this file into a full mirror of any external helper catalog.
 */

import type { ExecutionContext, Item } from "./types";

export interface AliasContext {
  getInputData(inputIndex?: number): Item[];
  getNodeParameter<T = unknown>(name: string, _itemIndex?: number, fallback?: T): T;
  getWorkflow(): ReturnType<ExecutionContext["getWorkflow"]>;
  getNode(): ReturnType<ExecutionContext["getNode"]>;
  continueOnFail(): boolean;
  /** Native context for anything else. */
  native: ExecutionContext;
}

/** Wrap a native context with thin familiar aliases. */
export function withAliases(ctx: ExecutionContext): AliasContext {
  return {
    getInputData(inputIndex = 0) {
      return ctx.getInputItems(inputIndex);
    },
    getNodeParameter<T = unknown>(name: string, _itemIndex?: number, fallback?: T): T {
      return ctx.getParam<T>(name, fallback as T);
    },
    getWorkflow() {
      return ctx.getWorkflow();
    },
    getNode() {
      return ctx.getNode();
    },
    continueOnFail() {
      return ctx.continueOnFail();
    },
    native: ctx,
  };
}
