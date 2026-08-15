import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type AnsibleSshCredential = {
  host?: string;
  port?: number | string;
  username?: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  becomePassword?: string;
  becomeUser?: string;
};

export type PreparedAnsibleAuth = {
  /** Inventory content or path — path preferred when files written */
  inventoryPath: string;
  /** Host pattern to target in argv */
  hostPattern: string;
  connection?: string;
  become?: boolean;
  becomeUser?: string;
  /** Env vars (passwords via ANSIBLE_* when possible) */
  env: Record<string, string>;
  /** Cleanup temp dir */
  cleanup: () => Promise<void>;
  /** Non-secret summary for tests */
  debug: {
    hasPassword: boolean;
    hasPrivateKey: boolean;
    hasBecomePassword: boolean;
    host: string;
    username: string;
  };
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/**
 * Materialize SSH/become credentials into a private temp inventory + key file.
 * Secrets go into files/env — never into argv that we return to runData.
 */
export async function prepareAnsibleAuth(opts: {
  credential: AnsibleSshCredential | null | undefined;
  hostsParam?: string;
  inventoryParam?: string;
  becomeParam?: boolean;
  becomeUserParam?: string;
  connectionParam?: string;
}): Promise<PreparedAnsibleAuth | null> {
  const cred = opts.credential;
  if (!cred) return null;

  const host = str(cred.host);
  const username = str(cred.username);
  const password = str(cred.password);
  const privateKey = str(cred.privateKey);
  const passphrase = str(cred.passphrase);
  const becomePassword = str(cred.becomePassword);
  const credBecomeUser = str(cred.becomeUser);
  const portRaw = cred.port;
  const port =
    portRaw == null || portRaw === ""
      ? 22
      : Number.isFinite(Number(portRaw))
        ? Number(portRaw)
        : 22;

  if (!host && !str(opts.inventoryParam)) {
    // Credential without host only useful for become password on local
    if (!becomePassword && !password && !privateKey) return null;
  }

  const dir = await mkdtemp(join(tmpdir(), "openflow-ansible-"));
  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  };

  try {
    const env: Record<string, string> = {};
    const invLines: string[] = ["[openflow]"];

    const hostPattern = str(opts.hostsParam) || (host ? "target" : "localhost");

    const alias = hostPattern.includes(",") || hostPattern.includes(":") ? "target" : hostPattern;
    const ansibleHost =
      host || (alias === "localhost" || alias === "127.0.0.1" ? "127.0.0.1" : alias);

    const vars: string[] = [`ansible_host=${ansibleHost}`, `ansible_port=${port}`];
    if (username) vars.push(`ansible_user=${username}`);

    if (privateKey) {
      const keyPath = join(dir, "id_key");
      let keyBody = privateKey;
      if (!keyBody.endsWith("\n")) keyBody += "\n";
      await writeFile(keyPath, keyBody, { mode: 0o600 });
      await chmod(keyPath, 0o600);
      vars.push(`ansible_ssh_private_key_file=${keyPath}`);
      if (passphrase) {
        // ansible-core supports ssh-agent better; passphrase via sshpass not always available.
        // Store in inventory with no_log risk — prefer empty and document.
        env.ANSIBLE_PRIVATE_KEY_PASSPHRASE = passphrase;
      }
    } else if (password) {
      vars.push(`ansible_password=${password}`);
      // Prefer sshpass connection when password auth
      env.ANSIBLE_HOST_KEY_CHECKING = "False";
    }

    const useBecome = Boolean(opts.becomeParam) || Boolean(becomePassword);
    const becomeUser = str(opts.becomeUserParam) || credBecomeUser || "";
    if (useBecome) {
      vars.push("ansible_become=true");
      if (becomeUser) vars.push(`ansible_become_user=${becomeUser}`);
      if (becomePassword) vars.push(`ansible_become_password=${becomePassword}`);
    }

    invLines.push(`${alias} ${vars.join(" ")}`);
    invLines.push("");

    // If user also provided inventory path content, we only use credential inventory
    // when credential host is set; otherwise fall through.
    const invPath = join(dir, "inventory.ini");
    await writeFile(invPath, invLines.join("\n"), { mode: 0o600 });
    await chmod(invPath, 0o600);

    const isLocal =
      !host || ansibleHost === "localhost" || ansibleHost === "127.0.0.1" || alias === "localhost";

    let connection = str(opts.connectionParam);
    if (!connection) {
      connection = isLocal && !privateKey && !password ? "local" : "ssh";
    }

    return {
      inventoryPath: invPath,
      hostPattern: alias,
      connection,
      become: useBecome,
      becomeUser: becomeUser || undefined,
      env,
      cleanup,
      debug: {
        hasPassword: Boolean(password),
        hasPrivateKey: Boolean(privateKey),
        hasBecomePassword: Boolean(becomePassword),
        host: ansibleHost,
        username,
      },
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Redact inventory path segments from argv for runData display. */
export function sanitizeArgvForDisplay(argv: string[]): string[] {
  return argv.map((part) => {
    if (
      part.includes("openflow-ansible-") ||
      part.includes("inventory.ini") ||
      part.includes("id_key")
    ) {
      return "[redacted-path]";
    }
    if (/password=/i.test(part)) return "[redacted]";
    return part;
  });
}
