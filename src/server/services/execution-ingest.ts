import { prisma } from "../db";
import { redactRunData } from "../../lib/engine/redact-run-data";
import { hasScope } from "../oauth/scopes";
import { assertAgentWorkflowAccess, type WorkflowPolicy } from "./agent-policy";
import { loadWorkflowIfAllowed } from "./workflow-access";
import {
  notifyExecutionFinished,
  notifyExecutionProgress,
  notifyExecutionStarted,
} from "./workflow-events";

export const MAX_RUN_DATA_BYTES = 2 * 1024 * 1024;

const INGEST_KINDS = new Set(["api_key", "oauth", "temporary", "disabled"]);
const STATUSES = new Set(["running", "success", "error"]);

export type IngestAuth = {
  userId?: string;
  authKind?: string;
  scopes?: string[];
  workflowPolicy?: WorkflowPolicy;
};

export type IngestBody = {
  status?: unknown;
  startedAt?: unknown;
  finishedAt?: unknown;
  runData?: unknown;
  error?: unknown;
  host?: unknown;
  stageId?: unknown;
  projectId?: unknown;
  fingerprint?: unknown;
};

export type IngestFailure = { status: 401 | 403 | 404 | 413 | 400; error: string };

export function requireIngestAuth(auth: IngestAuth): IngestFailure | null {
  if (!auth.userId) return { status: 401, error: "Authentication required" };
  if (!auth.authKind || !INGEST_KINDS.has(auth.authKind)) {
    return { status: 401, error: "Runtime ingest requires an API key or token" };
  }
  if (!hasScope(auth.scopes, "openflow:execute")) {
    return { status: 403, error: "Missing scope openflow:execute" };
  }
  return null;
}

export async function authorizeIngestWorkflow(
  workflowId: string,
  auth: IngestAuth,
): Promise<IngestFailure | null> {
  const denied = requireIngestAuth(auth);
  if (denied) return denied;
  const access = await loadWorkflowIfAllowed(workflowId, auth.userId!, "viewer");
  if ("error" in access) return { status: 404, error: "Workflow not found" };
  try {
    assertAgentWorkflowAccess(
      auth.workflowPolicy ?? { mode: "unrestricted" },
      workflowId,
      "execute",
    );
  } catch {
    return { status: 403, error: "Missing execute grant for this workflow" };
  }
  return null;
}

function parseDate(raw: unknown): Date | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw !== "string" && !(raw instanceof Date)) return undefined;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function serializeError(error: unknown): string | null {
  if (error == null || error === "") return null;
  if (typeof error === "string") return JSON.stringify({ message: error });
  if (typeof error === "object" && error && "message" in error) {
    return JSON.stringify({ message: String((error as { message: unknown }).message) });
  }
  return JSON.stringify({ message: String(error) });
}

function buildMeta(body: IngestBody): string | null {
  const meta: Record<string, string> = {};
  for (const key of ["host", "stageId", "projectId", "fingerprint"] as const) {
    const v = body[key];
    if (typeof v === "string" && v.trim()) meta[key] = v.trim();
  }
  return Object.keys(meta).length ? JSON.stringify(meta) : null;
}

export function parseIngestPayload(body: IngestBody):
  | {
      ok: true;
      status: string;
      startedAt?: Date;
      finishedAt?: Date | null;
      runData: string;
      error: string | null;
      meta: string | null;
    }
  | { ok: false; failure: IngestFailure } {
  const status = typeof body.status === "string" ? body.status : "";
  if (!STATUSES.has(status)) {
    return {
      ok: false,
      failure: { status: 400, error: "status must be running, success, or error" },
    };
  }
  const runData = redactRunData(body.runData ?? {});
  const encoded = JSON.stringify(runData);
  if (encoded.length > MAX_RUN_DATA_BYTES) {
    return { ok: false, failure: { status: 413, error: "runData exceeds 2MB limit" } };
  }
  const startedAt = parseDate(body.startedAt);
  const finishedAt = body.finishedAt === null ? null : parseDate(body.finishedAt);
  return {
    ok: true,
    status,
    startedAt,
    finishedAt,
    runData: encoded,
    error: serializeError(body.error),
    meta: buildMeta(body),
  };
}

export async function createRuntimeExecution(workflowId: string, body: IngestBody) {
  const parsed = parseIngestPayload(body);
  if (!parsed.ok) return parsed;
  const row = await prisma.execution.create({
    data: {
      workflowId,
      status: parsed.status,
      mode: "runtime",
      startedAt: parsed.startedAt ?? new Date(),
      finishedAt:
        parsed.status === "running"
          ? (parsed.finishedAt ?? null)
          : (parsed.finishedAt ?? new Date()),
      runData: parsed.runData,
      error: parsed.error,
      meta: parsed.meta,
    },
  });
  notifyExecutionStarted(workflowId, row.id, "runtime");
  if (parsed.status === "success" || parsed.status === "error") {
    notifyExecutionFinished(workflowId, row.id, parsed.status, "runtime");
  } else {
    notifyExecutionProgress(row.id, body.runData ?? {});
  }
  return { ok: true as const, row };
}

export async function updateRuntimeExecution(
  executionId: string,
  userId: string,
  body: IngestBody,
) {
  const existing = await prisma.execution.findFirst({
    where: {
      id: executionId,
      mode: "runtime",
      workflow: { project: { members: { some: { userId } } } },
    },
  });
  if (!existing)
    return { ok: false as const, failure: { status: 404 as const, error: "Execution not found" } };
  const parsed = parseIngestPayload(body);
  if (!parsed.ok) return parsed;
  const row = await prisma.execution.update({
    where: { id: executionId },
    data: {
      status: parsed.status,
      startedAt: parsed.startedAt ?? existing.startedAt,
      finishedAt:
        parsed.status === "running"
          ? (parsed.finishedAt ?? null)
          : (parsed.finishedAt ?? existing.finishedAt ?? new Date()),
      runData: parsed.runData,
      error: parsed.error,
      meta: parsed.meta ?? existing.meta,
    },
  });
  if (parsed.status === "success" || parsed.status === "error") {
    notifyExecutionFinished(row.workflowId, row.id, parsed.status, "runtime");
  } else {
    notifyExecutionProgress(row.id, body.runData ?? {});
  }
  return { ok: true as const, row };
}
