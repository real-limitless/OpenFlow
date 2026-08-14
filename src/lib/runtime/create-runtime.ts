import type { CredentialData, CredentialResolver } from "../engine/credentials";
import { executeWorkflow, type RunResult } from "../engine/runner";
import type { INodeExecutionData, IWorkflow } from "../workflow/types";
import { parseWorkflowJson } from "../workflow/schema";
import { LITE_NODE_TYPES, LITE_TRIGGER_TYPES } from "./allowlist";
import { createLiteExecutorMap } from "./executors";
import { LiteRuntimeError } from "./errors";
import { denyPrivateUrls } from "./url-policy";
import { assertLiteCompatible, unsupportedLiteNodes } from "./validate";
import { serializeForRuntime, type RuntimeExport } from "./serialize";

export type LiteCredentials = CredentialResolver | Record<string, CredentialData>;

export interface CreateRuntimeOptions {
  credentials?: LiteCredentials;
  vars?: Record<string, unknown>;
  env?: Record<string, string>;
  envAllowlist?: string[];
  allowUrl?: (url: string) => boolean;
}

export interface RuntimeRunOptions {
  input?: unknown;
  startNode?: string | null;
  onProgress?: Parameters<typeof executeWorkflow>[0]["onProgress"];
}

export interface LiteRuntime {
  supportedTypes(): readonly string[];
  validate(workflow: IWorkflow | string): RuntimeExport;
  run(workflow: IWorkflow | string, options?: RuntimeRunOptions): Promise<RunResult>;
}

function parseInput(workflow: IWorkflow | string): IWorkflow {
  if (typeof workflow !== "string") return workflow;
  const parsed = parseWorkflowJson(workflow);
  if (!parsed.ok || !parsed.workflow) {
    throw new LiteRuntimeError(parsed.error ?? "Invalid workflow JSON", "invalid_workflow");
  }
  return parsed.workflow;
}

function makeResolver(creds?: LiteCredentials): CredentialResolver | undefined {
  if (!creds) return undefined;
  if (typeof creds === "function") return creds;
  return async (ref) => {
    if (ref.type && creds[ref.type]) return creds[ref.type];
    if (ref.id && creds[ref.id]) return creds[ref.id];
    if (creds[ref.name]) return creds[ref.name];
    return null;
  };
}

function toPinItems(input: unknown): INodeExecutionData[] {
  if (input == null) return [{ json: {} }];
  if (Array.isArray(input)) {
    return input.map((item) => {
      if (item && typeof item === "object" && "json" in item) {
        return item as INodeExecutionData;
      }
      if (item && typeof item === "object") {
        return { json: item as Record<string, unknown> };
      }
      return { json: { value: item } };
    });
  }
  if (typeof input === "object" && input && "json" in input) {
    return [input as INodeExecutionData];
  }
  if (typeof input === "object" && input) {
    return [{ json: input as Record<string, unknown> }];
  }
  return [{ json: { value: input } }];
}

function resolveStartName(workflow: IWorkflow, preferred?: string | null): string | null {
  if (preferred) return preferred;
  const trigger = workflow.nodes.find((n) => !n.disabled && LITE_TRIGGER_TYPES.has(n.type));
  if (trigger) return trigger.name;
  return workflow.nodes.find((n) => !n.disabled)?.name ?? null;
}

export function createRuntime(options: CreateRuntimeOptions = {}): LiteRuntime {
  const nodeExecutors = createLiteExecutorMap();
  const credentialResolver = makeResolver(options.credentials);
  const allowUrl = options.allowUrl ?? denyPrivateUrls;
  const env = options.env ?? {};

  return {
    supportedTypes() {
      return LITE_NODE_TYPES;
    },
    validate(workflow) {
      const parsed = parseInput(workflow);
      return serializeForRuntime(parsed);
    },
    async run(workflow, runOptions = {}) {
      const parsed = parseInput(workflow);
      assertLiteCompatible(parsed);
      const startNode = resolveStartName(parsed, runOptions.startNode);
      const pinData = startNode != null ? { [startNode]: toPinItems(runOptions.input) } : undefined;

      const result = await executeWorkflow({
        workflow: parsed,
        nodeExecutors,
        pinData,
        startNode,
        credentialResolver,
        vars: options.vars,
        env,
        envAllowlist: options.envAllowlist,
        allowUrl,
        onProgress: runOptions.onProgress,
      });

      const missing = Object.entries(result.runData).filter(
        ([, v]) => v.status === "skipped" && v.error?.startsWith("No executor"),
      );
      if (missing.length > 0) {
        const unsupported = unsupportedLiteNodes(parsed);
        throw new LiteRuntimeError(
          `Missing lite executor for: ${missing.map(([n]) => n).join(", ")}`,
          "missing_executor",
          unsupported,
        );
      }

      return result;
    },
  };
}
