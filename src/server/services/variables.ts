import { prisma } from "../db";
import { decrypt, encrypt } from "../crypto";

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidVariableKey(key: string): boolean {
  return KEY_RE.test(key) && key.length <= 128;
}

export function serializeVariableValue(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

export function parseVariableValue(raw: string, secret: boolean): unknown {
  const text = secret ? decrypt(raw) : raw;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function storeVariableValue(value: unknown, secret: boolean): string {
  const json = serializeVariableValue(value);
  return secret ? encrypt(json) : json;
}

function applyRows(
  map: Record<string, unknown>,
  rows: Array<{ key: string; value: string; secret: boolean }>,
) {
  for (const row of rows) {
    try {
      map[row.key] = parseVariableValue(row.value, row.secret);
    } catch {
      /* skip corrupt */
    }
  }
}

/**
 * Load vars with override order:
 * instance base → instance env → project base → project env
 */
export async function loadVarsMap(
  projectId?: string | null,
  environmentId?: string | null,
): Promise<Record<string, unknown>> {
  const map: Record<string, unknown> = {};

  const instanceBase = await prisma.variable.findMany({
    where: { scope: "instance", environmentId: null },
    select: { key: true, value: true, secret: true },
  });
  applyRows(map, instanceBase);

  if (environmentId) {
    const instanceEnv = await prisma.variable.findMany({
      where: { scope: "instance", environmentId },
      select: { key: true, value: true, secret: true },
    });
    applyRows(map, instanceEnv);
  }

  if (projectId) {
    const projectBase = await prisma.variable.findMany({
      where: { scope: "project", projectId, environmentId: null },
      select: { key: true, value: true, secret: true },
    });
    applyRows(map, projectBase);

    if (environmentId) {
      const projectEnv = await prisma.variable.findMany({
        where: { scope: "project", projectId, environmentId },
        select: { key: true, value: true, secret: true },
      });
      applyRows(map, projectEnv);
    }
  }

  return map;
}

export function redactForClient(row: {
  id: string;
  key: string;
  value: string;
  scope: string;
  projectId: string | null;
  environmentId?: string | null;
  secret: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  let value: unknown = null;
  if (row.secret) {
    value = "••••••••";
  } else {
    try {
      value = parseVariableValue(row.value, false);
    } catch {
      value = null;
    }
  }
  return {
    id: row.id,
    key: row.key,
    value,
    scope: row.scope,
    projectId: row.projectId,
    environmentId: row.environmentId ?? null,
    secret: row.secret,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type VariableClient = ReturnType<typeof redactForClient>;
export type VariableServiceError = { error: string; status: number };

async function assertVariableWriteAccess(
  userId: string,
  scope: "instance" | "project",
  projectId: string | null,
): Promise<VariableServiceError | null> {
  const { requireProjectPermission } = await import("./projects");
  if (scope === "instance") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role !== "owner" && user?.role !== "admin" && userId !== "local") {
      return { error: "Only instance admins can set instance variables", status: 403 };
    }
    return null;
  }
  if (!projectId) return { error: "projectId required", status: 400 };
  const access = await requireProjectPermission(projectId, userId, "editor");
  if (!access.ok) return { error: access.error, status: access.status };
  return null;
}

export async function listVariablesMeta(
  userId: string,
  opts: {
    scope?: "project" | "instance";
    projectId?: string | null;
    environmentId?: string | null;
    layer?: "base" | "env" | "all";
  },
): Promise<VariableClient[] | VariableServiceError> {
  const { ensureUserWithProject } = await import("./users");
  const { requireProjectPermission } = await import("./projects");
  const { resolveEnvironment } = await import("./environments");

  const { projectId: personalId } = await ensureUserWithProject(userId);
  const scope = opts.scope === "instance" ? "instance" : "project";
  const projectId = opts.projectId || personalId;
  const layer = opts.layer ?? "all";
  const envRef = opts.environmentId ?? null;

  if (scope === "instance") {
    const rows = await prisma.variable.findMany({
      where: {
        scope: "instance",
        ...(layer === "base"
          ? { environmentId: null }
          : layer === "env" && envRef
            ? { environmentId: envRef }
            : {}),
      },
      orderBy: { key: "asc" },
    });
    return rows.map(redactForClient);
  }

  const access = await requireProjectPermission(projectId, userId, "viewer");
  if (!access.ok) return { error: access.error, status: access.status };

  let environmentId: string | null | undefined;
  if (layer === "env" || (layer === "all" && envRef)) {
    const env = await resolveEnvironment(projectId, envRef);
    environmentId = env?.id ?? null;
  }

  const where =
    layer === "base"
      ? { scope: "project" as const, projectId, environmentId: null }
      : layer === "env"
        ? {
            scope: "project" as const,
            projectId,
            environmentId: environmentId ?? "__none__",
          }
        : { scope: "project" as const, projectId };

  const rows = await prisma.variable.findMany({
    where,
    orderBy: [{ environmentId: "asc" }, { key: "asc" }],
  });
  return rows.map(redactForClient);
}

export async function createVariable(
  userId: string,
  input: {
    key: string;
    value?: unknown;
    scope?: "project" | "instance";
    projectId?: string | null;
    environmentId?: string | null;
    secret?: boolean;
  },
): Promise<VariableClient | VariableServiceError> {
  const { ensureUserWithProject } = await import("./users");
  const { resolveEnvironment } = await import("./environments");

  const { projectId: personalId } = await ensureUserWithProject(userId);
  const key = typeof input.key === "string" ? input.key.trim() : "";
  if (!isValidVariableKey(key)) {
    return {
      error: "key must be a valid identifier (A-Z, a-z, 0-9, _; max 128)",
      status: 400,
    };
  }

  const scope = input.scope === "instance" ? "instance" : "project";
  const secret = Boolean(input.secret);
  const projectId = scope === "project" ? input.projectId || personalId : null;

  let environmentId: string | null = null;
  if (input.environmentId !== undefined && input.environmentId !== null && input.environmentId !== "") {
    if (scope === "project" && projectId) {
      const env = await resolveEnvironment(projectId, input.environmentId);
      if (!env) return { error: "Environment not found", status: 404 };
      environmentId = env.id;
    } else {
      environmentId = input.environmentId;
    }
  }

  const denied = await assertVariableWriteAccess(userId, scope, projectId);
  if (denied) return denied;

  const stored = storeVariableValue(input.value, secret);
  try {
    const row = await prisma.variable.create({
      data: {
        key,
        value: stored,
        scope,
        projectId,
        environmentId,
        secret,
      },
    });
    return redactForClient(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return { error: "Variable key already exists in this scope/environment", status: 409 };
    }
    throw err;
  }
}

export async function updateVariable(
  userId: string,
  id: string,
  input: { key?: string; value?: unknown; secret?: boolean },
): Promise<VariableClient | VariableServiceError> {
  const existing = await prisma.variable.findUnique({ where: { id } });
  if (!existing) return { error: "Not found", status: 404 };

  const denied = await assertVariableWriteAccess(
    userId,
    existing.scope === "instance" ? "instance" : "project",
    existing.projectId,
  );
  if (denied) {
    if (existing.scope !== "instance") return { error: "Not found", status: 404 };
    return denied;
  }

  const update: { key?: string; value?: string; secret?: boolean } = {};
  if (typeof input.key === "string") {
    const key = input.key.trim();
    if (!isValidVariableKey(key)) return { error: "invalid key", status: 400 };
    update.key = key;
  }
  if (input.secret !== undefined) update.secret = Boolean(input.secret);
  if (input.value !== undefined) {
    const secret = update.secret ?? existing.secret;
    update.value = storeVariableValue(input.value, secret);
  }

  try {
    const row = await prisma.variable.update({ where: { id }, data: update });
    return redactForClient(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return { error: "Variable key already exists in this scope/environment", status: 409 };
    }
    throw err;
  }
}

export async function deleteVariable(
  userId: string,
  id: string,
): Promise<{ success: true } | VariableServiceError> {
  const existing = await prisma.variable.findUnique({ where: { id } });
  if (!existing) return { error: "Not found", status: 404 };

  const denied = await assertVariableWriteAccess(
    userId,
    existing.scope === "instance" ? "instance" : "project",
    existing.projectId,
  );
  if (denied) {
    if (existing.scope !== "instance") return { error: "Not found", status: 404 };
    return denied;
  }

  await prisma.variable.delete({ where: { id } });
  return { success: true };
}

export function isVariableServiceError(v: unknown): v is VariableServiceError {
  return Boolean(v && typeof v === "object" && "error" in v && "status" in v);
}
