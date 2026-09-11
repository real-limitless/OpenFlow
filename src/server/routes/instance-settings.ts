import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
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
import { requireInstanceAdmin } from "../services/instance-admin";
import { recordAudit, requestIp } from "../services/audit";

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
    void recordAudit({
      actorId: userId,
      action: "settings.mcp",
      resource: "settings",
      resourceId: "mcp",
      detail: { enabled: body.enabled },
      ip: requestIp(c),
    });
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
    void recordAudit({
      actorId: userId,
      action: "settings.code",
      resource: "settings",
      resourceId: "code",
      detail: { allowImports: python.allowImports },
      ip: requestIp(c),
    });
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
      idempotency: {
        header: "Idempotency-Key",
        alternateHeader: "X-Idempotency-Key",
        windowSec: (await import("../../lib/security/webhook-idempotency")).defaultIdempotencyWindowSec(),
      },
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
    void recordAudit({
      actorId: userId,
      action: "settings.webhooks",
      resource: "settings",
      resourceId: "webhooks",
      detail: { required: stored.required, mode: stored.mode, secret: stored.secret },
      ip: requestIp(c),
    });
    return c.json({
      required: resolveWebhookAuthRequired(stored.required),
      requiredOverride: stored.required,
      mode: stored.mode,
      hasSecret: Boolean(stored.secret || process.env.OPENFLOW_WEBHOOK_SECRET?.trim()),
      envSecretConfigured: Boolean(process.env.OPENFLOW_WEBHOOK_SECRET?.trim()),
      tryOut: config.auth.disabled,
      idempotency: {
        header: "Idempotency-Key",
        alternateHeader: "X-Idempotency-Key",
        windowSec: (await import("../../lib/security/webhook-idempotency")).defaultIdempotencyWindowSec(),
      },
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
      runtime: {
        role: config.worker.role,
        worker: config.worker.enabled,
        scheduler: config.worker.scheduler,
        concurrency: config.worker.concurrency,
        queue: "workflow-execution",
        redis: process.env.REDIS_URL ? "configured" : "default",
        schedulerBackend: (await import("../routes/schedules")).getSchedulerBackend(),
      },
      governance: {
        executionTimeout: "workflow.settings.executionTimeout (seconds)",
        maxConcurrency: "workflow.settings.maxConcurrency",
        cancel: "POST /api/v1/executions/:id/cancel",
      },
      observability: {
        scrapePath: "/metrics",
        otel: config.observability.otelExporterOtlpEndpoint ? "configured" : "unset",
      },
    });
  });

  app.get("/api/v1/settings/retention", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const { getRetentionPolicy } = await import("../services/retention");
    const policy = await getRetentionPolicy();
    return c.json({
      ...policy,
      note: "Backup Postgres before tightening retention. Prune deletes execution rows (runData) and does not touch workflow definitions. Waiting/running executions are kept unless pruneActive is on.",
    });
  });

  app.put("/api/v1/settings/retention", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);
    const body = await c.req.json<Record<string, unknown>>();
    const { setRetentionPolicy } = await import("../services/retention");
    const policy = await setRetentionPolicy(body);
    await recordAudit({
      actorId: userId,
      action: "settings.retention",
      resource: "settings",
      resourceId: "retention",
      detail: policy,
      ip: requestIp(c),
    });
    return c.json(policy);
  });

  app.post("/api/v1/settings/retention/prune", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);
    const { pruneExecutions } = await import("../services/retention");
    const result = await pruneExecutions();
    await recordAudit({
      actorId: userId,
      action: "settings.retention",
      resource: "settings",
      resourceId: "retention.prune",
      detail: result,
      ip: requestIp(c),
    });
    return c.json(result);
  });

  app.get("/api/v1/settings/circuit-breakers", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const { ensureCircuitBreakerConfig } = await import("../services/circuit-breakers");
    const { getCircuitBreakerRegistry } = await import("../../lib/runtime/circuit-breaker");
    const config = await ensureCircuitBreakerConfig();
    return c.json({
      ...config,
      breakers: getCircuitBreakerRegistry().list(),
      note: "HTTP Request trips a breaker on 429/5xx per host and credential id. Open breakers fail fast until cooldown, then one half-open probe.",
    });
  });

  app.put("/api/v1/settings/circuit-breakers", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);
    const body = await c.req.json<Record<string, unknown>>();
    const { setCircuitBreakerConfig } = await import("../services/circuit-breakers");
    const cfg = await setCircuitBreakerConfig(body);
    await recordAudit({
      actorId: userId,
      action: "settings.circuitBreaker",
      resource: "settings",
      resourceId: "circuit-breakers",
      detail: cfg,
      ip: requestIp(c),
    });
    const { getCircuitBreakerRegistry } = await import("../../lib/runtime/circuit-breaker");
    return c.json({ ...cfg, breakers: getCircuitBreakerRegistry().list() });
  });

  app.post("/api/v1/settings/circuit-breakers/reset", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);
    let key: string | undefined;
    try {
      const body = await c.req.json<{ key?: string }>();
      key = typeof body.key === "string" ? body.key : undefined;
    } catch {
      key = undefined;
    }
    const { getCircuitBreakerRegistry } = await import("../../lib/runtime/circuit-breaker");
    getCircuitBreakerRegistry().reset(key);
    await recordAudit({
      actorId: userId,
      action: "settings.circuitBreaker",
      resource: "settings",
      resourceId: key ? `circuit-breakers.reset:${key}` : "circuit-breakers.reset",
      ip: requestIp(c),
    });
    return c.json({ ok: true, breakers: getCircuitBreakerRegistry().list() });
  });

  app.get("/api/v1/settings/lifecycle-webhooks", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const { getLifecycleSubscriptions, recentLifecycleDeliveries } = await import(
      "../services/lifecycle-webhooks"
    );
    const { LIFECYCLE_EVENTS } = await import("../../lib/lifecycle/webhooks");
    const subscriptions = (await getLifecycleSubscriptions()).map((s) => ({
      ...s,
      secret: s.secret ? "********" : "",
      secretSet: Boolean(s.secret),
    }));
    return c.json({
      events: LIFECYCLE_EVENTS,
      subscriptions,
      deliveries: recentLifecycleDeliveries(),
      note: "Outbound POSTs are HMAC-SHA256 signed (X-OpenFlow-Signature over timestamp.body). Replay window is 5 minutes.",
    });
  });

  app.put("/api/v1/settings/lifecycle-webhooks", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);
    const body = await c.req.json<{ subscriptions?: unknown[] }>();
    const { getLifecycleSubscriptions, setLifecycleSubscriptions } = await import(
      "../services/lifecycle-webhooks"
    );
    const prev = await getLifecycleSubscriptions();
    const prevById = new Map(prev.map((s) => [s.id, s]));
    const incoming = Array.isArray(body.subscriptions) ? body.subscriptions : [];
    const merged = incoming.map((row) => {
      const o = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const id = typeof o.id === "string" ? o.id : "";
      const secretRaw = typeof o.secret === "string" ? o.secret : "";
      const keep = secretRaw === "" || secretRaw === "********" ? prevById.get(id)?.secret ?? "" : secretRaw;
      return { ...o, secret: keep };
    });
    const subscriptions = await setLifecycleSubscriptions(merged);
    await recordAudit({
      actorId: userId,
      action: "settings.lifecycleWebhooks",
      resource: "settings",
      resourceId: "lifecycle-webhooks",
      detail: { count: subscriptions.length },
      ip: requestIp(c),
    });
    return c.json({
      subscriptions: subscriptions.map((s) => ({
        ...s,
        secret: s.secret ? "********" : "",
        secretSet: Boolean(s.secret),
      })),
    });
  });

  app.get("/api/v1/settings/plugins", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const { getPluginSettings, catalogPlugins } = await import("../services/plugins");
    const settings = await getPluginSettings();
    return c.json({
      ...settings,
      catalog: catalogPlugins().map((p) => ({
        id: p.id,
        publisher: p.publisher,
        version: p.version,
        displayName: p.displayName,
        types: p.nodes.map((n) => n.type),
        enabled: settings.enabledIds.includes(p.id),
      })),
      note: "Only allowlisted OpenFlow defineNode plugins load. n8n-nodes-* packages are never imported.",
    });
  });

  app.put("/api/v1/settings/plugins", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);
    const body = await c.req.json<Record<string, unknown>>();
    const { setPluginSettings, catalogPlugins } = await import("../services/plugins");
    const settings = await setPluginSettings(body);
    await recordAudit({
      actorId: userId,
      action: "settings.plugins",
      resource: "settings",
      resourceId: "plugins",
      detail: settings,
      ip: requestIp(c),
    });
    return c.json({
      ...settings,
      catalog: catalogPlugins().map((p) => ({
        id: p.id,
        publisher: p.publisher,
        version: p.version,
        displayName: p.displayName,
        types: p.nodes.map((n) => n.type),
        enabled: settings.enabledIds.includes(p.id),
      })),
    });
  });

  app.get("/api/v1/settings/sso", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const { getOidcSettings, publicOidcSettings } = await import("../services/oidc");
    const { publicOidcStatus, defaultRedirectUri } = await import("../../lib/auth/oidc");
    const settings = await getOidcSettings();
    return c.json({
      ...publicOidcSettings(settings),
      loginEnabled: publicOidcStatus(settings).enabled,
      suggestedRedirect: defaultRedirectUri(publicOrigin(c)),
      note: "OIDC authorization-code + PKCE. SAML is not in this release. First SSO user becomes owner if no accounts exist.",
    });
  });

  app.put("/api/v1/settings/sso", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);
    const body = await c.req.json<Record<string, unknown>>();
    const { setOidcSettings, publicOidcSettings } = await import("../services/oidc");
    const { publicOidcStatus } = await import("../../lib/auth/oidc");
    const settings = await setOidcSettings(body);
    await recordAudit({
      actorId: userId,
      action: "settings.sso",
      resource: "settings",
      resourceId: "sso",
      detail: { enabled: settings.enabled, issuer: settings.issuer, jitProvisioning: settings.jitProvisioning },
      ip: requestIp(c),
    });
    return c.json({
      ...publicOidcSettings(settings),
      loginEnabled: publicOidcStatus(settings).enabled,
    });
  });
}
