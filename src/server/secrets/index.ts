import { decrypt, encrypt } from "../crypto";
import { prisma } from "../db";
import { createLocalBackend } from "./local";
import { createVaultBackend } from "./vault";
import { createAwsSmBackend } from "./aws-sm";
import type {
  AwsSmConfig,
  SecretBackend,
  SecretBackendType,
  SecretPayload,
  VaultConfig,
} from "./types";

export type { SecretBackend, SecretBackendType, SecretPayload } from "./types";

const backendCache = new Map<string, SecretBackend>();

/** Test hook: inject a backend for a provider id. */
export function setBackendForTests(providerId: string, backend: SecretBackend | null) {
  if (backend) backendCache.set(providerId, backend);
  else backendCache.delete(providerId);
}

export function clearBackendCache() {
  backendCache.clear();
}

export function parseProviderConfig(
  type: string,
  configEncrypted: string,
): Record<string, unknown> {
  if (!configEncrypted) return {};
  try {
    return JSON.parse(decrypt(configEncrypted)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function encryptProviderConfig(config: Record<string, unknown>): string {
  return encrypt(JSON.stringify(config));
}

export function buildBackend(
  type: SecretBackendType | string,
  config: Record<string, unknown>,
): SecretBackend {
  switch (type) {
    case "vault":
      return createVaultBackend(config as VaultConfig);
    case "aws-sm":
      return createAwsSmBackend(config as AwsSmConfig);
    case "local":
    default:
      return createLocalBackend();
  }
}

export async function getBackendForProvider(providerId: string | null | undefined): Promise<{
  backend: SecretBackend;
  providerId: string | null;
}> {
  if (!providerId) {
    return { backend: createLocalBackend(), providerId: null };
  }
  const cached = backendCache.get(providerId);
  if (cached) return { backend: cached, providerId };

  const row = await prisma.secretProvider.findUnique({ where: { id: providerId } });
  if (!row) {
    return { backend: createLocalBackend(), providerId: null };
  }
  const config = parseProviderConfig(row.type, row.configEncrypted);
  const backend = buildBackend(row.type, config);
  backendCache.set(providerId, backend);
  return { backend, providerId: row.id };
}

export async function getDefaultSecretProvider(): Promise<{
  id: string;
  type: string;
} | null> {
  const envType = process.env.SECRETS_BACKEND?.trim();
  if (envType && envType !== "local") {
    const byType = await prisma.secretProvider.findFirst({
      where: { type: envType, isDefault: true },
      select: { id: true, type: true },
    });
    if (byType) return byType;
    const any = await prisma.secretProvider.findFirst({
      where: { type: envType },
      select: { id: true, type: true },
    });
    if (any) return any;
  }
  const def = await prisma.secretProvider.findFirst({
    where: { isDefault: true },
    select: { id: true, type: true },
  });
  return def;
}

/**
 * Load credential secret data from local ciphertext and/or external backend.
 */
export async function loadCredentialSecret(credential: {
  dataEncrypted: string;
  secretProviderId?: string | null;
  externalRef?: string | null;
}): Promise<SecretPayload | null> {
  if (credential.secretProviderId && credential.externalRef) {
    const { backend } = await getBackendForProvider(credential.secretProviderId);
    if (backend.type !== "local") {
      const external = await backend.get(credential.externalRef);
      if (external) return external;
    }
  }
  if (credential.dataEncrypted) {
    try {
      return JSON.parse(decrypt(credential.dataEncrypted)) as SecretPayload;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Persist credential secret: local encrypt and/or external write.
 */
export async function storeCredentialSecret(options: {
  data: SecretPayload;
  secretProviderId?: string | null;
  externalRef?: string | null;
  credentialId?: string;
}): Promise<{ dataEncrypted: string; secretProviderId: string | null; externalRef: string | null }> {
  const providerId = options.secretProviderId ?? null;
  if (!providerId) {
    return {
      dataEncrypted: encrypt(JSON.stringify(options.data)),
      secretProviderId: null,
      externalRef: null,
    };
  }

  const { backend } = await getBackendForProvider(providerId);
  if (backend.type === "local") {
    return {
      dataEncrypted: encrypt(JSON.stringify(options.data)),
      secretProviderId: providerId,
      externalRef: null,
    };
  }

  const ref =
    options.externalRef?.trim() ||
    `openflow/credentials/${options.credentialId ?? crypto.randomUUID()}`;
  const storedRef = await backend.set(ref, options.data);
  return {
    dataEncrypted: "",
    secretProviderId: providerId,
    externalRef: storedRef,
  };
}
