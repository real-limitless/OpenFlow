import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
import { prisma } from "../db";
import { config } from "../../config";
import {
  getCodePythonSettings,
  setCodePythonSettings,
  normalizeImportList,
  getMcpInstanceSettings,
  isMcpEnabled,
  isEnvMcpDisabled,
  setMcpEnabled,
  getWebhookAuthSettings,
  setWebhookAuthSettings,
  resolveWebhookAuthRequired,
} from "../services/instance-settings";
import { ALL_MCP_SCOPES } from "../oauth/scopes";
import { mcpResourceUrl, publicOrigin } from "../oauth/public-url";
import { OPENFLOW_MCP_TOOLS } from "../mcp/tools";

/** Built-in allowlist roots (mirrors code-python-native bootstrap; display only). */
const BUILTIN_PYTHON_IMPORT_ROOTS = [
  "json",
  "re",
  "math",
  "cmath",
  "datetime",
  "collections",
  "itertools",
  "functools",
  "operator",
  "string",
  "decimal",
  "fractions",
  "statistics",
  "copy",
  "hashlib",
  "hmac",
  "base64",
  "html",
  "xml",
  "csv",
  "io",
  "textwrap",
  "typing",
  "dataclasses",
  "uuid",
  "random",
  "time",
  "calendar",
  "enum",
  "numbers",
  "abc",
  "contextlib",
  "heapq",
  "bisect",
  "array",
  "struct",
  "binascii",
  "codecs",
  "unicodedata",
  "zoneinfo",
  "ipaddress",
  "pprint",
  "types",
  "keyword",
  "difflib",
  "fnmatch",
  "urllib.parse",
] as const;

async function requireInstanceAdmin(userId: string): Promise<true | { error: string; status: 403 }> {
  if (userId === "local" || config.auth.disabled) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "owner" || user?.role === "admin") return true;
  return { error: "Only instance admins can change this setting", status: 403 };
}

async function mcpSettingsPayload(c: {
  req: { url: string; header: (n: string) => string | undefined };
  get: (key: keyof AppEnv["Variables"]) => AppEnv["Variables"][keyof AppEnv["Variables"]];
}) {
  const origin = publicOrigin(c);
  const enabled = await isMcpEnabled();
  const { enabledOverride } = await getMcpInstanceSettings();
  const userId = String(c.get("userId") ?? "");
  const admin = await requireInstanceAdmin(userId);
  return {
    enabled,
    enabledOverride,
    envDisabled: isEnvMcpDisabled(),
    canManage: admin === true,
    authDisabled: config.auth.disabled,
    publicUrl: origin,
    mcpUrl: mcpResourceUrl(origin),
    oauthMetadataUrl: `${origin}/.well-known/oauth-authorization-server`,
    oauthResourceUrl: `${origin}/.well-known/oauth-protected-resource`,
    scopes: [...ALL_MCP_SCOPES],
    tools: OPENFLOW_MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
  };
}

export default function instanceSettingsRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/settings/mcp", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    return c.json(await mcpSettingsPayload(c));
  });

  app.put("/api/v1/settings/mcp", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);

    if (isEnvMcpDisabled()) {
      return c.json(
        {
          error:
            "MCP is forced off by OPENFLOW_MCP_ENABLED=false. Remove that env var to manage from the UI.",
        },
        400,
      );
    }

    const body = await c.req.json<{ enabled?: unknown }>().catch(() => ({} as { enabled?: unknown }));
    if (typeof body.enabled !== "boolean") {
      return c.json({ error: "enabled (boolean) is required" }, 400);
    }
    await setMcpEnabled(body.enabled);
    return c.json(await mcpSettingsPayload(c));
  });

  app.get("/api/v1/settings/code", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const python = await getCodePythonSettings();
    return c.json({
      python: {
        allowImports: python.allowImports,
        builtinAllowImports: [...BUILTIN_PYTHON_IMPORT_ROOTS],
        envAllowImports: normalizeImportList(process.env.OPENFLOW_PYTHON_ALLOW_IMPORTS ?? ""),
      },
    });
  });

  app.put("/api/v1/settings/code", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);

    const body = await c.req.json<{
      python?: { allowImports?: unknown };
    }>();

    const allowImports = body?.python?.allowImports;
    if (allowImports === undefined) {
      return c.json({ error: "python.allowImports is required" }, 400);
    }

    const python = await setCodePythonSettings({ allowImports });
    return c.json({
      python: {
        allowImports: python.allowImports,
        builtinAllowImports: [...BUILTIN_PYTHON_IMPORT_ROOTS],
        envAllowImports: normalizeImportList(process.env.OPENFLOW_PYTHON_ALLOW_IMPORTS ?? ""),
      },
    });
  });

  app.get("/api/v1/settings/webhooks", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const stored = await getWebhookAuthSettings();
    const required = resolveWebhookAuthRequired(stored.required);
    return c.json({
      required,
      requiredOverride: stored.required,
      mode: stored.mode,
      hasSecret: Boolean(stored.secret || process.env.OPENFLOW_WEBHOOK_SECRET?.trim()),
      envSecretConfigured: Boolean(process.env.OPENFLOW_WEBHOOK_SECRET?.trim()),
      tryOut: config.auth.disabled,
    });
  });

  app.put("/api/v1/settings/webhooks", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);
    const body = await c.req
      .json<{ required?: boolean | null; mode?: string; secret?: string }>()
      .catch(() => ({}));
    const stored = await setWebhookAuthSettings({
      required: body.required === undefined ? undefined : body.required,
      mode:
        body.mode === "header" || body.mode === "basic" || body.mode === "signed"
          ? body.mode
          : undefined,
      secret: typeof body.secret === "string" ? body.secret : undefined,
    });
    return c.json({
      required: resolveWebhookAuthRequired(stored.required),
      requiredOverride: stored.required,
      mode: stored.mode,
      hasSecret: Boolean(stored.secret || process.env.OPENFLOW_WEBHOOK_SECRET?.trim()),
      envSecretConfigured: Boolean(process.env.OPENFLOW_WEBHOOK_SECRET?.trim()),
      tryOut: config.auth.disabled,
    });
  });

  app.get("/api/v1/settings/security", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const { RATE_LIMITS } = await import("../../lib/security/rate-limit");
    const { corsAllowlistForSettings } = await import("../middleware/security-headers");
    return c.json({
      rateLimits: Object.fromEntries(
        Object.entries(RATE_LIMITS).map(([k, v]) => [
          k,
          { limit: v.limit, windowSec: Math.round(v.windowMs / 1000) },
        ]),
      ),
      cors: corsAllowlistForSettings(),
      csrf: {
        cookie: "csrf",
        header: "X-CSRF-Token",
        required: !config.auth.disabled,
        note: "Cookie-session POST/PUT/PATCH/DELETE require a matching CSRF token. API keys and try-out mode skip this check. Public forms keep their own _csrf field.",
      },
    });
  });
}
