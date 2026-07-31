// Executor barrel.
//
// This file is self-maintaining: it registers every executor listed in
// BUILTIN_EXECUTOR_MODULES (node-runtime.ts), which is the single source of
// truth for the type -> module/export mapping. Adding a node means appending
// one entry there — never editing this file.
//
// The modules are pulled in via import.meta.glob with eager: true so the
// bundler can resolve them statically. A dynamic `await import(variablePath)`
// looks equivalent but is invisible to Rolldown, which silently drops every
// such module from the production bundle while tests still pass.
import { registerExecutor, BUILTIN_EXECUTOR_MODULES } from "../node-runtime";
import type { NodeExecutor } from "../types";

// Matches this file too; that key is never looked up, so the self-edge is inert.
const modules = import.meta.glob("./*.ts", { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

for (const entry of BUILTIN_EXECUTOR_MODULES) {
  const key = `${entry.modulePath.replace(/^\.\/executors\//, "./")}.ts`;
  const fn = modules[key]?.[entry.exportName];
  if (typeof fn === "function") {
    registerExecutor(entry.type, fn as NodeExecutor);
  }
}

export { defaultExecutors, getExecutorMap, seedBuiltinExecutors } from "../node-runtime";
