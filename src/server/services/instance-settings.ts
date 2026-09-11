import { prisma } from "../db";
import { config } from "../../config";

export const CODE_PYTHON_ALLOW_IMPORTS_KEY = "code.pythonAllowImports";
export const MCP_ENABLED_KEY = "mcp.enabled";
export const WEBHOOK_AUTH_KEY = "webhook.auth";

export type WebhookAuthSettings = {
  required: boolean | null;
  mode: "header" | "basic" | "signed";
  secret: string;
};

export type CodePythonSettings = {
  /** Extra module roots allowed beyond the built-in safe stdlib list. */
  allowImports: string[];
};

export type McpInstanceSettings = {
  /** null = no DB override (use env/default). */
  enabledOverride: boolean | null;
};

const DEFAULT_CODE_PYTHON: CodePythonSettings = {
  allowImports: [],
};

type CacheEntry = { at: number; value: CodePythonSettings };
let codePythonCache: CacheEntry | null = null;
type McpCacheEntry = { at: number; value: McpInstanceSettings };
let mcpCache: McpCacheEntry | null = null;
type WebhookAuthCacheEntry = { at: number; value: WebhookAuthSettings };
let webhookAuthCache: WebhookAuthCacheEntry | null = null;
const CACHE_TTL_MS = 5_000;

const MODULE_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export function normalizeImportList(input: unknown): string[] {
  const raw: string[] = Array.isArray(input)
    ? input.map((x) => String(x))
    : typeof input === "string"
      ? input.split(/[,\n]+/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw) {
    const m = part.trim();
    if (!m || !MODULE_RE.test(m)) continue;
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

export function invalidateInstanceSettingsCache(): void {
  codePythonCache = null;
  mcpCache = null;
  webhookAuthCache = null;
}

function envMcpKillSwitch(): boolean {
  return (
    process.env.OPENFLOW_MCP_ENABLED === "false" || process.env.OPENFLOW_MCP_ENABLED === "0"
  );
}

export async function getMcpInstanceSettings(): Promise<McpInstanceSettings> {
  const now = Date.now();
  if (mcpCache && now - mcpCache.at < CACHE_TTL_MS) {
    return mcpCache.value;
  }
  try {
    const row = await prisma.instanceSetting.findUnique({
      where: { key: MCP_ENABLED_KEY },
    });
    let enabledOverride: boolean | null = null;
    if (row?.value != null && row.value !== "") {
      try {
        const parsed = JSON.parse(row.value) as unknown;
        if (typeof parsed === "boolean") enabledOverride = parsed;
        else if (parsed === "true" || parsed === 1) enabledOverride = true;
        else if (parsed === "false" || parsed === 0) enabledOverride = false;
      } catch {
        if (row.value === "true") enabledOverride = true;
        else if (row.value === "false") enabledOverride = false;
      }
    }
    const value = { enabledOverride };
    mcpCache = { at: now, value };
    return value;
  } catch {
    return { enabledOverride: null };
  }
}

/**
 * Effective MCP enablement:
 * - OPENFLOW_MCP_ENABLED=false|0 → always off (ops kill-switch)
 * - else DB mcp.enabled if set
 * - else env default (config.mcp.enabled, default on)
 */
export async function isMcpEnabled(): Promise<boolean> {
  if (envMcpKillSwitch()) return false;
  const { enabledOverride } = await getMcpInstanceSettings();
  if (enabledOverride !== null) return enabledOverride;
  return config.mcp.enabled;
}

export async function setMcpEnabled(enabled: boolean): Promise<McpInstanceSettings> {
  await prisma.instanceSetting.upsert({
    where: { key: MCP_ENABLED_KEY },
    create: {
      key: MCP_ENABLED_KEY,
      value: JSON.stringify(enabled),
    },
    update: {
      value: JSON.stringify(enabled),
    },
  });
  const value = { enabledOverride: enabled };
  mcpCache = { at: Date.now(), value };
  return value;
}

export function isEnvMcpDisabled(): boolean {
  return envMcpKillSwitch();
}

export async function getCodePythonSettings(): Promise<CodePythonSettings> {
  const now = Date.now();
  if (codePythonCache && now - codePythonCache.at < CACHE_TTL_MS) {
    return codePythonCache.value;
  }

  try {
    const row = await prisma.instanceSetting.findUnique({
      where: { key: CODE_PYTHON_ALLOW_IMPORTS_KEY },
    });
    let allowImports: string[] = [];
    if (row?.value) {
      try {
        allowImports = normalizeImportList(JSON.parse(row.value));
      } catch {
        allowImports = normalizeImportList(row.value);
      }
    }
    const value = { allowImports };
    codePythonCache = { at: now, value };
    return value;
  } catch {
    // DB unavailable (tests / early boot) — env-only fallback path still works.
    return { ...DEFAULT_CODE_PYTHON };
  }
}

export async function setCodePythonSettings(
  patch: Partial<CodePythonSettings>,
): Promise<CodePythonSettings> {
  const current = await getCodePythonSettings();
  const next: CodePythonSettings = {
    allowImports:
      patch.allowImports !== undefined
        ? normalizeImportList(patch.allowImports)
        : current.allowImports,
  };

  await prisma.instanceSetting.upsert({
    where: { key: CODE_PYTHON_ALLOW_IMPORTS_KEY },
    create: {
      key: CODE_PYTHON_ALLOW_IMPORTS_KEY,
      value: JSON.stringify(next.allowImports),
    },
    update: {
      value: JSON.stringify(next.allowImports),
    },
  });

  invalidateInstanceSettingsCache();
  codePythonCache = { at: Date.now(), value: next };
  return next;
}

/** Merge DB allowlist with OPENFLOW_PYTHON_ALLOW_IMPORTS env (env appends). */
export async function resolvePythonExtraImports(): Promise<string[]> {
  const fromDb = (await getCodePythonSettings()).allowImports;
  const fromEnv = normalizeImportList(process.env.OPENFLOW_PYTHON_ALLOW_IMPORTS ?? "");
  return normalizeImportList([...fromDb, ...fromEnv]);
}

const DEFAULT_WEBHOOK_AUTH: WebhookAuthSettings = {
  required: null,
  mode: "header",
  secret: "",
};

export async function getWebhookAuthSettings(): Promise<WebhookAuthSettings> {
  const now = Date.now();
  if (webhookAuthCache && now - webhookAuthCache.at < CACHE_TTL_MS) {
    return webhookAuthCache.value;
  }
  try {
    const row = await prisma.instanceSetting.findUnique({
      where: { key: WEBHOOK_AUTH_KEY },
    });
    let value: WebhookAuthSettings = { ...DEFAULT_WEBHOOK_AUTH };
    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value) as Partial<WebhookAuthSettings>;
        value = {
          required: typeof parsed.required === "boolean" ? parsed.required : null,
          mode:
            parsed.mode === "basic" || parsed.mode === "signed" || parsed.mode === "header"
              ? parsed.mode
              : "header",
          secret: typeof parsed.secret === "string" ? parsed.secret : "",
        };
      } catch {
        value = { ...DEFAULT_WEBHOOK_AUTH };
      }
    }
    webhookAuthCache = { at: now, value };
    return value;
  } catch {
    return { ...DEFAULT_WEBHOOK_AUTH };
  }
}

export async function setWebhookAuthSettings(
  patch: Partial<WebhookAuthSettings>,
): Promise<WebhookAuthSettings> {
  const current = await getWebhookAuthSettings();
  const next: WebhookAuthSettings = {
    required: patch.required !== undefined ? patch.required : current.required,
    mode: patch.mode ?? current.mode,
    secret: patch.secret !== undefined ? patch.secret : current.secret,
  };
  await prisma.instanceSetting.upsert({
    where: { key: WEBHOOK_AUTH_KEY },
    create: { key: WEBHOOK_AUTH_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  webhookAuthCache = { at: Date.now(), value: next };
  return next;
}

export function resolveWebhookAuthRequired(stored: boolean | null): boolean {
  if (typeof stored === "boolean") return stored;
  if (process.env.OPENFLOW_WEBHOOK_AUTH === "off" || process.env.OPENFLOW_WEBHOOK_AUTH === "0") {
    return false;
  }
  if (process.env.OPENFLOW_WEBHOOK_AUTH === "on" || process.env.OPENFLOW_WEBHOOK_AUTH === "1") {
    return true;
  }
  return !config.auth.disabled;
}
