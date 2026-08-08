import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { ALL_MCP_SCOPES, parseScopes } from "../oauth/scopes";

export type WorkflowPerm = "read" | "write" | "execute";

export type WorkflowGrant = {
  workflowId: string;
  canRead: boolean;
  canWrite: boolean;
  canExecute: boolean;
  expiresAt: Date | null;
};

export type WorkflowPolicy =
  | { mode: "unrestricted" }
  | {
      mode: "grants";
      grants: WorkflowGrant[];
      canCreateWorkflows: boolean;
    };

export type AgentAuth = {
  userId: string;
  scopes: string[];
  authKind: "session" | "api_key" | "oauth" | "temporary" | "disabled";
  agentId?: string;
  workflowPolicy: WorkflowPolicy;
};

export function unrestrictedPolicy(): WorkflowPolicy {
  return { mode: "unrestricted" };
}

export function hashOpaqueToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function grantActive(g: WorkflowGrant, now = Date.now()): boolean {
  if (g.expiresAt && g.expiresAt.getTime() < now) return false;
  return true;
}

export function grantAllows(g: WorkflowGrant, need: WorkflowPerm): boolean {
  if (need === "read") return g.canRead || g.canWrite || g.canExecute;
  if (need === "write") return g.canWrite;
  return g.canExecute;
}

export function assertAgentWorkflowAccess(
  policy: WorkflowPolicy,
  workflowId: string,
  need: WorkflowPerm,
): void {
  if (policy.mode === "unrestricted") return;
  const now = Date.now();
  const g = policy.grants.find((x) => x.workflowId === workflowId && grantActive(x, now));
  if (!g) {
    throw new Error(
      `No MCP grant for workflow ${workflowId}. Add this workflow to the API key / token grants.`,
    );
  }
  if (!grantAllows(g, need)) {
    throw new Error(`MCP grant for workflow ${workflowId} lacks ${need} permission.`);
  }
}

export function filterWorkflowIdsByPolicy(
  policy: WorkflowPolicy,
  workflowIds: string[],
): string[] {
  if (policy.mode === "unrestricted") return workflowIds;
  const now = Date.now();
  const allowed = new Set(
    policy.grants.filter((g) => grantActive(g, now) && g.canRead).map((g) => g.workflowId),
  );
  return workflowIds.filter((id) => allowed.has(id));
}

export function grantedWorkflowIds(policy: WorkflowPolicy, need: WorkflowPerm = "read"): string[] {
  if (policy.mode === "unrestricted") return [];
  const now = Date.now();
  return policy.grants
    .filter((g) => grantActive(g, now) && grantAllows(g, need))
    .map((g) => g.workflowId);
}

export function canAgentCreateWorkflows(policy: WorkflowPolicy): boolean {
  if (policy.mode === "unrestricted") return true;
  return policy.canCreateWorkflows;
}

function parseScopeList(raw: string): string[] {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed || trimmed === "[]") return [...ALL_MCP_SCOPES];
  try {
    const j = JSON.parse(trimmed) as unknown;
    if (Array.isArray(j)) {
      const parsed = parseScopes(j.join(" "));
      return parsed.length ? parsed : [...ALL_MCP_SCOPES];
    }
  } catch {
    /* space-separated */
  }
  return parseScopes(trimmed);
}

function mapGrantRows(
  rows: {
    workflowId: string;
    canRead: boolean;
    canWrite: boolean;
    canExecute: boolean;
    expiresAt: Date | null;
  }[],
): WorkflowGrant[] {
  return rows.map((r) => ({
    workflowId: r.workflowId,
    canRead: r.canRead,
    canWrite: r.canWrite,
    canExecute: r.canExecute,
    expiresAt: r.expiresAt,
  }));
}

export async function resolveApiKeyAuth(rawKey: string): Promise<AgentAuth | null> {
  if (!rawKey.startsWith("of_")) return null;
  const keyHash = hashOpaqueToken(rawKey);

  let row = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { grants: true },
  });

  if (!row) {
    const legacy = await prisma.apiKey.findMany({
      where: { keyHash: { startsWith: "$2" } },
      include: { grants: true },
    });
    for (const cand of legacy) {
      if (await bcrypt.compare(rawKey, cand.keyHash)) {
        row = cand;
        break;
      }
    }
  }
  if (!row) return null;

  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  // fire-and-forget last used
  void prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const scopes = parseScopeList(row.scopes);
  if (!row.restrictWorkflows) {
    return {
      userId: row.userId,
      scopes,
      authKind: "api_key",
      agentId: row.id,
      workflowPolicy: unrestrictedPolicy(),
    };
  }

  return {
    userId: row.userId,
    scopes,
    authKind: "api_key",
    agentId: row.id,
    workflowPolicy: {
      mode: "grants",
      grants: mapGrantRows(row.grants),
      canCreateWorkflows: row.canCreateWorkflows,
    },
  };
}

export async function resolveTemporaryTokenAuth(raw: string): Promise<AgentAuth | null> {
  if (!raw.startsWith("oft_")) return null;
  const row = await prisma.mcpTemporaryToken.findUnique({
    where: { tokenHash: hashOpaqueToken(raw) },
    include: { grants: true },
  });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  void prisma.mcpTemporaryToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    userId: row.userId,
    scopes: parseScopeList(row.scopes),
    authKind: "temporary",
    agentId: row.id,
    workflowPolicy: {
      mode: "grants",
      grants: mapGrantRows(row.grants),
      canCreateWorkflows: false,
    },
  };
}

export async function resolveOAuthAgentAuth(
  userId: string,
  scopes: string[],
  tokenId: string,
): Promise<AgentAuth> {
  const grants = await prisma.oAuthTokenWorkflowGrant.findMany({
    where: { tokenId },
  });
  // New OAuth tokens always use grants mode (empty = no workflows).
  // Tokens with zero grant rows from before this feature: treat as unrestricted
  // only if created before migration — we always create grants on new tokens;
  // empty grants = restricted empty.
  return {
    userId,
    scopes,
    authKind: "oauth",
    agentId: tokenId,
    workflowPolicy: {
      mode: "grants",
      grants: mapGrantRows(grants),
      canCreateWorkflows: false,
    },
  };
}

export type GrantInput = {
  workflowId: string;
  canRead?: boolean;
  canWrite?: boolean;
  canExecute?: boolean;
  expiresAt?: string | Date | null;
};

export function normalizeGrantInputs(inputs: GrantInput[]): WorkflowGrant[] {
  const out: WorkflowGrant[] = [];
  const seen = new Set<string>();
  for (const g of inputs) {
    const workflowId = typeof g.workflowId === "string" ? g.workflowId.trim() : "";
    if (!workflowId || seen.has(workflowId)) continue;
    seen.add(workflowId);
    let expiresAt: Date | null = null;
    if (g.expiresAt) {
      const d = g.expiresAt instanceof Date ? g.expiresAt : new Date(g.expiresAt);
      if (!Number.isNaN(d.getTime())) expiresAt = d;
    }
    const canWrite = Boolean(g.canWrite);
    const canExecute = Boolean(g.canExecute);
    const canRead = g.canRead === false ? canWrite || canExecute : true;
    out.push({ workflowId, canRead, canWrite, canExecute, expiresAt });
  }
  return out;
}

export function permForTool(toolName: string): WorkflowPerm | "none" | "create" {
  switch (toolName) {
    case "list_workflows":
    case "list_node_types":
    case "get_node_type":
    case "list_credentials":
      return "none";
    case "create_workflow":
      return "create";
    case "execute_workflow":
      return "execute";
    case "get_workflow":
    case "get_execution":
    case "list_executions":
    case "select_node":
    case "open_workflow":
      return "read";
    default:
      return "write";
  }
}
