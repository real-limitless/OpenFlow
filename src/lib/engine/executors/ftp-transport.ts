import { Client as FtpLibClient, type FileInfo } from "basic-ftp";
import { Client as SshClient, type SFTPWrapper } from "ssh2";
import type { CredentialData } from "@/lib/engine/credentials";
import type { FtpClient, FtpClientFactory, FtpEntry, FtpProtocol, FtpStat } from "./ftp";

function joinPath(base: string, name: string): string {
  if (!base || base === "/") return `/${name}`.replace(/\/+/g, "/");
  return `${base.replace(/\/+$/, "")}/${name}`;
}

function parentDir(path: string): string {
  const cleaned = path.replace(/\/+$/, "");
  const idx = cleaned.lastIndexOf("/");
  if (idx <= 0) return "/";
  return cleaned.slice(0, idx) || "/";
}

function mapFtpInfo(info: FileInfo, dir: string): FtpEntry {
  return {
    name: info.name,
    path: joinPath(dir, info.name),
    type: info.isDirectory ? "directory" : "file",
    size: info.size ?? 0,
    modifyTime: info.modifiedAt ? info.modifiedAt.toISOString() : undefined,
  };
}

async function createFtpClient(
  credentials: CredentialData,
  options: Record<string, unknown>,
): Promise<FtpClient> {
  const host = String(credentials.host ?? "");
  const port = Number(credentials.port ?? 21) || 21;
  const user = String(credentials.username ?? credentials.user ?? "");
  const password = String(credentials.password ?? "");
  const timeout = Number(options.timeout ?? 10000) || 10000;

  if (!host) throw new Error("FTP: credential host is required");

  const client = new FtpLibClient(timeout);
  client.ftp.verbose = false;
  await client.access({
    host,
    port,
    user,
    password,
    secure: false,
  });

  async function listRecursive(path: string): Promise<FtpEntry[]> {
    const out: FtpEntry[] = [];
    const entries = await client.list(path);
    for (const info of entries) {
      if (info.name === "." || info.name === "..") continue;
      const mapped = mapFtpInfo(info, path);
      out.push(mapped);
      if (info.isDirectory) {
        out.push(...(await listRecursive(mapped.path)));
      }
    }
    return out;
  }

  return {
    async list(path, recursive) {
      if (recursive) return listRecursive(path || "/");
      const entries = await client.list(path || "/");
      return entries
        .filter((i) => i.name !== "." && i.name !== "..")
        .map((i) => mapFtpInfo(i, path || "/"));
    },
    async get(path) {
      const { Writable } = await import("node:stream");
      const chunks: Buffer[] = [];
      const sink = new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          cb();
        },
      });
      await client.downloadTo(sink, path);
      return Buffer.concat(chunks);
    },
    async put(path, data) {
      const { Readable } = await import("node:stream");
      const src = Readable.from(data);
      await client.uploadFrom(src, path);
    },
    async delete(path) {
      await client.remove(path);
    },
    async deleteDir(path, recursive) {
      if (recursive) {
        await client.removeDir(path);
      } else {
        await client.removeEmptyDir(path);
      }
    },
    async stat(path) {
      try {
        const dir = parentDir(path);
        const name = path.split("/").filter(Boolean).pop() ?? path;
        if (!name || path === "/" || path === "") {
          return { isDirectory: true };
        }
        const entries = await client.list(dir);
        const hit = entries.find((e) => e.name === name);
        if (!hit) return null;
        return { isDirectory: hit.isDirectory };
      } catch {
        return null;
      }
    },
    async rename(oldPath, newPath) {
      await client.rename(oldPath, newPath);
    },
    async mkdir(path, recursive) {
      if (recursive) {
        await client.ensureDir(path);
      } else {
        await client.sendIgnoringError(`MKD ${path}`);
      }
    },
    async close() {
      client.close();
    },
  };
}

function createSftpClient(
  credentials: CredentialData,
  options: Record<string, unknown>,
): Promise<FtpClient> {
  const host = String(credentials.host ?? "");
  const port = Number(credentials.port ?? 22) || 22;
  const username = String(credentials.username ?? credentials.user ?? "");
  const password = credentials.password != null ? String(credentials.password) : undefined;
  const privateKey =
    credentials.privateKey != null ? String(credentials.privateKey) : undefined;
  const passphrase =
    credentials.passphrase != null ? String(credentials.passphrase) : undefined;
  const timeout = Number(options.timeout ?? 10000) || 10000;

  if (!host) return Promise.reject(new Error("SFTP: credential host is required"));

  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SFTP: connection timed out after ${timeout}ms`));
    }, timeout);

    conn
      .on("ready", () => {
        conn.sftp((err, sftp) => {
          clearTimeout(timer);
          if (err || !sftp) {
            conn.end();
            reject(err ?? new Error("SFTP: failed to open channel"));
            return;
          }
          resolve(wrapSftp(conn, sftp));
        });
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({
        host,
        port,
        username,
        password,
        privateKey,
        passphrase,
        readyTimeout: timeout,
      });
  });
}

function wrapSftp(conn: SshClient, sftp: SFTPWrapper): FtpClient {
  const listDir = (path: string): Promise<FtpEntry[]> =>
    new Promise((resolve, reject) => {
      sftp.readdir(path || ".", (err, list) => {
        if (err) return reject(err);
        const entries: FtpEntry[] = (list ?? [])
          .filter((e) => e.filename !== "." && e.filename !== "..")
          .map((e) => {
            const isDir = (e.attrs.mode & 0o170000) === 0o040000;
            return {
              name: e.filename,
              path: joinPath(path || "/", e.filename),
              type: isDir ? ("directory" as const) : ("file" as const),
              size: e.attrs.size ?? 0,
              modifyTime: e.attrs.mtime
                ? new Date(e.attrs.mtime * 1000).toISOString()
                : undefined,
            };
          });
        resolve(entries);
      });
    });

  async function listRecursive(path: string): Promise<FtpEntry[]> {
    const out: FtpEntry[] = [];
    const entries = await listDir(path);
    for (const e of entries) {
      out.push(e);
      if (e.type === "directory") {
        out.push(...(await listRecursive(e.path)));
      }
    }
    return out;
  }

  return {
    async list(path, recursive) {
      if (recursive) return listRecursive(path || "/");
      return listDir(path || "/");
    },
    get(path) {
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = sftp.createReadStream(path);
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks)));
      });
    },
    put(path, data) {
      return new Promise((resolve, reject) => {
        const stream = sftp.createWriteStream(path);
        stream.on("error", reject);
        stream.on("close", () => resolve());
        stream.end(data);
      });
    },
    delete(path) {
      return new Promise((resolve, reject) => {
        sftp.unlink(path, (err) => (err ? reject(err) : resolve()));
      });
    },
    async deleteDir(path, recursive) {
      if (recursive) {
        const entries = await listDir(path);
        for (const e of entries) {
          if (e.type === "directory") await this.deleteDir(e.path, true);
          else await this.delete(e.path);
        }
      }
      await new Promise<void>((resolve, reject) => {
        sftp.rmdir(path, (err) => (err ? reject(err) : resolve()));
      });
    },
    stat(path) {
      return new Promise((resolve) => {
        sftp.stat(path, (err, stats) => {
          if (err || !stats) return resolve(null);
          resolve({ isDirectory: stats.isDirectory() } satisfies FtpStat);
        });
      });
    },
    rename(oldPath, newPath) {
      return new Promise((resolve, reject) => {
        sftp.rename(oldPath, newPath, (err) => (err ? reject(err) : resolve()));
      });
    },
    async mkdir(path, recursive) {
      if (!recursive) {
        await new Promise<void>((resolve, reject) => {
          sftp.mkdir(path, (err) => (err ? reject(err) : resolve()));
        });
        return;
      }
      const parts = path.split("/").filter(Boolean);
      let cur = path.startsWith("/") ? "" : ".";
      for (const part of parts) {
        cur = cur === "." ? part : `${cur}/${part}`;
        const abs = path.startsWith("/") ? `/${cur}`.replace(/\/+/g, "/") : cur;
        try {
          await new Promise<void>((resolve, reject) => {
            sftp.mkdir(abs, (err) => (err ? reject(err) : resolve()));
          });
        } catch {
          /* exists */
        }
      }
    },
    async close() {
      conn.end();
    },
  };
}

/** Production FTP/SFTP client factory using basic-ftp + ssh2. */
export const defaultFtpClientFactory: FtpClientFactory = async (
  protocol: FtpProtocol,
  credentials: CredentialData,
  options: Record<string, unknown>,
) => {
  if (protocol === "sftp") {
    return createSftpClient(credentials, options);
  }
  return createFtpClient(credentials, options);
};
