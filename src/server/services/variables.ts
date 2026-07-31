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
