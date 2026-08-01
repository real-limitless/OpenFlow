import { Client as Ssh2Client, type SFTPWrapper } from "ssh2";
import type { SshClient, SshClientFactory, SshExecResult } from "./ssh";

/**
 * Default SSH client for the `n8n-nodes-base.ssh` executor, over the `ssh2`
 * dependency already used by the SFTP half of ftp-transport.ts.
 *
 * The executor drives the lifecycle explicitly (`connect()` ... `close()`), so
 * unlike the FTP factory this one returns an unconnected client.
 */

/** Wrap a path for safe use inside a POSIX shell single-quoted string. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function createClient(config: {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  timeout: number;
}): SshClient {
  let conn: Ssh2Client | null = null;
  let sftpChannel: SFTPWrapper | null = null;

  function requireConn(): Ssh2Client {
    if (!conn) throw new Error("SSH: not connected");
    return conn;
  }

  function sftp(): Promise<SFTPWrapper> {
    if (sftpChannel) return Promise.resolve(sftpChannel);
    return new Promise((resolve, reject) => {
      requireConn().sftp((err, channel) => {
        if (err || !channel) {
          reject(err ?? new Error("SSH: failed to open SFTP channel"));
          return;
        }
        sftpChannel = channel;
        resolve(channel);
      });
    });
  }

  return {
    connect(): Promise<void> {
      return new Promise((resolve, reject) => {
        const client = new Ssh2Client();
        const timer = setTimeout(() => {
          client.end();
          reject(new Error(`SSH: connection to ${config.host}:${config.port} timed out after ${config.timeout}ms`));
        }, config.timeout);

        client
          .on("ready", () => {
            clearTimeout(timer);
            conn = client;
            resolve();
          })
          .on("error", (err) => {
            clearTimeout(timer);
            reject(err);
          })
          .connect({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            privateKey: config.privateKey,
            passphrase: config.passphrase,
            readyTimeout: config.timeout,
          });
      });
    },

    execCommand(command, options): Promise<SshExecResult> {
      // `cd` is folded into the command because exec opens a fresh shell each
      // time -- there is no persistent working directory to set.
      const full =
        options?.cwd && options.cwd !== "/"
          ? `cd ${shellQuote(options.cwd)} && ${command}`
          : command;

      return new Promise((resolve, reject) => {
        requireConn().exec(full, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          const stdout: Buffer[] = [];
          const stderr: Buffer[] = [];
          stream
            .on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)))
            .on("close", (code: number | null, signal: string | null) => {
              resolve({
                // A signalled command reports a null exit code; surface 0 only
                // when the remote actually returned success.
                code: typeof code === "number" ? code : signal ? -1 : 0,
                signal: signal ?? null,
                stdout: Buffer.concat(stdout).toString("utf8"),
                stderr: Buffer.concat(stderr).toString("utf8"),
              });
            })
            .on("error", reject);
          stream.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
        });
      });
    },

    async downloadFile(remotePath): Promise<Buffer> {
      const channel = await sftp();
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = channel.createReadStream(remotePath);
        stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        stream.on("error", reject);
        stream.on("close", () => resolve(Buffer.concat(chunks)));
      });
    },

    async uploadFile(localData, remotePath): Promise<void> {
      const channel = await sftp();
      return new Promise((resolve, reject) => {
        const stream = channel.createWriteStream(remotePath);
        stream.on("error", reject);
        stream.on("close", () => resolve());
        stream.end(localData);
      });
    },

    async close(): Promise<void> {
      sftpChannel = null;
      if (conn) {
        conn.end();
        conn = null;
      }
    },
  };
}

export const defaultSshClientFactory: SshClientFactory = async (credentials, options) => {
  const cred = (credentials ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    v != null && String(v).trim() !== "" ? String(v) : undefined;

  const host = str(cred.host);
  if (!host) throw new Error("SSH: credential host is required");

  const username = str(cred.username) ?? str(cred.user);
  if (!username) throw new Error("SSH: credential username is required");

  const password = str(cred.password);
  const privateKey = str(cred.privateKey);
  if (!password && !privateKey) {
    throw new Error("SSH: credential needs either a password or a privateKey");
  }

  return createClient({
    host,
    port: Number(cred.port ?? 22) || 22,
    username,
    password,
    privateKey,
    passphrase: str(cred.passphrase),
    timeout: Number((options as Record<string, unknown>)?.timeout ?? 10000) || 10000,
  });
};
