import { randomBytes } from "node:crypto";
import { accessSync, constants, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { simpleGit, type SimpleGit, type SimpleGitOptions } from "simple-git";
import type {
  GitClient,
  GitClientFactory,
  GitLogEntry,
  GitReflogEntry,
  TagAction,
} from "./git";

function resolveGitBinary(): string {
  const fromEnv = process.env.GIT_BINARY?.trim();
  if (fromEnv) return fromEnv;

  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const name of ["git", "git.exe"]) {
      const candidate = join(dir, name);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        /* try next */
      }
    }
  }

  // Common absolute locations when PATH is minimal (containers, services)
  for (const candidate of ["/usr/bin/git", "/bin/git", "/usr/local/bin/git"]) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* try next */
    }
  }

  throw new Error(
    "Git: system git binary not found (spawn would fail with ENOENT). " +
      "Install git in the runtime image/host, or set GIT_BINARY to its absolute path.",
  );
}

type Creds = Record<string, unknown> | null;

function str(v: unknown, fallback = ""): string {
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function isSshCreds(creds: Creds): boolean {
  if (!creds) return false;
  return str(creds.privateKey).length > 0;
}

function isHttpsCreds(creds: Creds): boolean {
  if (!creds || isSshCreds(creds)) return false;
  return str(creds.username).length > 0 || str(creds.password).length > 0;
}

/** Embed HTTPS username/password into a git remote URL when possible. */
function applyHttpsCredentials(repository: string, creds: Creds): string {
  if (!isHttpsCreds(creds) || !creds) return repository;
  try {
    const url = new URL(repository);
    if (url.protocol !== "http:" && url.protocol !== "https:") return repository;
    const username = str(creds.username);
    const password = str(creds.password);
    if (username) url.username = username;
    if (password) url.password = password;
    return url.toString();
  } catch {
    return repository;
  }
}

async function writeTempFile(content: string, prefix: string, mode = 0o600): Promise<string> {
  const path = join(tmpdir(), `${prefix}-${randomBytes(8).toString("hex")}`);
  await fs.writeFile(path, content, { mode, encoding: "utf8" });
  return path;
}

/** Env keys simple-git treats as unsafe; strip host values and only re-add ones we control. */
const UNSAFE_ENV_KEYS = new Set([
  "EDITOR",
  "GIT_EDITOR",
  "GIT_SEQUENCE_EDITOR",
  "VISUAL",
  "PAGER",
  "GIT_PAGER",
  "GIT_ASKPASS",
  "SSH_ASKPASS",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "GIT_PROXY_COMMAND",
  "GIT_EXTERNAL_DIFF",
  "GIT_CONFIG",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_COUNT",
  "GIT_TEMPLATE_DIR",
  "GIT_EXEC_PATH",
  "PREFIX",
]);

function sanitizedProcessEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (UNSAFE_ENV_KEYS.has(key.toUpperCase())) continue;
    if (/^GIT_CONFIG_(KEY|VALUE)_/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

async function buildAuthEnv(creds: Creds): Promise<{
  env: Record<string, string | undefined>;
  cleanup: () => Promise<void>;
  allowSsh: boolean;
  allowAskPass: boolean;
}> {
  const baseEnv: Record<string, string | undefined> = {
    ...sanitizedProcessEnv(),
    GIT_TERMINAL_PROMPT: "0",
  };
  const tempFiles: string[] = [];
  let allowSsh = false;
  let allowAskPass = false;

  const cleanup = async () => {
    await Promise.all(
      tempFiles.map((f) => fs.unlink(f).catch(() => {})),
    );
  };

  if (!isSshCreds(creds) || !creds) {
    return { env: baseEnv, cleanup, allowSsh, allowAskPass };
  }

  const privateKey = str(creds.privateKey);
  const passphrase = str(creds.passphrase);
  const keyPath = await writeTempFile(
    privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`,
    "openflow-git-key",
  );
  tempFiles.push(keyPath);

  const sshParts = [
    "ssh",
    "-i",
    keyPath,
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
  ];

  if (passphrase) {
    const askpass = await writeTempFile(
      `#!/bin/sh\nprintf '%s\\n' "$OPENFLOW_GIT_SSH_PASSPHRASE"\n`,
      "openflow-git-askpass",
      0o700,
    );
    tempFiles.push(askpass);
    baseEnv.OPENFLOW_GIT_SSH_PASSPHRASE = passphrase;
    baseEnv.SSH_ASKPASS = askpass;
    baseEnv.SSH_ASKPASS_REQUIRE = "force";
    baseEnv.DISPLAY = baseEnv.DISPLAY || "openflow:0";
    allowAskPass = true;
  }

  baseEnv.GIT_SSH_COMMAND = sshParts.join(" ");
  allowSsh = true;
  return { env: baseEnv, cleanup, allowSsh, allowAskPass };
}

function createGit(
  baseDir: string | undefined,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
  unsafe: { allowSsh: boolean; allowAskPass: boolean },
  binary: string,
): SimpleGit {
  const opts: Partial<SimpleGitOptions> = {
    baseDir: baseDir || process.cwd(),
    binary,
    maxConcurrentProcesses: 1,
    trimmed: true,
    timeout: { block: timeoutMs },
    unsafe: {
      allowUnsafeCustomBinary: true,
      ...(unsafe.allowSsh ? { allowUnsafeSshCommand: true } : {}),
      ...(unsafe.allowAskPass ? { allowUnsafeAskPass: true } : {}),
    },
  };
  return simpleGit(opts).env(env as Record<string, string>);
}

function parseReflog(raw: string, maxCommits: number): GitReflogEntry[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxCommits);

  const out: GitReflogEntry[] = [];
  // e.g. "abc1234 HEAD@{0}: commit: initial"
  const re = /^([0-9a-fA-F]+)\s+(\S+):\s*(.*)$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      out.push({ hash: m[1], selector: m[2], message: m[3] ?? "" });
    } else {
      out.push({ hash: "", selector: "", message: line });
    }
  }
  return out;
}

function splitPaths(pathsToAdd: string): string | string[] {
  const trimmed = pathsToAdd.trim();
  if (!trimmed || trimmed === ".") return ".";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.length <= 1 ? trimmed : parts;
}

/** Production Git client factory using simple-git (system git binary). */
export const defaultGitClientFactory: GitClientFactory = async (credentials, options) => {
  const timeoutMs = Math.max(1000, Number(options.timeout ?? 10000) || 10000);
  const binary = resolveGitBinary();
  const { env, cleanup, allowSsh, allowAskPass } = await buildAuthEnv(credentials);
  const unsafe = { allowSsh, allowAskPass };
  let closed = false;

  const gitAt = (baseDir?: string) => createGit(baseDir, timeoutMs, env, unsafe, binary);

  const client: GitClient = {
    async clone(repository, path, cloneOptions) {
      const url = applyHttpsCredentials(
        repository,
        (cloneOptions.credentials as Creds) ?? credentials,
      );
      const args: string[] = [];
      if (cloneOptions.branch) {
        args.push("--branch", cloneOptions.branch);
      }
      await gitAt().clone(url, path, args);
    },

    async add(repoPath, pathsToAdd) {
      await gitAt(repoPath).add(splitPaths(pathsToAdd));
    },

    async commit(repoPath, message, commitOptions) {
      const git = gitAt(repoPath);
      const result = await git.commit(
        message,
        undefined,
        commitOptions.allowEmpty ? { "--allow-empty": null } : undefined,
      );
      const hash = str(result.commit).replace(/^['"]|['"]$/g, "");
      if (hash) return hash;
      return (await git.revparse(["HEAD"])).trim();
    },

    async push(repoPath, pushOptions) {
      const git = gitAt(repoPath);
      const remote = pushOptions.remote || "origin";
      const branch = pushOptions.branch;

      // If HTTPS creds present, rewrite remote URL for this push
      const pushCreds = (pushOptions.credentials as Creds) ?? credentials;
      if (isHttpsCreds(pushCreds)) {
        try {
          const remoteUrl = (await git.remote(["get-url", remote]))?.trim();
          if (remoteUrl) {
            const authed = applyHttpsCredentials(remoteUrl, pushCreds);
            if (authed !== remoteUrl) {
              await git.remote(["set-url", remote, authed]);
            }
          }
        } catch {
          /* keep existing remote URL */
        }
      }

      const args: string[] = [];
      if (pushOptions.force) args.push("--force");
      if (branch) {
        await git.push(remote, branch, args);
      } else {
        await git.push(remote, undefined, args);
      }
    },

    async log(repoPath, maxCommits): Promise<GitLogEntry[]> {
      const result = await gitAt(repoPath).log({ maxCount: maxCommits });
      return result.all.map((e) => ({
        hash: e.hash,
        date: e.date,
        author: e.author_name || e.author_email || "",
        message: (e.message || "").trim(),
      }));
    },

    async reflog(repoPath, maxCommits): Promise<GitReflogEntry[]> {
      const raw = await gitAt(repoPath).raw(["reflog", `-n${maxCommits}`]);
      return parseReflog(raw, maxCommits);
    },

    async switchBranch(repoPath, branch, switchOptions) {
      const git = gitAt(repoPath);
      if (switchOptions.create) {
        if (switchOptions.force) {
          await git.checkout(["-B", branch]);
        } else {
          await git.checkoutLocalBranch(branch);
        }
        return;
      }
      if (switchOptions.force) {
        await git.checkout(["-f", branch]);
      } else {
        await git.checkout(branch);
      }
    },

    async tag(repoPath, action: TagAction, tagOptions): Promise<string[]> {
      const git = gitAt(repoPath);
      const name = tagOptions.name ?? "";
      switch (action) {
        case "list": {
          const tags = await git.tags();
          return tags.all ?? [];
        }
        case "delete": {
          if (!name) throw new Error("Git: tagName is required for tag delete");
          await git.tag(["-d", name]);
          return [];
        }
        case "add":
        default: {
          if (!name) throw new Error("Git: tagName is required for tag add");
          if (tagOptions.message) {
            await git.addAnnotatedTag(name, tagOptions.message);
          } else {
            await git.addTag(name);
          }
          return [];
        }
      }
    },

    async addConfig(repoPath, key, value) {
      await gitAt(repoPath).addConfig(key, value);
    },

    async close() {
      if (closed) return;
      closed = true;
      await cleanup();
    },
  };

  return client;
};
