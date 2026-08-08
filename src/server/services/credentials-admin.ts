import { listCredentialTypes, getCredentialTypeDef } from "../../lib/credentials/types";
import { prisma } from "../db";
import { getDefaultSecretProvider, storeCredentialSecret } from "../secrets";
import { ensureUserWithProject } from "./users";
import {
  listAccessibleProjectIds,
  requireProjectPermission,
} from "./projects";
import { listSharedResourceIds, requireResourceAccess } from "./shares";

export type CredentialMetaOut = {
  id: string;
  name: string;
  type: string;
  projectId: string;
  secretProviderId: string | null;
  externalRef: string | null;
  external: boolean;
  shared?: boolean;
  sharePermission?: string;
  createdAt: string;
};

function metaSelect() {
  return {
    id: true,
    name: true,
    type: true,
    projectId: true,
    secretProviderId: true,
    externalRef: true,
    createdAt: true,
  } as const;
}

function toMeta(row: {
  id: string;
  name: string;
  type: string;
  projectId: string;
  secretProviderId?: string | null;
  externalRef?: string | null;
  createdAt: Date;
  shared?: boolean;
  sharePermission?: string;
}): CredentialMetaOut {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    projectId: row.projectId,
    secretProviderId: row.secretProviderId ?? null,
    externalRef: row.externalRef ?? null,
    external: Boolean(row.secretProviderId && row.externalRef),
    shared: row.shared,
    sharePermission: row.sharePermission,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export type ServiceError = { error: string; status: number };

function isErr(v: unknown): v is ServiceError {
  return Boolean(v && typeof v === "object" && "error" in v && "status" in v);
}

export async function listCredentialsMeta(
  userId: string,
  opts?: {
    projectId?: string | null;
    type?: string | null;
    includeUse?: boolean;
  },
): Promise<CredentialMetaOut[]> {
  await ensureUserWithProject(userId);

  let projectIds: string[];
  if (opts?.projectId) {
    const access = await requireProjectPermission(opts.projectId, userId, "viewer");
    if (!access.ok) {
      const err: ServiceError = { error: access.error, status: access.status };
      throw Object.assign(new Error(err.error), { status: err.status, serviceError: err });
    }
    projectIds = [opts.projectId];
  } else {
    projectIds = await listAccessibleProjectIds(userId, "viewer");
  }

  const includeUse = opts?.includeUse !== false;
  const sharedIds =
    opts?.projectId
      ? []
      : await listSharedResourceIds("credential", userId, includeUse ? "use" : "view");

  const credentials = await prisma.credential.findMany({
    where: {
      AND: [
        {
          OR: [
            { projectId: { in: projectIds } },
            ...(sharedIds.length > 0 ? [{ id: { in: sharedIds } }] : []),
          ],
        },
        ...(opts?.type ? [{ type: opts.type }] : []),
      ],
    },
    select: metaSelect(),
    orderBy: { createdAt: "desc" },
  });

  const sharedSet = new Set(sharedIds);
  return credentials.map((row) =>
    toMeta({
      ...row,
      shared: sharedSet.has(row.id) && !projectIds.includes(row.projectId),
    }),
  );
}

/** Compact list for MCP bind helpers. */
export async function listCredentialsCompact(
  userId: string,
  opts?: { projectId?: string | null; type?: string | null },
) {
  const rows = await listCredentialsMeta(userId, { ...opts, includeUse: true });
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    projectId: r.projectId,
  }));
  return { count: items.length, items };
}

export function listCredentialTypeCatalog(query?: string) {
  let types = listCredentialTypes();
  if (query?.trim()) {
    const q = query.trim().toLowerCase();
    types = types.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.displayName.toLowerCase().includes(q),
    );
  }
  return {
    count: types.length,
    items: types.map((t) => ({
      name: t.name,
      displayName: t.displayName,
      fields: t.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type ?? "text",
        required: Boolean(f.required),
        placeholder: f.placeholder,
      })),
    })),
  };
}

export async function createCredential(
  userId: string,
  input: {
    name: string;
    type: string;
    data: Record<string, unknown>;
    projectId?: string | null;
    secretProviderId?: string | null;
    externalRef?: string | null;
  },
): Promise<CredentialMetaOut | ServiceError> {
  const { projectId: personalId } = await ensureUserWithProject(userId);
  const name = input.name?.trim();
  const type = input.type?.trim();
  if (!name || !type) return { error: "name, type, and data required", status: 400 };
  if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) {
    return { error: "data must be an object", status: 400 };
  }

  const projectId = input.projectId || personalId;
  const access = await requireProjectPermission(projectId, userId, "editor");
  if (!access.ok) return { error: access.error, status: access.status };

  // Validate type exists in catalog (unknown types still allowed via generic fields)
  getCredentialTypeDef(type);

  let secretProviderId = input.secretProviderId ?? null;
  if (secretProviderId === undefined || secretProviderId === null) {
    const def = await getDefaultSecretProvider();
    if (def && def.type !== "local") secretProviderId = def.id;
  }

  const id = crypto.randomUUID();
  const stored = await storeCredentialSecret({
    data: input.data,
    secretProviderId,
    externalRef: input.externalRef ?? null,
    credentialId: id,
  });

  const credential = await prisma.credential.create({
    data: {
      id,
      userId,
      projectId,
      name,
      type,
      dataEncrypted: stored.dataEncrypted,
      secretProviderId: stored.secretProviderId,
      externalRef: stored.externalRef,
    },
    select: metaSelect(),
  });

  return toMeta(credential);
}

export async function updateCredential(
  userId: string,
  id: string,
  input: {
    name?: string;
    data?: Record<string, unknown>;
    secretProviderId?: string | null;
    externalRef?: string | null;
  },
): Promise<CredentialMetaOut | ServiceError> {
  const existing = await prisma.credential.findUnique({ where: { id } });
  if (!existing) return { error: "Not found", status: 404 };

  const access = await requireResourceAccess(
    "credential",
    id,
    userId,
    "edit",
    existing.projectId,
  );
  if (!access.ok) return { error: "Not found", status: 404 };

  const update: {
    name?: string;
    dataEncrypted?: string;
    secretProviderId?: string | null;
    externalRef?: string | null;
  } = {};
  if (input.name !== undefined) update.name = input.name;

  if (input.data !== undefined) {
    if (typeof input.data !== "object" || input.data === null || Array.isArray(input.data)) {
      return { error: "data must be an object", status: 400 };
    }
    const providerId =
      input.secretProviderId !== undefined
        ? input.secretProviderId
        : existing.secretProviderId;
    const stored = await storeCredentialSecret({
      data: input.data,
      secretProviderId: providerId,
      externalRef:
        input.externalRef !== undefined ? input.externalRef : existing.externalRef,
      credentialId: id,
    });
    update.dataEncrypted = stored.dataEncrypted;
    update.secretProviderId = stored.secretProviderId;
    update.externalRef = stored.externalRef;
  } else if (input.secretProviderId !== undefined || input.externalRef !== undefined) {
    if (input.secretProviderId !== undefined) update.secretProviderId = input.secretProviderId;
    if (input.externalRef !== undefined) update.externalRef = input.externalRef;
  }

  const credential = await prisma.credential.update({
    where: { id },
    data: update,
    select: metaSelect(),
  });

  return toMeta(credential);
}

export async function deleteCredential(
  userId: string,
  id: string,
): Promise<{ success: true } | ServiceError> {
  const existing = await prisma.credential.findUnique({ where: { id } });
  if (!existing) return { error: "Not found", status: 404 };

  const access = await requireResourceAccess(
    "credential",
    id,
    userId,
    "edit",
    existing.projectId,
  );
  if (!access.ok) return { error: "Not found", status: 404 };

  await prisma.credential.delete({ where: { id } });
  return { success: true };
}

export function isServiceError(v: unknown): v is ServiceError {
  return isErr(v);
}
