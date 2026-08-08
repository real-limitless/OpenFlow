/**
 * Shared Ansible runner contract (parity with ansible-flow-mcp).
 * Ad-hoc modules + playbooks. No shell interpolation — argv only.
 */

import { access, constants, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

export const FQCN_RE = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/;

export const MAX_PLAYBOOK_BYTES = 2_000_000;

export const DEFAULT_ALLOWED_COLLECTIONS = [
  "ansible.builtin",
  "community.general",
  "ansible.posix",
  "community.docker",
] as const;

export const DEFAULT_DENIED_MODULES = [
  "ansible.builtin.shell",
  "ansible.builtin.command",
  "ansible.builtin.raw",
  "ansible.builtin.script",
] as const;

export type AnsibleHostResult = {
  host: string;
  ok: boolean;
  changed: boolean;
  failed: boolean;
  unreachable: boolean;
  skipped: boolean;
  msg?: string;
  rc?: number | null;
  result: Record<string, unknown>;
};

export type AnsibleRunResult = {
  kind: "module" | "playbook";
  module?: string;
  playbook?: string;
  checkMode: boolean;
  exitCode: number;
  hosts: AnsibleHostResult[];
  stdout: string;
  stderr: string;
  argv: string[];
  failed: boolean;
};

export type AnsibleRunFn = (
  argv: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
) => Promise<{ code: number; stdout: string; stderr: string }>;

export type AnsibleRunOptions = {
  module: string;
  args?: Record<string, unknown> | null;
  hosts?: string;
  inventory?: string;
  checkMode?: boolean;
  become?: boolean;
  becomeUser?: string;
  connection?: string;
  timeoutSec?: number;
  allowedCollections?: readonly string[];
  deniedModules?: readonly string[];
  /** Extra env (e.g. from auth prep). Never logged. */
  extraEnv?: Record<string, string>;
  /** When true, redact temp paths from returned argv */
  redactArgv?: boolean;
  /** Inject for tests */
  runFn?: AnsibleRunFn;
};

export type AnsiblePlaybookOptions = {
  playbook: string;
  inventory?: string;
  checkMode?: boolean;
  become?: boolean;
  becomeUser?: string;
  connection?: string;
  extraVars?: Record<string, unknown> | null;
  limit?: string;
  tags?: string;
  skipTags?: string;
  timeoutSec?: number;
  extraEnv?: Record<string, string>;
  redactArgv?: boolean;
  /** Optional allowlisted roots (realpath). */
  playbookRoots?: string[];
  runFn?: AnsibleRunFn;
};

export function assertModuleAllowed(
  module: string,
  allowedCollections: readonly string[] = DEFAULT_ALLOWED_COLLECTIONS,
  deniedModules: readonly string[] = DEFAULT_DENIED_MODULES,
): string {
  const fqcn = (module ?? "").trim();
  if (!FQCN_RE.test(fqcn)) {
    throw new Error(`Invalid Ansible module FQCN: ${JSON.stringify(module)}`);
  }
  if (deniedModules.includes(fqcn)) {
    throw new Error(`Module is denied by policy: ${fqcn}`);
  }
  const parts = fqcn.split(".");
  const collection = `${parts[0]}.${parts[1]}`;
  if (allowedCollections.length && !allowedCollections.includes(collection)) {
    throw new Error(
      `Collection ${JSON.stringify(collection)} is not in the allowlist (${allowedCollections.join(", ")})`,
    );
  }
  return fqcn;
}

export function formatModuleArgs(
  args: Record<string, unknown> | null | undefined,
): string | undefined {
  if (args == null) return undefined;
  if (typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Ansible args must be a JSON object");
  }
  if (Object.keys(args).length === 0) return undefined;
  return JSON.stringify(args);
}

export function buildAnsibleArgv(opts: {
  module: string;
  hosts?: string;
  args?: Record<string, unknown> | null;
  inventory?: string;
  checkMode?: boolean;
  become?: boolean;
  becomeUser?: string;
  connection?: string;
}): string[] {
  const hostPattern = (opts.hosts ?? "localhost").trim() || "localhost";
  const inv = (opts.inventory ?? "").trim() || `${hostPattern},`;
  const argv: string[] = ["ansible", hostPattern, "-m", opts.module, "-i", inv];
  const argsStr = formatModuleArgs(opts.args);
  if (argsStr !== undefined) {
    argv.push("-a", argsStr);
  }
  if (opts.checkMode) argv.push("--check");
  if (opts.become) argv.push("--become");
  if (opts.becomeUser?.trim()) {
    argv.push("--become-user", opts.becomeUser.trim());
  }
  const conn = opts.connection?.trim();
  if (conn) {
    argv.push("-c", conn);
  } else if (
    (hostPattern === "localhost" || hostPattern === "127.0.0.1") &&
    !(opts.inventory ?? "").trim()
  ) {
    argv.push("-c", "local");
  }
  return argv;
}

export function buildPlaybookArgv(opts: {
  playbook: string;
  inventory?: string;
  checkMode?: boolean;
  become?: boolean;
  becomeUser?: string;
  connection?: string;
  extraVarsFile?: string;
  limit?: string;
  tags?: string;
  skipTags?: string;
}): string[] {
  const argv: string[] = ["ansible-playbook", opts.playbook];
  const inv = (opts.inventory ?? "").trim();
  if (inv) {
    argv.push("-i", inv);
  } else {
    argv.push("-i", "localhost,");
    if (!opts.connection?.trim()) {
      argv.push("-c", "local");
    }
  }
  if (opts.checkMode) argv.push("--check");
  if (opts.become) argv.push("--become");
  if (opts.becomeUser?.trim()) {
    argv.push("--become-user", opts.becomeUser.trim());
  }
  if (opts.connection?.trim()) {
    argv.push("-c", opts.connection.trim());
  }
  if (opts.extraVarsFile?.trim()) {
    argv.push("-e", `@${opts.extraVarsFile.trim()}`);
  }
  if (opts.limit?.trim()) argv.push("--limit", opts.limit.trim());
  if (opts.tags?.trim()) argv.push("--tags", opts.tags.trim());
  if (opts.skipTags?.trim()) argv.push("--skip-tags", opts.skipTags.trim());
  return argv;
}

const SECRET_KEYS = new Set([
  "password",
  "passwd",
  "login_password",
  "api_key",
  "token",
  "secret",
  "ansible_password",
  "ansible_become_password",
]);

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (SECRET_KEYS.has(lower) || lower.endsWith("password")) {
        out[k] = "********";
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return value;
}

/** Resolve playbook path under allowlisted roots; reject escapes. */
export async function assertPlaybookPath(rawPath: string, roots?: string[]): Promise<string> {
  const input = (rawPath ?? "").trim();
  if (!input) throw new Error("Playbook path is required");
  if (input.includes("\0")) throw new Error("Invalid playbook path");

  const abs = isAbsolute(input) ? resolve(input) : resolve(process.cwd(), input);
  let real: string;
  try {
    real = await realpath(abs);
  } catch {
    throw new Error(`Playbook not found: ${input}`);
  }

  const lower = real.toLowerCase();
  if (!lower.endsWith(".yml") && !lower.endsWith(".yaml")) {
    throw new Error("Playbook must be a .yml or .yaml file");
  }

  const st = await stat(real);
  if (!st.isFile()) throw new Error("Playbook path is not a file");
  if (st.size > MAX_PLAYBOOK_BYTES) {
    throw new Error(`Playbook exceeds max size (${MAX_PLAYBOOK_BYTES} bytes)`);
  }
  await access(real, constants.R_OK);

  const allowed = await resolvePlaybookRoots(roots);
  const ok = allowed.some((root) => real === root || real.startsWith(root + sep));
  if (!ok) {
    throw new Error(
      `Playbook path is outside allowed roots (${allowed.join(", ")}). ` +
        `Set OPENFLOW_ANSIBLE_PLAYBOOK_ROOTS to extend.`,
    );
  }
  return real;
}

export async function resolvePlaybookRoots(explicit?: string[]): Promise<string[]> {
  const fromEnv = (process.env.OPENFLOW_ANSIBLE_PLAYBOOK_ROOTS ?? "")
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = [
    ...(explicit ?? []),
    ...fromEnv,
    process.cwd(),
    resolve(process.cwd(), "playbooks"),
    resolve(process.cwd(), "ansible"),
    "/data/ansible/playbooks",
    "/data/ansible",
    tmpdir(),
  ];
  const out: string[] = [];
  for (const c of candidates) {
    try {
      const r = await realpath(resolve(c));
      if (!out.includes(r)) out.push(r);
    } catch {
      // root may not exist yet
      const r = resolve(c);
      if (!out.includes(r)) out.push(r);
    }
  }
  return out;
}

/** Collapse per-task host rows into one item per host with tasks[]. */
export function aggregateHostResults(rows: AnsibleHostResult[]): AnsibleHostResult[] {
  const map = new Map<string, AnsibleHostResult & { tasks: Array<Record<string, unknown>> }>();
  for (const row of rows) {
    const cur = map.get(row.host);
    const taskEntry = {
      ok: row.ok,
      changed: row.changed,
      failed: row.failed,
      unreachable: row.unreachable,
      skipped: row.skipped,
      msg: row.msg,
      rc: row.rc,
      result: row.result,
    };
    if (!cur) {
      map.set(row.host, {
        ...row,
        result: { tasks: [taskEntry], ...row.result },
        tasks: [taskEntry],
      });
      continue;
    }
    cur.changed = cur.changed || row.changed;
    cur.failed = cur.failed || row.failed;
    cur.unreachable = cur.unreachable || row.unreachable;
    cur.skipped = cur.skipped && row.skipped;
    cur.ok = !cur.failed && !cur.unreachable;
    if (row.msg && !cur.msg) cur.msg = row.msg;
    if (row.rc != null) cur.rc = row.rc;
    cur.tasks.push(taskEntry);
    cur.result = { ...cur.result, tasks: cur.tasks };
  }
  return [...map.values()].map(({ tasks: _t, ...rest }) => rest);
}

export function parseJsonCallback(stdout: string): AnsibleHostResult[] {
  const text = (stdout ?? "").trim();
  if (!text) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return [];
    try {
      data = JSON.parse(text.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  if (!data || typeof data !== "object") return [];
  const plays = (data as { plays?: unknown }).plays;
  if (!Array.isArray(plays)) return [];

  const hosts: AnsibleHostResult[] = [];
  for (const play of plays) {
    if (!play || typeof play !== "object") continue;
    const tasks = (play as { tasks?: unknown }).tasks;
    if (!Array.isArray(tasks)) continue;
    for (const task of tasks) {
      if (!task || typeof task !== "object") continue;
      const hostMap = (task as { hosts?: unknown }).hosts;
      if (!hostMap || typeof hostMap !== "object") continue;
      for (const [host, rawVal] of Object.entries(hostMap as Record<string, unknown>)) {
        const raw =
          rawVal && typeof rawVal === "object" && !Array.isArray(rawVal)
            ? (rawVal as Record<string, unknown>)
            : { msg: String(rawVal) };
        const unreachable = Boolean(raw.unreachable);
        const failed = Boolean(raw.failed) || unreachable;
        const skipped = Boolean(raw.skipped);
        const ok = !failed && !skipped;
        let rc: number | null | undefined = raw.rc as number | undefined;
        if (rc !== undefined && rc !== null) {
          const n = Number(rc);
          rc = Number.isFinite(n) ? n : null;
        } else {
          rc = null;
        }
        hosts.push({
          host,
          ok,
          changed: Boolean(raw.changed),
          failed,
          unreachable,
          skipped,
          msg: raw.msg != null ? String(raw.msg) : undefined,
          rc,
          result: redactSecrets(raw) as Record<string, unknown>,
        });
      }
    }
  }
  return hosts;
}

async function defaultRun(
  argv: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Ansible timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
      if (stdout.length > 2_000_000) stdout = stdout.slice(0, 2_000_000);
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
      if (stderr.length > 500_000) stderr = stderr.slice(0, 500_000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/** ansible-core 2.15+ removed builtin `json` stdout callback; use ansible.posix.json. */
export function ansibleCallbackEnv(): NodeJS.ProcessEnv {
  return {
    ANSIBLE_STDOUT_CALLBACK: process.env.ANSIBLE_STDOUT_CALLBACK || "ansible.posix.json",
    ANSIBLE_LOAD_CALLBACK_PLUGINS: process.env.ANSIBLE_LOAD_CALLBACK_PLUGINS || "1",
    ANSIBLE_RETRY_FILES_ENABLED: "False",
    ANSIBLE_HOST_KEY_CHECKING: process.env.ANSIBLE_HOST_KEY_CHECKING || "False",
    ANSIBLE_DEPRECATION_WARNINGS: "False",
  };
}

function sanitizeArgv(argv: string[]): string[] {
  return argv.map((part) => {
    if (
      part.includes("openflow-ansible-") ||
      part.endsWith("inventory.ini") ||
      part.endsWith("id_key") ||
      part.endsWith("extra-vars.json") ||
      part.startsWith("@/") ||
      part.startsWith("@\\")
    ) {
      return part.startsWith("@") ? "@[redacted-path]" : "[redacted-path]";
    }
    if (/password=/i.test(part) || /private_key/i.test(part)) return "[redacted]";
    return part;
  });
}

export async function runAnsibleModule(opts: AnsibleRunOptions): Promise<AnsibleRunResult> {
  const fqcn = assertModuleAllowed(
    opts.module,
    opts.allowedCollections ?? DEFAULT_ALLOWED_COLLECTIONS,
    opts.deniedModules ?? DEFAULT_DENIED_MODULES,
  );
  const argv = buildAnsibleArgv({
    module: fqcn,
    hosts: opts.hosts,
    args: opts.args,
    inventory: opts.inventory,
    checkMode: opts.checkMode,
    become: opts.become,
    becomeUser: opts.becomeUser,
    connection: opts.connection,
  });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...ansibleCallbackEnv(),
    ...(opts.extraEnv ?? {}),
  };

  let timeoutSec = Number(opts.timeoutSec ?? 120);
  if (!Number.isFinite(timeoutSec)) timeoutSec = 120;
  timeoutSec = Math.max(5, Math.min(3600, timeoutSec));
  const timeoutMs = timeoutSec * 1000;

  const run = opts.runFn ?? defaultRun;
  const { code, stdout, stderr } = await run(argv, env, timeoutMs);
  let hosts = parseJsonCallback(stdout);

  if (!hosts.length && code !== 0) {
    const host = (opts.hosts ?? "localhost").split(",")[0]?.trim() || "localhost";
    hosts = [
      {
        host,
        ok: false,
        changed: false,
        failed: true,
        unreachable: false,
        skipped: false,
        msg: (stderr || stdout || `ansible exited ${code}`).slice(0, 2000),
        rc: code,
        result: {
          stderr: stderr.slice(0, 4000),
          stdout: stdout.slice(0, 4000),
        },
      },
    ];
  }

  const failed = code !== 0 || hosts.some((h) => h.failed || h.unreachable);
  return {
    kind: "module",
    module: fqcn,
    checkMode: Boolean(opts.checkMode),
    exitCode: code,
    hosts,
    stdout,
    stderr,
    argv: opts.redactArgv === false ? argv : sanitizeArgv(argv),
    failed,
  };
}

export async function runAnsiblePlaybook(opts: AnsiblePlaybookOptions): Promise<AnsibleRunResult> {
  const playbookPath = await assertPlaybookPath(opts.playbook, opts.playbookRoots);

  const { mkdtemp, writeFile, rm, chmod } = await import("node:fs/promises");
  const { join } = await import("node:path");
  let varsDir: string | null = null;
  let extraVarsFile: string | undefined;
  const cleanupVars = async () => {
    if (varsDir) await rm(varsDir, { recursive: true, force: true }).catch(() => undefined);
  };

  try {
    if (opts.extraVars && typeof opts.extraVars === "object" && !Array.isArray(opts.extraVars)) {
      if (Object.keys(opts.extraVars).length > 0) {
        varsDir = await mkdtemp(join(tmpdir(), "openflow-ansible-vars-"));
        extraVarsFile = join(varsDir, "extra-vars.json");
        await writeFile(extraVarsFile, JSON.stringify(opts.extraVars), { mode: 0o600 });
        await chmod(extraVarsFile, 0o600);
      }
    }

    const argv = buildPlaybookArgv({
      playbook: playbookPath,
      inventory: opts.inventory,
      checkMode: opts.checkMode,
      become: opts.become,
      becomeUser: opts.becomeUser,
      connection: opts.connection,
      extraVarsFile,
      limit: opts.limit,
      tags: opts.tags,
      skipTags: opts.skipTags,
    });

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...ansibleCallbackEnv(),
      ...(opts.extraEnv ?? {}),
    };

    let timeoutSec = Number(opts.timeoutSec ?? 300);
    if (!Number.isFinite(timeoutSec)) timeoutSec = 300;
    timeoutSec = Math.max(5, Math.min(7200, timeoutSec));
    const timeoutMs = timeoutSec * 1000;

    const run = opts.runFn ?? injectedRunFn ?? defaultRun;
    const { code, stdout, stderr } = await run(argv, env, timeoutMs);
    let hosts = aggregateHostResults(parseJsonCallback(stdout));

    if (!hosts.length && code !== 0) {
      hosts = [
        {
          host: "localhost",
          ok: false,
          changed: false,
          failed: true,
          unreachable: false,
          skipped: false,
          msg: (stderr || stdout || `ansible-playbook exited ${code}`).slice(0, 2000),
          rc: code,
          result: {
            stderr: stderr.slice(0, 4000),
            stdout: stdout.slice(0, 4000),
          },
        },
      ];
    }

    const failed = code !== 0 || hosts.some((h) => h.failed || h.unreachable);
    return {
      kind: "playbook",
      playbook: playbookPath,
      checkMode: Boolean(opts.checkMode),
      exitCode: code,
      hosts,
      stdout,
      stderr,
      argv: opts.redactArgv === false ? argv : sanitizeArgv(argv),
      failed,
    };
  } finally {
    await cleanupVars();
  }
}

/** Test-only: allow injecting runFn via module global (cleared by tests). */
let injectedRunFn: AnsibleRunFn | undefined;

export function __setAnsibleRunFnForTests(fn: AnsibleRunFn | undefined): void {
  injectedRunFn = fn;
}

export async function runAnsibleModuleWithTestHook(
  opts: AnsibleRunOptions,
): Promise<AnsibleRunResult> {
  return runAnsibleModule({
    ...opts,
    runFn: opts.runFn ?? injectedRunFn,
  });
}

export async function runAnsiblePlaybookWithTestHook(
  opts: AnsiblePlaybookOptions,
): Promise<AnsibleRunResult> {
  return runAnsiblePlaybook({
    ...opts,
    runFn: opts.runFn ?? injectedRunFn,
  });
}
