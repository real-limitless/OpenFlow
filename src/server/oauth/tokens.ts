import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../db";
import { parseScopes, scopesToString } from "./scopes";
import {
  normalizeGrantInputs,
  type GrantInput,
  type WorkflowGrant,
} from "../services/agent-policy";

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}

const ACCESS_TTL_SEC = 60 * 60; // 1h
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30d
const CODE_TTL_SEC = 60 * 10; // 10m

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

function serializeGrants(grants: WorkflowGrant[]): string {
  return JSON.stringify(
    grants.map((g) => ({
      workflowId: g.workflowId,
      canRead: g.canRead,
      canWrite: g.canWrite,
      canExecute: g.canExecute,
      expiresAt: g.expiresAt?.toISOString() ?? null,
    })),
  );
}

function parseStoredGrants(raw: string | null | undefined): WorkflowGrant[] {
  if (!raw?.trim()) return [];
  try {
    const arr = JSON.parse(raw) as GrantInput[];
    if (!Array.isArray(arr)) return [];
    return normalizeGrantInputs(arr);
  } catch {
    return [];
  }
}

export async function createAuthorizationCode(opts: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  codeChallengeMethod?: string;
  resource?: string | null;
  workflowGrants?: WorkflowGrant[];
}): Promise<string> {
  const code = newOpaqueToken("ofc");
  const expiresAt = new Date(Date.now() + CODE_TTL_SEC * 1000);
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: opts.clientId,
      userId: opts.userId,
      redirectUri: opts.redirectUri,
      scopes: scopesToString(opts.scopes),
      codeChallenge: opts.codeChallenge,
      codeChallengeMethod: opts.codeChallengeMethod ?? "S256",
      resource: opts.resource ?? null,
      workflowGrants: serializeGrants(opts.workflowGrants ?? []),
      expiresAt,
    },
  });
  return code;
}

export async function exchangeAuthorizationCode(opts: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number; scopes: string[]; resource: string | null }
  | { ok: false; error: string; status: number }
> {
  const row = await prisma.oAuthAuthorizationCode.findUnique({
    where: { codeHash: hashToken(opts.code) },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "invalid_grant", status: 400 };
  }
  if (row.clientId !== opts.clientId || row.redirectUri !== opts.redirectUri) {
    return { ok: false, error: "invalid_grant", status: 400 };
  }
  if (row.codeChallengeMethod !== "S256") {
    return { ok: false, error: "invalid_grant", status: 400 };
  }
  const challengeOk = (() => {
    const computed = createHash("sha256").update(opts.codeVerifier).digest("base64url");
    return safeEqual(computed, row.codeChallenge);
  })();
  if (!challengeOk) {
    return { ok: false, error: "invalid_grant", status: 400 };
  }

  await prisma.oAuthAuthorizationCode.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  return issueTokens({
    clientId: row.clientId,
    userId: row.userId,
    scopes: parseScopes(row.scopes),
    resource: row.resource,
    workflowGrants: parseStoredGrants(row.workflowGrants),
  });
}

export async function issueTokens(opts: {
  clientId: string;
  userId: string;
  scopes: string[];
  resource?: string | null;
  workflowGrants?: WorkflowGrant[];
}): Promise<{
  ok: true;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
  resource: string | null;
}> {
  const accessToken = newOpaqueToken("ofa");
  const refreshToken = newOpaqueToken("ofr");
  const now = Date.now();
  const grants = opts.workflowGrants ?? [];
  const created = await prisma.oAuthToken.create({
    data: {
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      clientId: opts.clientId,
      userId: opts.userId,
      scopes: scopesToString(opts.scopes),
      resource: opts.resource ?? null,
      accessExpiresAt: new Date(now + ACCESS_TTL_SEC * 1000),
      refreshExpiresAt: new Date(now + REFRESH_TTL_SEC * 1000),
      grants:
        grants.length > 0
          ? {
              create: grants.map((g) => ({
                workflowId: g.workflowId,
                canRead: g.canRead,
                canWrite: g.canWrite,
                canExecute: g.canExecute,
                expiresAt: g.expiresAt,
              })),
            }
          : undefined,
    },
  });
  void created;
  return {
    ok: true,
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TTL_SEC,
    scopes: opts.scopes,
    resource: opts.resource ?? null,
  };
}

export async function refreshAccessToken(opts: {
  refreshToken: string;
  clientId: string;
}): Promise<
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number; scopes: string[]; resource: string | null }
  | { ok: false; error: string; status: number }
> {
  const row = await prisma.oAuthToken.findUnique({
    where: { refreshTokenHash: hashToken(opts.refreshToken) },
    include: { grants: true },
  });
  if (
    !row ||
    row.revokedAt ||
    row.clientId !== opts.clientId ||
    !row.refreshExpiresAt ||
    row.refreshExpiresAt.getTime() < Date.now()
  ) {
    return { ok: false, error: "invalid_grant", status: 400 };
  }

  const workflowGrants = mapGrantRows(row.grants);

  // Rotate: revoke old
  await prisma.oAuthToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date(), refreshTokenHash: null },
  });

  return issueTokens({
    clientId: row.clientId,
    userId: row.userId,
    scopes: parseScopes(row.scopes),
    resource: row.resource,
    workflowGrants,
  });
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

export async function resolveAccessToken(
  rawToken: string,
): Promise<{ userId: string; scopes: string[]; resource: string | null; tokenId: string } | null> {
  if (!rawToken.startsWith("ofa_")) return null;
  const row = await prisma.oAuthToken.findUnique({
    where: { accessTokenHash: hashToken(rawToken) },
  });
  if (!row || row.revokedAt || row.accessExpiresAt.getTime() < Date.now()) {
    return null;
  }
  return {
    userId: row.userId,
    scopes: parseScopes(row.scopes),
    resource: row.resource,
    tokenId: row.id,
  };
}

export function isRedirectUriAllowed(uri: string, registered: string[]): boolean {
  if (!registered.includes(uri)) return false;
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    // Custom schemes for native clients (e.g. cursor://)
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    return false;
  } catch {
    return false;
  }
}

export function validateNewRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    return false;
  } catch {
    return false;
  }
}
