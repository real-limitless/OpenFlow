/**
 * Shared Ansible ad-hoc runner contract (parity with ansible-flow-mcp).
 * No shell interpolation — argv only.
 */

export const FQCN_RE = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/;

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
  module: string;
  checkMode: boolean;
  exitCode: number;
  hosts: AnsibleHostResult[];
  stdout: string;
  stderr: string;
  argv: string[];
  failed: boolean;
};

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
  /** Inject for tests */
  runFn?: (
    argv: string[],
    env: NodeJS.ProcessEnv,
    timeoutMs: number,
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
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
    ANSIBLE_STDOUT_CALLBACK: process.env.ANSIBLE_STDOUT_CALLBACK || "json",
    ANSIBLE_RETRY_FILES_ENABLED: "False",
    ANSIBLE_HOST_KEY_CHECKING: process.env.ANSIBLE_HOST_KEY_CHECKING || "False",
    ANSIBLE_DEPRECATION_WARNINGS: "False",
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
    module: fqcn,
    checkMode: Boolean(opts.checkMode),
    exitCode: code,
    hosts,
    stdout,
    stderr,
    argv,
    failed,
  };
}

/** Test-only: allow injecting runFn via module global (cleared by tests). */
let injectedRunFn: AnsibleRunOptions["runFn"] | undefined;

export function __setAnsibleRunFnForTests(fn: AnsibleRunOptions["runFn"] | undefined): void {
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
