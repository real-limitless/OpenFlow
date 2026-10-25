import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mem = vi.hoisted(() => ({
  users: [] as MemUser[],
  keys: [] as MemKey[],
  workflows: [] as MemWorkflow[],
  audits: [] as Array<Record<string, unknown>>,
  userCreates: 0,
  keyCreates: 0,
  workflowCreates: 0,
}));

const activation = vi.hoisted(() => ({
  setWorkflowActive: vi.fn(async (id: string, active: boolean) => {
    const row = mem.workflows.find((w) => w.id === id);
    if (!row) return { ok: false as const, status: 404 as const, error: "Workflow not found" };
    row.active = active;
    return { ok: true as const, id, active };
  }),
}));

vi.mock("../db", () => ({
  prisma: {
    user: {
      count: async () => mem.users.filter((u) => u.id !== "local" && u.passwordHash).length,
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return mem.users.find((u) => u.id === where.id) ?? null;
        if (where.email) return mem.users.find((u) => u.email === where.email) ?? null;
        return null;
      },
      findFirst: async ({ where }: { where: UserWhere }) => {
        const email =
          typeof where?.email === "string"
            ? where.email
            : typeof where?.email?.equals === "string"
              ? where.email.equals
              : null;
        if (email) {
          return (
            mem.users.find((u) => String(u.email).toLowerCase() === String(email).toLowerCase()) ??
            null
          );
        }
        if (where?.role === "owner") {
          return (
            mem.users.find((u) => u.role === "owner" && u.id !== "local" && u.passwordHash) ?? null
          );
        }
        return null;
      },
      create: async ({ data }: { data: Omit<MemUser, "id" | "createdAt"> }) => {
        mem.userCreates += 1;
        const row: MemUser = {
          id: `user-${mem.userCreates}`,
          createdAt: new Date(),
          email: data.email,
          role: data.role,
          passwordHash: data.passwordHash,
        };
        mem.users.push(row);
        return row;
      },
    },
    apiKey: {
      findUnique: async ({ where }: { where: { keyHash?: string; id?: string } }) => {
        if (where.keyHash) return mem.keys.find((k) => k.keyHash === where.keyHash) ?? null;
        if (where.id) return mem.keys.find((k) => k.id === where.id) ?? null;
        return null;
      },
      create: async ({ data }: { data: Omit<MemKey, "id" | "grants"> }) => {
        mem.keyCreates += 1;
        const row: MemKey = { id: `key-${mem.keyCreates}`, grants: [], ...data };
        mem.keys.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<MemKey> }) => {
        const row = mem.keys.find((k) => k.id === where.id);
        if (!row) throw new Error("missing key");
        Object.assign(row, data);
        return row;
      },
    },
    workflow: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        mem.workflows.find((w) => w.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { userId?: string; name?: string } }) =>
        mem.workflows.find((w) => w.userId === where.userId && w.name === where.name) ?? null,
      create: async ({ data }: { data: MemWorkflow & { id?: string } }) => {
        mem.workflowCreates += 1;
        const row: MemWorkflow = {
          ...data,
          id: data.id ?? `wf-${mem.workflowCreates}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          active: data.active ?? false,
        };
        mem.workflows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = mem.workflows.find((w) => w.id === where.id);
        if (!row) throw new Error("missing workflow");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        mem.audits.push(data);
        return data;
      },
    },
  },
}));

vi.mock("../services/users", () => ({
  LOCAL_USER_ID: "local",
  ensureUser: vi.fn(async () => undefined),
  ensureUserWithProject: vi.fn(async (userId: string) => ({ userId, projectId: "proj-1" })),
}));

vi.mock("../services/workflow-activation", () => ({
  setWorkflowActive: (id: string, active: boolean) => activation.setWorkflowActive(id, active),
}));

vi.mock("../services/workflow-versions", () => ({
  snapshotWorkflowVersion: vi.fn(async () => undefined),
}));

import { canPublicRegister } from "../../lib/auth/registration-policy";
import { readEnvSecret } from "../lib/env-secret";
import { addLogSink, clearLogSinks, configureLogger, getRecentLogs, type LogRecord } from "../log";
import { bootstrapInstance, parseBootstrapScopes } from "../services/instance-bootstrap";

interface MemUser {
  id: string;
  email: string;
  role: string;
  passwordHash?: string;
  createdAt: Date;
}

interface MemKey {
  id: string;
  userId?: string;
  keyHash?: string;
  scopes?: string;
  canCreateWorkflows?: boolean;
  restrictWorkflows?: boolean;
  expiresAt?: Date;
  grants?: unknown[];
}

interface MemWorkflow {
  id: string;
  userId?: string;
  name?: string;
  active: boolean;
  nodes?: string;
  connections?: string;
  settings?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserWhere {
  id?: string;
  email?: string | { equals?: string };
  role?: string;
}

const KEY = "of_bootstrapServiceKey123456789";
const OTHER_KEY = "of_inlineKeyShouldLose999999";
const PASSWORD = "owner-password-1";
const INLINE_PASSWORD = "inline-password-should-not-apply";
const MARKER = "SHOULD_NOT_BE_LOGGED_991";

const WORKFLOW = {
  id: "wf-boot-1",
  name: "Boot import",
  active: true,
  nodes: [
    {
      id: "n1",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 1,
      position: [0, 0],
      parameters: { path: "boot-hook", httpMethod: "POST", note: MARKER },
    },
    {
      id: "n2",
      name: "Missing",
      type: "n8n-nodes-base.notARealNode",
      typeVersion: 1,
      position: [200, 0],
      parameters: {},
    },
    {
      id: "n3",
      name: "Disabled stub",
      type: "n8n-nodes-base.alsoMissing",
      typeVersion: 1,
      position: [400, 0],
      parameters: {},
      disabled: true,
    },
  ],
  connections: {},
};

const dirs: string[] = [];
const envSnapshot = {
  OPENFLOW_OPEN_REGISTER: process.env.OPENFLOW_OPEN_REGISTER,
  OPENFLOW_ALLOW_FIRST_OWNER: process.env.OPENFLOW_ALLOW_FIRST_OWNER,
  OPENFLOW_REGISTRATION_DISABLED: process.env.OPENFLOW_REGISTRATION_DISABLED,
  OPENFLOW_INVITE_ONLY: process.env.OPENFLOW_INVITE_ONLY,
};

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openflow-bootstrap-"));
  dirs.push(dir);
  return dir;
}

function writeFile(dir: string, name: string, contents: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function resetMem(): void {
  mem.users.length = 0;
  mem.keys.length = 0;
  mem.workflows.length = 0;
  mem.audits.length = 0;
  mem.userCreates = 0;
  mem.keyCreates = 0;
  mem.workflowCreates = 0;
  activation.setWorkflowActive.mockClear();
}

function captureLogs() {
  const records: LogRecord[] = [];
  const lines: string[] = [];
  addLogSink((record) => {
    records.push(record);
  });
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const push = (...args: unknown[]) => {
    lines.push(args.map((part) => String(part)).join(" "));
  };
  console.log = push;
  console.warn = push;
  console.error = push;
  return {
    records,
    text() {
      return [JSON.stringify(records), lines.join("\n"), JSON.stringify(getRecentLogs(200))].join(
        "\n",
      );
    },
    stop() {
      console.log = orig.log;
      console.warn = orig.warn;
      console.error = orig.error;
    },
  };
}

function assertSecretsAbsent(text: string, secrets: string[]): void {
  for (const secret of secrets) {
    expect(text).not.toContain(secret);
  }
}

describe("readEnvSecret", () => {
  it("prefers NAME_FILE, trims it, and does not fall back when the file is missing", () => {
    const dir = tempDir();
    const file = writeFile(dir, "key", `${KEY}\n`);
    const fromFile = readEnvSecret("OPENFLOW_BOOTSTRAP_API_KEY", {
      env: { OPENFLOW_BOOTSTRAP_API_KEY: OTHER_KEY, OPENFLOW_BOOTSTRAP_API_KEY_FILE: file },
    });
    expect(fromFile).toMatchObject({ value: KEY, source: "file", bothSet: true });

    const missing = readEnvSecret("OPENFLOW_BOOTSTRAP_API_KEY", {
      env: {
        OPENFLOW_BOOTSTRAP_API_KEY: OTHER_KEY,
        OPENFLOW_BOOTSTRAP_API_KEY_FILE: path.join(dir, "missing"),
      },
    });
    expect(missing.value).toBeNull();
    expect(missing.fileError).toBe("ENOENT");
    expect(missing.value).not.toBe(OTHER_KEY);
  });

  it("reads the inline value only when no file is configured", () => {
    expect(
      readEnvSecret("OPENFLOW_BOOTSTRAP_API_KEY", {
        env: { OPENFLOW_BOOTSTRAP_API_KEY: KEY },
      }),
    ).toEqual({ value: KEY, source: "env" });
  });

  it("does not accept an inline password when fileOnly is set", () => {
    const read = readEnvSecret("OPENFLOW_BOOTSTRAP_OWNER_PASSWORD", {
      env: { OPENFLOW_BOOTSTRAP_OWNER_PASSWORD: INLINE_PASSWORD },
      fileOnly: true,
    });
    expect(read.value).toBeNull();
    expect(read.ignoredInline).toBe(true);
  });
});

describe("parseBootstrapScopes", () => {
  it("maps short names and defaults to read, write, and execute", () => {
    expect(parseBootstrapScopes(undefined).scopes).toEqual([
      "openflow:read",
      "openflow:write",
      "openflow:execute",
    ]);
    expect(parseBootstrapScopes("read, execute").scopes).toEqual([
      "openflow:read",
      "openflow:execute",
    ]);
    expect(parseBootstrapScopes("openflow:credentials").scopes).toEqual(["openflow:credentials"]);
    expect(parseBootstrapScopes("nope").scopes).toEqual([]);
    expect(parseBootstrapScopes("nope").ignored).toBe(1);
  });
});

describe("bootstrapInstance", () => {
  let logs: ReturnType<typeof captureLogs>;

  beforeEach(() => {
    resetMem();
    clearLogSinks();
    configureLogger({ level: "debug", format: "json" });
    logs = captureLogs();
    process.env.OPENFLOW_OPEN_REGISTER = "false";
    delete process.env.OPENFLOW_ALLOW_FIRST_OWNER;
    delete process.env.OPENFLOW_REGISTRATION_DISABLED;
    delete process.env.OPENFLOW_INVITE_ONLY;
  });

  afterEach(() => {
    logs.stop();
    clearLogSinks();
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function baseEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
      OPENFLOW_OPEN_REGISTER: "false",
      OPENFLOW_BOOTSTRAP_OWNER_EMAIL: "owner@example.com",
      OPENFLOW_BOOTSTRAP_SCOPES: "read,write,execute",
      OPENFLOW_IMPORT_ACTIVATE: "true",
      ...extra,
    };
  }

  function seedImportDir(): string {
    const dir = tempDir();
    writeFile(dir, "boot.json", JSON.stringify(WORKFLOW));
    writeFile(dir, "bad.json", "{");
    writeFile(dir, "readme.txt", KEY);
    return dir;
  }

  it("creates an owner, service key, and active workflow while public registration stays closed", async () => {
    const dir = tempDir();
    const importDir = seedImportDir();
    const passwordFile = writeFile(dir, "password", `${PASSWORD}\n`);
    const keyFile = writeFile(dir, "api-key", `${KEY}\n`);

    const report = await bootstrapInstance({
      env: baseEnv({
        OPENFLOW_BOOTSTRAP_OWNER_PASSWORD_FILE: passwordFile,
        OPENFLOW_BOOTSTRAP_API_KEY_FILE: keyFile,
        OPENFLOW_BOOTSTRAP_API_KEY: OTHER_KEY,
        OPENFLOW_IMPORT_DIR: importDir,
      }),
    });

    expect(report.owner.status).toBe("created");
    expect(report.apiKey.status).toBe("created");
    expect(mem.userCreates).toBe(1);
    expect(mem.users[0].role).toBe("owner");
    expect(mem.users[0].email).toBe("owner@example.com");
    expect(mem.users[0].passwordHash).not.toBe(PASSWORD);
    expect(mem.keyCreates).toBe(1);
    expect(mem.keys[0].keyHash).toBe(createHash("sha256").update(KEY).digest("hex"));
    expect(mem.keys[0].keyHash).not.toBe(createHash("sha256").update(OTHER_KEY).digest("hex"));
    expect(mem.keys[0].canCreateWorkflows).toBe(true);
    expect(mem.keys[0].restrictWorkflows).toBe(false);
    expect(JSON.parse(mem.keys[0].scopes ?? "[]")).toEqual([
      "openflow:read",
      "openflow:write",
      "openflow:execute",
    ]);
    expect(JSON.stringify(mem.keys[0])).not.toContain(KEY);
    expect(mem.workflowCreates).toBe(1);
    expect(mem.workflows[0].id).toBe("wf-boot-1");
    expect(mem.workflows[0].active).toBe(true);
    expect(activation.setWorkflowActive).toHaveBeenCalledWith("wf-boot-1", true);

    const imported = report.workflows.find((item) => item.file === "boot.json");
    expect(imported?.status).toBe("created");
    expect(imported?.active).toBe(true);
    expect(imported?.unsupportedNodes).toEqual([
      expect.objectContaining({ name: "Missing", type: expect.stringContaining("notARealNode") }),
    ]);
    expect(report.workflows.find((item) => item.file === "bad.json")?.status).toBe("error");
    expect(report.workflows.some((item) => item.file === "readme.txt")).toBe(false);

    expect(canPublicRegister(false)).toBe(false);
    expect(canPublicRegister(true)).toBe(false);

    const leaked = [KEY, OTHER_KEY, PASSWORD, INLINE_PASSWORD, MARKER];
    assertSecretsAbsent(JSON.stringify(report), leaked);
    assertSecretsAbsent(logs.text(), leaked);
    assertSecretsAbsent(JSON.stringify(mem.audits), [KEY, OTHER_KEY, PASSWORD, INLINE_PASSWORD]);
    assertSecretsAbsent(JSON.stringify(mem.users), [PASSWORD, INLINE_PASSWORD, KEY]);
  });

  it("is idempotent when the owner, key hash, and workflow already exist", async () => {
    const dir = tempDir();
    const importDir = seedImportDir();
    const passwordFile = writeFile(dir, "password", PASSWORD);
    const env = baseEnv({
      OPENFLOW_BOOTSTRAP_API_KEY: KEY,
      OPENFLOW_BOOTSTRAP_OWNER_PASSWORD_FILE: passwordFile,
      OPENFLOW_IMPORT_DIR: importDir,
    });

    const first = await bootstrapInstance({ env });
    expect(first.owner.status).toBe("created");
    expect(first.apiKey.status).toBe("created");
    expect(first.workflows.find((item) => item.file === "boot.json")?.status).toBe("created");

    activation.setWorkflowActive.mockClear();
    const second = await bootstrapInstance({ env });
    expect(second.owner.status).toBe("existing");
    expect(second.apiKey.status).toBe("existing");
    expect(second.apiKey.id).toBe(first.apiKey.id);
    expect(second.workflows.find((item) => item.file === "boot.json")?.status).toBe("unchanged");
    expect(mem.userCreates).toBe(1);
    expect(mem.keyCreates).toBe(1);
    expect(mem.workflowCreates).toBe(1);
    expect(activation.setWorkflowActive).toHaveBeenCalledWith("wf-boot-1", true);
    assertSecretsAbsent(logs.text(), [KEY, PASSWORD, MARKER]);
    assertSecretsAbsent(JSON.stringify(second), [KEY, PASSWORD, MARKER]);
  });

  it("refreshes an expired matching key without storing or logging the secret", async () => {
    const dir = tempDir();
    const passwordFile = writeFile(dir, "password", PASSWORD);
    const env = baseEnv({
      OPENFLOW_BOOTSTRAP_API_KEY: KEY,
      OPENFLOW_BOOTSTRAP_OWNER_PASSWORD_FILE: passwordFile,
    });
    await bootstrapInstance({ env });
    mem.keys[0].expiresAt = new Date(Date.now() - 60_000);

    const again = await bootstrapInstance({ env });
    expect(again.apiKey.status).toBe("refreshed");
    expect(mem.keyCreates).toBe(1);
    expect(mem.keys[0].expiresAt?.getTime() ?? 0).toBeGreaterThan(Date.now());
    expect(JSON.stringify(mem.keys[0])).not.toContain(KEY);
    assertSecretsAbsent(logs.text(), [KEY, PASSWORD]);
    assertSecretsAbsent(JSON.stringify(again), [KEY, PASSWORD]);
  });

  it("does not create an owner when registration is disabled", async () => {
    const dir = tempDir();
    const passwordFile = writeFile(dir, "password", PASSWORD);
    process.env.OPENFLOW_REGISTRATION_DISABLED = "true";
    const report = await bootstrapInstance({
      env: baseEnv({
        OPENFLOW_REGISTRATION_DISABLED: "true",
        OPENFLOW_BOOTSTRAP_OWNER_PASSWORD_FILE: passwordFile,
        OPENFLOW_BOOTSTRAP_API_KEY: KEY,
      }),
    });
    expect(report.owner).toMatchObject({ status: "skipped", reason: "registration_disabled" });
    expect(report.apiKey.reason).toBe("no_owner");
    expect(mem.userCreates).toBe(0);
    expect(mem.keyCreates).toBe(0);
    expect(canPublicRegister(false)).toBe(false);
    assertSecretsAbsent(logs.text(), [KEY, PASSWORD]);
  });

  it("does not create a second owner when one already exists", async () => {
    mem.users.push({
      id: "owner-1",
      email: "already@example.com",
      role: "owner",
      passwordHash: "stored-hash",
      createdAt: new Date(),
    });
    const dir = tempDir();
    const passwordFile = writeFile(dir, "password", PASSWORD);
    const report = await bootstrapInstance({
      env: baseEnv({
        OPENFLOW_BOOTSTRAP_OWNER_EMAIL: "other@example.com",
        OPENFLOW_BOOTSTRAP_OWNER_PASSWORD_FILE: passwordFile,
        OPENFLOW_BOOTSTRAP_API_KEY: KEY,
      }),
    });
    expect(mem.userCreates).toBe(0);
    expect(report.owner).toMatchObject({
      status: "existing",
      userId: "owner-1",
      reason: "owner_exists",
    });
    expect(mem.keys[0].userId).toBe("owner-1");
    expect(JSON.stringify(mem.keys[0])).not.toContain(KEY);
    assertSecretsAbsent(logs.text(), [KEY, PASSWORD]);
  });

  it("ignores an inline owner password and an invalid api key", async () => {
    const report = await bootstrapInstance({
      env: baseEnv({
        OPENFLOW_BOOTSTRAP_OWNER_PASSWORD: INLINE_PASSWORD,
        OPENFLOW_BOOTSTRAP_API_KEY: "not-a-service-key",
      }),
    });
    expect(report.owner.reason).toBe("missing_password_file");
    expect(report.apiKey.reason).toBe("invalid_key");
    expect(mem.userCreates).toBe(0);
    expect(mem.keyCreates).toBe(0);
    assertSecretsAbsent(logs.text(), [INLINE_PASSWORD, "not-a-service-key"]);
    assertSecretsAbsent(JSON.stringify(report), [INLINE_PASSWORD, "not-a-service-key"]);
  });

  it("upserts a workflow by name when the file has no id", async () => {
    const dir = tempDir();
    const importDir = tempDir();
    const passwordFile = writeFile(dir, "password", PASSWORD);
    writeFile(
      importDir,
      "named.json",
      JSON.stringify({
        name: "Named flow",
        nodes: [
          {
            id: "n1",
            name: "Manual",
            type: "n8n-nodes-base.manualTrigger",
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
          },
        ],
        connections: {},
      }),
    );
    const env = baseEnv({
      OPENFLOW_BOOTSTRAP_OWNER_PASSWORD_FILE: passwordFile,
      OPENFLOW_BOOTSTRAP_API_KEY: KEY,
      OPENFLOW_IMPORT_DIR: importDir,
      OPENFLOW_IMPORT_ACTIVATE: "false",
    });
    const first = await bootstrapInstance({ env });
    const second = await bootstrapInstance({ env });
    expect(first.workflows[0].status).toBe("created");
    expect(second.workflows[0].status).toBe("unchanged");
    expect(mem.workflowCreates).toBe(1);
    expect(mem.workflows[0].active).toBe(false);
    expect(activation.setWorkflowActive).not.toHaveBeenCalled();
    assertSecretsAbsent(JSON.stringify(second), [KEY, PASSWORD]);
  });
});
