import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

export interface SshExecResult {
  code: number;
  signal: string | null;
  stdout: string;
  stderr: string;
}

export interface SshClient {
  connect(): Promise<void>;
  execCommand(command: string, options?: { cwd?: string }): Promise<SshExecResult>;
  downloadFile(remotePath: string): Promise<Buffer>;
  uploadFile(localData: Buffer, remotePath: string): Promise<void>;
  close(): Promise<void>;
}

export type SshClientFactory = (
  credentials: Record<string, unknown> | null,
  options: Record<string, unknown>,
) => Promise<SshClient>;

let clientFactory: SshClientFactory | null = null;

export function setSshClientFactory(factory: SshClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: SshClientFactory = async () => {
  throw new Error(
    "SSH: no transport client configured. Wire a real SSH client via setSshClientFactory.",
  );
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function expandHome(path: string, homeDir: string): string {
  if (path === "~") {
    throw new Error('Invalid path. Replace "~" with home directory or "~/"');
  }
  if (path.startsWith("~/")) {
    return path.replace("~", homeDir);
  }
  return path;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"\/\\|?*\x00-\x1F]/g, "_")
    .replace(/^\.+$/, "_")
    .substring(0, 255);
}

function getHomeDir(client: SshClient): Promise<string> {
  return client.execCommand("echo $HOME").then((r) => r.stdout.trim());
}

export const sshExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const authentication = ctx.getParam<string>("authentication", "password");
  const resource = ctx.getParam<string>("resource", "command");
  const operation = ctx.getParam<string>("operation", resource === "command" ? "execute" : "download");
  const continueOnFail = ctx.continueOnFail();

  const credName = authentication === "privateKey" ? "sshPrivateKey" : "sshPassword";
  const credentials = await ctx.getCredential(credName);
  if (!credentials) {
    throw new Error(`SSH: credential "${credName}" is not configured on this node`);
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials, {});

  try {
    await client.connect();
    const homeDir = await getHomeDir(client);

    switch (resource) {
      case "command":
        return [await runExecute(ctx, items, client, homeDir, continueOnFail)];
      case "file":
        if (operation === "download") {
          return [await runDownload(ctx, items, client, homeDir, continueOnFail)];
        }
        if (operation === "upload") {
          return [await runUpload(ctx, items, client, homeDir, continueOnFail)];
        }
        throw new Error(`SSH: unknown file operation "${operation}"`);
      default:
        throw new Error(`SSH: unknown resource "${resource}"`);
    }
  } finally {
    await client.close().catch(() => {});
  }
};

async function runExecute(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: SshClient,
  homeDir: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    try {
      const command = String(resolveValue(ctx.getParam("command", ""), items[i].json));
      const cwdRaw = String(resolveValue(ctx.getParam("cwd", "/"), items[i].json));
      const cwd = expandHome(cwdRaw, homeDir);

      const result = await client.execCommand(command, { cwd });
      out.push({
        json: {
          code: result.code,
          signal: result.signal,
          stderr: result.stderr,
          stdout: result.stdout,
        },
        pairedItem: { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: { item: i, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }
  return out;
}

async function runDownload(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: SshClient,
  homeDir: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const fileNameOverride = String(resolveValue(options.fileName ?? "", {}));

  for (let i = 0; i < items.length; i++) {
    try {
      const pathRaw = String(resolveValue(ctx.getParam("path", ""), items[i].json));
      const remotePath = expandHome(pathRaw, homeDir);

      const buffer = await client.downloadFile(remotePath);

      const fileName = fileNameOverride || (remotePath.split("/").pop() ?? "download");
      const sanitizedName = sanitizeFileName(fileName);

      items[i] = {
        ...items[i],
        json: { ...items[i].json },
        binary: {
          ...(items[i].binary ?? {}),
          [binaryPropertyName]: {
            data: buffer.toString("base64"),
            mimeType: "application/octet-stream",
            fileName: sanitizedName,
            fileExtension: sanitizedName.split(".").pop() ?? "",
            fileSize: buffer.length,
          },
        },
      };
    } catch (err) {
      if (continueOnFail) {
        items[i] = {
          json: { error: err instanceof Error ? err.message : String(err) },
          binary: {},
        };
      } else {
        throw err;
      }
    }
  }
  return items;
}

async function runUpload(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: SshClient,
  homeDir: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const fileNameOverride = String(resolveValue(options.fileName ?? "", {}));

  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    try {
      const pathRaw = String(resolveValue(ctx.getParam("path", ""), items[i].json));
      const remoteDir = expandHome(pathRaw, homeDir);

      const binary = items[i].binary?.[binaryPropertyName];
      if (!binary) {
        throw new Error(`SSH: upload binary property "${binaryPropertyName}" not found on item ${i}`);
      }

      let buffer: Buffer;
      if (binary.id) {
        throw new Error("SSH: engine binary streaming not implemented");
      } else {
        buffer = Buffer.from(binary.data, "base64");
      }

      const fileName = fileNameOverride || (binary.fileName ?? "upload");
      const sanitizedName = sanitizeFileName(fileName);
      const remotePath = `${remoteDir.replace(/\/$/, "")}/${sanitizedName}`;

      await client.uploadFile(buffer, remotePath);

      out.push({
        json: { success: true },
        pairedItem: { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: { item: i, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }
  return out;
}