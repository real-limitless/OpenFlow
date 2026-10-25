import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { nodeDepth } from "../../lib/nodes/depth";
import type { IWorkflow } from "../../lib/workflow/types";
import { parseWorkflowJson, unwrapWorkflowPayload } from "../../lib/workflow/schema";
import { ALL_MCP_SCOPES } from "../oauth/scopes";
import { prisma } from "../db";
import { readEnvSecret, type EnvSecret } from "../lib/env-secret";
import { apiKeyPrefix, resolveApiKeyExpiry } from "../lib/api-key-policy";
import { redactLogString } from "../lib/redact-log";
import { log } from "../log";
import { hashOpaqueToken } from "./agent-policy";
import { recordAudit } from "./audit";
import { LOCAL_USER_ID, ensureUser, ensureUserWithProject } from "./users";
import { setWorkflowActive } from "./workflow-activation";
import { deserializeJsonFields, KNOWN_WORKFLOW_FIELDS, serializeJsonFields } from "./workflow-io";
import { snapshotWorkflowVersion } from "./workflow-versions";

const BOOTSTRAP_KEY_NAME = "Bootstrap service key";
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const KEY_PATTERN = /^of_[A-Za-z0-9_-]{16,}$/;

const SCOPE_ALIASES: Record<string, string> = {
  read: "openflow:read",
  write: "openflow:write",
  execute: "openflow:execute",
  credentials: "openflow:credentials",
  variables: "openflow:variables",
};

const CANONICAL_SCOPES = new Map<string, string>();
for (const scope of ALL_MCP_SCOPES) CANONICAL_SCOPES.set(scope, scope);
for (const [alias, scope] of Object.entries(SCOPE_ALIASES)) CANONICAL_SCOPES.set(alias, scope);

const emailSchema = z.string().trim().email().max(320);

export type BootstrapWorkflowReport = {
  file: string;
  status: "created" | "updated" | "unchanged" | "error";
  id?: string;
  name?: string;
  active?: boolean;
  unsupportedNodes: Array<{ name: string; type: string }>;
  error?: string;
};

export type BootstrapReport = {
  owner: {
    status: "created" | "existing" | "skipped";
    userId?: string;
    reason?: string;
  };
  apiKey: {
    status: "created" | "existing" | "refreshed" | "skipped";
    id?: string;
    reason?: string;
  };
  workflows: BootstrapWorkflowReport[];
};

export type BootstrapOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (filePath: string) => string;
};

type OwnerRow = { id: string; email: string; role: string };

function flagOn(env: NodeJS.ProcessEnv, name: string): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "true" || v === "1";
}

function scrub(text: string, secrets: readonly string[]): string {
  let out = text;
  const ordered = [...secrets].filter((s) => s.length >= 4).sort((a, b) => b.length - a.length);
  for (const secret of ordered) out = out.split(secret).join("[redacted]");
  return redactLogString(out);
}

function remember(secrets: string[], value: string | null | undefined): void {
  if (value && value.length >= 4) secrets.push(value);
}

/** `read,write,execute` and `openflow:read` both work. Blank uses read, write, and execute. */
export function parseBootstrapScopes(raw: string | undefined): {
  scopes: string[];
  ignored: number;
} {
  const text = raw?.trim() ? raw.trim() : "read,write,execute";
  const scopes: string[] = [];
  let ignored = 0;
  for (const part of text.split(/[\s,]+/)) {
    const token = part.trim();
    if (!token) continue;
    const mapped = CANONICAL_SCOPES.get(token.toLowerCase()) ?? CANONICAL_SCOPES.get(token);
    if (!mapped) {
      ignored += 1;
      continue;
    }
    if (!scopes.includes(mapped)) scopes.push(mapped);
  }
  return { scopes, ignored };
}

function activateMode(env: NodeJS.ProcessEnv): boolean | null {
  const raw = env.OPENFLOW_IMPORT_ACTIVATE?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return null;
}

function explicitWorkflowId(raw: unknown): string | undefined {
  const unwrapped = unwrapWorkflowPayload(raw);
  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) return undefined;
  const id = (unwrapped as { id?: unknown }).id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return undefined;
}

function unsupportedNodes(workflow: IWorkflow): Array<{ name: string; type: string }> {
  const out: Array<{ name: string; type: string }> = [];
  for (const node of workflow.nodes) {
    if (node.disabled) continue;
    if (nodeDepth(node.type) === "ready") continue;
    out.push({ name: node.name, type: node.type });
  }
  return out;
}

function parseStored(raw: string | null | undefined, fallback: unknown): unknown {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sameGraph(
  existing: { name: string; nodes: string; connections: string; settings: string | null },
  workflow: IWorkflow,
): boolean {
  if (existing.name !== workflow.name) return false;
  return (
    JSON.stringify(parseStored(existing.nodes, [])) === JSON.stringify(workflow.nodes) &&
    JSON.stringify(parseStored(existing.connections, {})) ===
      JSON.stringify(workflow.connections ?? {}) &&
    JSON.stringify(parseStored(existing.settings, {})) === JSON.stringify(workflow.settings ?? {})
  );
}

function storedFields(workflow: IWorkflow, active: boolean): Record<string, unknown> {
  return serializeJsonFields({
    name: workflow.name,
    active,
    versionId: crypto.randomUUID(),
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings ?? {},
    staticData: workflow.staticData ?? null,
    pinData: workflow.pinData ?? null,
    meta: workflow.meta ?? null,
    ...Object.fromEntries(
      Object.entries(workflow as unknown as Record<string, unknown>).filter(
        ([key]) => !KNOWN_WORKFLOW_FIELDS.has(key),
      ),
    ),
  });
}

type WorkflowRow = {
  id: string;
  userId: string;
  name: string;
  active: boolean;
  nodes: string;
  connections: string;
  settings: string | null;
};

async function resolveOwner(
  env: NodeJS.ProcessEnv,
  secrets: string[],
  readFile: (filePath: string) => string,
  report: BootstrapReport,
): Promise<OwnerRow | null> {
  if (env.OPENFLOW_BOOTSTRAP_OWNER_PASSWORD?.trim()) {
    log.warn("bootstrap owner password inline value ignored", {
      component: "bootstrap",
      reason: "use_password_file",
    });
  }

  const emailRaw = env.OPENFLOW_BOOTSTRAP_OWNER_EMAIL?.trim() ?? "";
  const password = readEnvSecret("OPENFLOW_BOOTSTRAP_OWNER_PASSWORD", {
    env,
    readFile,
    fileOnly: true,
  });
  remember(secrets, password.value);

  if (!emailRaw) {
    return attachExistingOwner(env, report, "not_configured");
  }

  const emailParsed = emailSchema.safeParse(emailRaw);
  if (!emailParsed.success) {
    report.owner = { status: "skipped", reason: "invalid_email" };
    log.warn("bootstrap owner skipped", { component: "bootstrap", reason: "invalid_email" });
    return attachExistingOwner(env, report, report.owner.reason);
  }
  const email = emailParsed.data.toLowerCase();

  const found = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (found) {
    report.owner = { status: "existing", userId: found.id };
    log.info("bootstrap owner already present", { component: "bootstrap", userId: found.id });
    return { id: found.id, email: found.email, role: found.role };
  }

  if (flagOn(env, "OPENFLOW_REGISTRATION_DISABLED")) {
    report.owner = { status: "skipped", reason: "registration_disabled" };
    log.warn("bootstrap owner skipped", {
      component: "bootstrap",
      reason: "registration_disabled",
    });
    return attachExistingOwner(env, report, "registration_disabled");
  }

  const passwordProblem = ownerPasswordProblem(password);
  if (passwordProblem) {
    report.owner = { status: "skipped", reason: passwordProblem };
    log.warn("bootstrap owner skipped", { component: "bootstrap", reason: passwordProblem });
    return attachExistingOwner(env, report, passwordProblem);
  }

  const realUsers = await prisma.user.count({
    where: {
      AND: [{ id: { not: LOCAL_USER_ID } }, { passwordHash: { not: "" } }],
    },
  });
  if (realUsers > 0) {
    report.owner = { status: "skipped", reason: "owner_exists" };
    log.info("bootstrap owner skipped", { component: "bootstrap", reason: "owner_exists" });
    return attachExistingOwner(env, report, "owner_exists");
  }

  const passwordHash = await bcrypt.hash(password.value as string, 10);
  const created = await prisma.user.create({
    data: { email, passwordHash, role: "owner" },
  });
  await ensureUserWithProject(created.id);
  report.owner = { status: "created", userId: created.id };
  log.info("bootstrap owner created", { component: "bootstrap", userId: created.id });
  void recordAudit({
    actorId: created.id,
    action: "user.register",
    resource: "user",
    resourceId: created.id,
    detail: { source: "bootstrap", role: "owner" },
    outcome: "success",
  });
  return { id: created.id, email: created.email, role: created.role };
}

function ownerPasswordProblem(password: EnvSecret): string | null {
  if (!password.value) {
    if (password.fileError) return "password_file_unreadable";
    return "missing_password_file";
  }
  if (password.value.length < 8 || password.value.length > 1024) return "password_invalid";
  return null;
}

async function attachExistingOwner(
  env: NodeJS.ProcessEnv,
  report: BootstrapReport,
  reason: string | undefined,
): Promise<OwnerRow | null> {
  const existing = await prisma.user.findFirst({
    where: {
      role: "owner",
      NOT: { id: LOCAL_USER_ID },
      passwordHash: { not: "" },
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    report.owner = {
      status: "existing",
      userId: existing.id,
      ...(reason && reason !== "not_configured" ? { reason } : {}),
    };
    return { id: existing.id, email: existing.email, role: existing.role };
  }

  if (flagOn(env, "AUTH_DISABLED")) {
    await ensureUser(LOCAL_USER_ID);
    report.owner = { status: "existing", userId: LOCAL_USER_ID, reason: "auth_disabled" };
    return { id: LOCAL_USER_ID, email: `${LOCAL_USER_ID}@local`, role: "owner" };
  }

  if (report.owner.status === "created") return null;
  if (!report.owner.reason) {
    report.owner = { status: "skipped", reason: reason ?? "not_configured" };
  }
  return null;
}

async function ensureApiKey(
  env: NodeJS.ProcessEnv,
  secrets: string[],
  readFile: (filePath: string) => string,
  user: OwnerRow | null,
  report: BootstrapReport,
): Promise<void> {
  const read = readEnvSecret("OPENFLOW_BOOTSTRAP_API_KEY", { env, readFile });
  remember(secrets, read.value);
  if (read.bothSet) {
    log.warn("bootstrap api key file overrides inline value", { component: "bootstrap" });
  }
  if (!read.value) {
    if (read.fileError) {
      report.apiKey = { status: "skipped", reason: "key_file_unreadable" };
      log.warn("bootstrap api key skipped", {
        component: "bootstrap",
        reason: "key_file_unreadable",
        fileError: read.fileError,
      });
      return;
    }
    report.apiKey = { status: "skipped", reason: "not_configured" };
    return;
  }
  if (!KEY_PATTERN.test(read.value)) {
    report.apiKey = { status: "skipped", reason: "invalid_key" };
    log.warn("bootstrap api key skipped", { component: "bootstrap", reason: "invalid_key" });
    return;
  }
  if (!user) {
    report.apiKey = { status: "skipped", reason: "no_owner" };
    log.warn("bootstrap api key skipped", { component: "bootstrap", reason: "no_owner" });
    return;
  }

  const { scopes, ignored } = parseBootstrapScopes(env.OPENFLOW_BOOTSTRAP_SCOPES);
  if (ignored > 0) {
    log.warn("bootstrap api key ignored unknown scopes", {
      component: "bootstrap",
      ignored,
    });
  }
  if (scopes.length === 0) {
    report.apiKey = { status: "skipped", reason: "no_scopes" };
    log.warn("bootstrap api key skipped", { component: "bootstrap", reason: "no_scopes" });
    return;
  }

  const keyHash = hashOpaqueToken(read.value);
  const existing = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (existing) {
    if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now()) {
      const expiry = resolveApiKeyExpiry(undefined, new Date(), env);
      if (expiry.ok) {
        await prisma.apiKey.update({
          where: { id: existing.id },
          data: { expiresAt: expiry.expiresAt },
        });
        report.apiKey = { status: "refreshed", id: existing.id };
        log.info("bootstrap api key expiry refreshed", {
          component: "bootstrap",
          id: existing.id,
          prefix: apiKeyPrefix(read.value),
        });
        return;
      }
    }
    report.apiKey = { status: "existing", id: existing.id };
    log.info("bootstrap api key already present", {
      component: "bootstrap",
      id: existing.id,
      prefix: apiKeyPrefix(read.value),
    });
    return;
  }

  const expiry = resolveApiKeyExpiry(undefined, new Date(), env);
  if (!expiry.ok) {
    report.apiKey = { status: "skipped", reason: "expiry_rejected" };
    log.warn("bootstrap api key skipped", { component: "bootstrap", reason: "expiry_rejected" });
    return;
  }

  try {
    const created = await prisma.apiKey.create({
      data: {
        userId: user.id,
        name: BOOTSTRAP_KEY_NAME,
        keyHash,
        scopes: JSON.stringify(scopes),
        restrictWorkflows: false,
        canCreateWorkflows: true,
        expiresAt: expiry.expiresAt,
        ownerEmail: user.email,
        ownerName: "",
      },
    });
    report.apiKey = { status: "created", id: created.id };
    log.info("bootstrap api key created", {
      component: "bootstrap",
      id: created.id,
      prefix: apiKeyPrefix(read.value),
    });
    void recordAudit({
      actorId: user.id,
      actor: apiKeyPrefix(read.value),
      action: "api_key.create",
      resource: "api_key",
      resourceId: created.id,
      detail: {
        name: BOOTSTRAP_KEY_NAME,
        source: "bootstrap",
        scopes,
        canCreateWorkflows: true,
      },
      event: "key_change",
      outcome: "success",
    });
  } catch (err) {
    const again = await prisma.apiKey.findUnique({ where: { keyHash } });
    if (again) {
      report.apiKey = { status: "existing", id: again.id };
      return;
    }
    report.apiKey = { status: "skipped", reason: "create_failed" };
    log.error("bootstrap api key create failed", {
      component: "bootstrap",
      error: scrub(err instanceof Error ? err.message : "create failed", secrets),
    });
  }
}

async function importWorkflows(
  env: NodeJS.ProcessEnv,
  secrets: string[],
  user: OwnerRow | null,
  report: BootstrapReport,
): Promise<void> {
  const dir = env.OPENFLOW_IMPORT_DIR?.trim();
  if (!dir) return;
  if (!user) {
    log.warn("bootstrap workflow import skipped", { component: "bootstrap", reason: "no_owner" });
    return;
  }

  let root = dir;
  try {
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) {
      log.warn("bootstrap workflow import skipped", {
        component: "bootstrap",
        reason: "not_a_directory",
      });
      return;
    }
    root = fs.realpathSync(dir);
  } catch (err) {
    log.warn("bootstrap workflow import skipped", {
      component: "bootstrap",
      reason: "unreadable_dir",
      fileError: err && typeof err === "object" && "code" in err ? String(err.code) : "unreadable",
    });
    return;
  }

  const { projectId } = await ensureUserWithProject(user.id);
  const mode = activateMode(env);
  const names = fs
    .readdirSync(root)
    .filter((name) => name.endsWith(".json") && !name.startsWith("."))
    .sort();

  for (const name of names) {
    report.workflows.push(
      await importOne(root, name, user.id, projectId, mode, secrets).catch((err) => ({
        file: name,
        status: "error" as const,
        unsupportedNodes: [],
        error: scrub(err instanceof Error ? err.message : "import failed", secrets),
      })),
    );
  }
}

async function importOne(
  root: string,
  name: string,
  userId: string,
  projectId: string,
  mode: boolean | null,
  secrets: string[],
): Promise<BootstrapWorkflowReport> {
  const candidate = path.resolve(root, name);
  let full: string;
  try {
    full = fs.realpathSync(candidate);
  } catch {
    return { file: name, status: "error", unsupportedNodes: [], error: "unreadable file" };
  }
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return {
      file: name,
      status: "error",
      unsupportedNodes: [],
      error: "file is outside the import directory",
    };
  }

  const stat = fs.statSync(full);
  if (!stat.isFile()) {
    return { file: name, status: "error", unsupportedNodes: [], error: "not a file" };
  }
  if (stat.size > MAX_IMPORT_BYTES) {
    return { file: name, status: "error", unsupportedNodes: [], error: "file exceeds size limit" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return { file: name, status: "error", unsupportedNodes: [], error: "invalid JSON" };
  }

  const parsed = parseWorkflowJson(raw);
  if (!parsed.ok || !parsed.workflow) {
    return {
      file: name,
      status: "error",
      unsupportedNodes: [],
      error: scrub(parsed.error ?? "invalid workflow", secrets),
    };
  }

  const workflow = parsed.workflow;
  const unsupported = unsupportedNodes(workflow);
  const explicitId = explicitWorkflowId(raw);
  let existing: WorkflowRow | null = null;
  let idTaken = false;
  if (explicitId) {
    const byId = await prisma.workflow.findUnique({ where: { id: explicitId } });
    if (byId && byId.userId !== userId) idTaken = true;
    else existing = byId;
  }
  if (!existing) {
    existing = await prisma.workflow.findFirst({
      where: { userId, name: workflow.name },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!existing && idTaken) {
    return {
      file: name,
      status: "error",
      name: workflow.name,
      unsupportedNodes: unsupported,
      error: "workflow id belongs to another account",
    };
  }

  const desiredActive = mode === null ? (existing?.active ?? false) : mode;
  const unchanged = existing
    ? sameGraph(existing, workflow) && existing.active === desiredActive
    : false;
  let id = existing?.id;
  const status: BootstrapWorkflowReport["status"] = unchanged
    ? "unchanged"
    : existing
      ? "updated"
      : "created";

  if (!unchanged) {
    // Leave inactive until setWorkflowActive registers routes.
    const data = storedFields(workflow, false);
    const row = existing
      ? await prisma.workflow.update({
          where: { id: existing.id },
          data: {
            name: data.name as string,
            active: data.active as boolean,
            versionId: data.versionId as string,
            nodes: data.nodes as string,
            connections: data.connections as string,
            settings: (data.settings as string) ?? null,
            staticData: (data.staticData as string) ?? null,
            pinData: (data.pinData as string) ?? null,
            meta: (data.meta as string) ?? null,
            extra: (data.extra as string) ?? null,
          },
        })
      : await prisma.workflow.create({
          data: {
            ...(explicitId ? { id: explicitId } : {}),
            userId,
            projectId,
            name: data.name as string,
            active: data.active as boolean,
            versionId: data.versionId as string,
            nodes: data.nodes as string,
            connections: data.connections as string,
            settings: (data.settings as string) ?? null,
            staticData: (data.staticData as string) ?? null,
            pinData: (data.pinData as string) ?? null,
            meta: (data.meta as string) ?? null,
            extra: (data.extra as string) ?? null,
          },
        });
    id = row.id;
    const saved = deserializeJsonFields(row as unknown as Record<string, unknown>);
    void snapshotWorkflowVersion({ workflowId: row.id, workflow: saved, createdBy: userId });
  }

  if (!id) {
    return {
      file: name,
      status: "error",
      name: workflow.name,
      unsupportedNodes: unsupported,
      error: "import failed",
    };
  }

  let active = existing?.active ?? false;
  const shouldActivate = desiredActive && (mode === true || !unchanged);
  const shouldDeactivate = !desiredActive && Boolean(existing?.active);
  if (shouldActivate || shouldDeactivate) {
    const activated = await setWorkflowActive(id, desiredActive);
    if (!activated.ok) {
      return {
        file: name,
        status: "error",
        id,
        name: workflow.name,
        unsupportedNodes: unsupported,
        error: scrub(activated.error, secrets),
      };
    }
    active = activated.active;
  } else {
    active = desiredActive;
  }

  if (unsupported.length > 0) {
    log.warn("bootstrap workflow has unsupported nodes", {
      component: "bootstrap",
      file: name,
      id,
      unsupportedNodes: unsupported,
    });
  } else {
    log.info("bootstrap workflow imported", {
      component: "bootstrap",
      file: name,
      id,
      status,
      active,
    });
  }

  return {
    file: name,
    status,
    id,
    name: workflow.name,
    active,
    unsupportedNodes: unsupported,
  };
}

function configured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.OPENFLOW_BOOTSTRAP_API_KEY?.trim() ||
    env.OPENFLOW_BOOTSTRAP_API_KEY_FILE?.trim() ||
    env.OPENFLOW_BOOTSTRAP_OWNER_EMAIL?.trim() ||
    env.OPENFLOW_BOOTSTRAP_OWNER_PASSWORD_FILE?.trim() ||
    env.OPENFLOW_IMPORT_DIR?.trim(),
  );
}

/**
 * Headless boot: optional owner, service API key, and workflow import.
 * Stores only a hash of the API key. Does not change public registration policy.
 */
export async function bootstrapInstance(opts: BootstrapOptions = {}): Promise<BootstrapReport> {
  const env = opts.env ?? process.env;
  const readFile = opts.readFile ?? ((filePath: string) => fs.readFileSync(filePath, "utf8"));
  const report: BootstrapReport = {
    owner: { status: "skipped", reason: "not_configured" },
    apiKey: { status: "skipped", reason: "not_configured" },
    workflows: [],
  };
  const secrets: string[] = [];
  if (!configured(env)) return report;

  try {
    const user = await resolveOwner(env, secrets, readFile, report);
    await ensureApiKey(env, secrets, readFile, user, report);
    await importWorkflows(env, secrets, user, report);
    log.info("instance bootstrap finished", {
      component: "bootstrap",
      owner: report.owner.status,
      apiKey: report.apiKey.status,
      workflows: report.workflows.map((item) => ({
        file: item.file,
        status: item.status,
        id: item.id,
        unsupported: item.unsupportedNodes.length,
      })),
    });
  } catch (err) {
    log.error("instance bootstrap failed", {
      component: "bootstrap",
      error: scrub(err instanceof Error ? err.message : "bootstrap failed", secrets),
    });
  }
  return report;
}
