import { prisma } from "../db";
import { config } from "../../config";
import {
  parseOidcSettings,
  type OidcSettings,
} from "../../lib/auth/oidc";

export const OIDC_SETTINGS_KEY = "auth.oidc";

export async function getOidcSettings(): Promise<OidcSettings> {
  let stored: unknown;
  try {
    const row = await prisma.instanceSetting.findUnique({ where: { key: OIDC_SETTINGS_KEY } });
    stored = row?.value ? JSON.parse(row.value) : null;
  } catch {
    stored = null;
  }
  return parseOidcSettings(stored, process.env);
}

export async function setOidcSettings(patch: Record<string, unknown>): Promise<OidcSettings> {
  const prev = await getOidcSettings();
  const next: OidcSettings = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : prev.enabled,
    issuer:
      typeof patch.issuer === "string" ? patch.issuer.trim().replace(/\/$/, "") : prev.issuer,
    clientId: typeof patch.clientId === "string" ? patch.clientId.trim() : prev.clientId,
    clientSecret:
      typeof patch.clientSecret === "string" &&
      patch.clientSecret &&
      patch.clientSecret !== "********"
        ? patch.clientSecret
        : prev.clientSecret,
    redirectUri: typeof patch.redirectUri === "string" ? patch.redirectUri.trim() : prev.redirectUri,
    jitProvisioning:
      typeof patch.jitProvisioning === "boolean" ? patch.jitProvisioning : prev.jitProvisioning,
  };
  await prisma.instanceSetting.upsert({
    where: { key: OIDC_SETTINGS_KEY },
    create: { key: OIDC_SETTINGS_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return parseOidcSettings(next, process.env);
}

export function oidcFlowSecret(): string {
  return config.credentials.key || "openflow-oidc-dev";
}

export function publicOidcSettings(s: OidcSettings) {
  return {
    enabled: s.enabled,
    issuer: s.issuer,
    clientId: s.clientId,
    clientSecret: s.clientSecret ? "********" : "",
    secretSet: Boolean(s.clientSecret),
    redirectUri: s.redirectUri,
    jitProvisioning: s.jitProvisioning,
    envConfigured: Boolean(process.env.OPENFLOW_OIDC_ISSUER || process.env.OPENFLOW_OIDC_CLIENT_ID),
  };
}
