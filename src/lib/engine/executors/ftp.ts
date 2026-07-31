import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import type { CredentialData } from "@/lib/engine/credentials";
import { evaluateExpression } from "../../expressions/evaluate";

export type FtpProtocol = "ftp" | "sftp";

export interface FtpEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modifyTime?: string;
}

export interface FtpStat {
  isDirectory: boolean;
}

export interface FtpClient {
  list(path: string, recursive: boolean): Promise<FtpEntry[]>;
  get(path: string): Promise<Buffer>;
  put(path: string, data: Buffer): Promise<void>;
  delete(path: string): Promise<void>;
  deleteDir(path: string, recursive: boolean): Promise<void>;
  stat(path: string): Promise<FtpStat | null>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string, recursive: boolean): Promise<void>;
  close(): Promise<void>;
}

export type FtpClientFactory = (
  protocol: FtpProtocol,
  credentials: CredentialData,
  options: Record<string, unknown>,
) => Promise<FtpClient>;

let clientFactory: FtpClientFactory | null = null;

export function setFtpClientFactory(factory: FtpClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: FtpClientFactory = async (protocol, credentials, options) => {
  const { defaultFtpClientFactory } = await import("./ftp-transport");
  return defaultFtpClientFactory(protocol, credentials, options);
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

export const ftpExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const protocol = ctx.getParam<FtpProtocol>("protocol", "ftp");
  const operation = ctx.getParam<string>("operation", "download");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeout = (options.timeout as number) ?? 10000;

  const credName: string = protocol === "sftp" ? "sftp" : "ftp";
  const credentials = await ctx.getCredential(credName);
  if (!credentials) {
    throw new Error(`FTP: credential "${credName}" is not configured on this node`);
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(protocol, credentials, { ...options, timeout });

  try {
    switch (operation) {
      case "list":
        return [await runList(ctx, items, client)];
      case "download":
        return [await runDownload(ctx, items, client)];
      case "upload":
        return [await runUpload(ctx, items, client)];
      case "delete":
        return [await runDelete(ctx, items, client, options)];
      case "rename":
        return [await runRename(ctx, items, client, options)];
      default:
        throw new Error(`FTP: unknown operation "${operation}"`);
    }
  } finally {
    await client.close().catch(() => {});
  }
};

async function runList(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: FtpClient,
): Promise<INodeExecutionData[]> {
  const recursive = ctx.getParam<boolean>("recursive", false);
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const path = String(resolveValue(ctx.getParam("path", "/"), items[i].json));
    const entries = await client.list(path, recursive);
    for (const e of entries) {
      out.push({
        json: {
          name: e.name,
          path: e.path,
          type: e.type,
          size: e.size,
          ...(e.modifyTime ? { modifyTime: e.modifyTime } : {}),
        },
        pairedItem: { item: i, input: 0 },
      });
    }
  }
  return out;
}

async function runDownload(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: FtpClient,
): Promise<INodeExecutionData[]> {
  const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const path = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    const buf = await client.get(path);
    const fileName = path.split("/").pop() ?? path;
    out.push({
      json: { fileName, path },
      binary: {
        ...items[i].binary,
        [binaryPropertyName]: {
          data: buf.toString("base64"),
          mimeType: "application/octet-stream",
          fileName,
          fileExtension: fileName.split(".").pop() ?? "",
          fileSize: buf.length,
        },
      },
      pairedItem: { item: i, input: 0 },
    });
  }
  return out;
}

async function runUpload(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: FtpClient,
): Promise<INodeExecutionData[]> {
  const binaryData = ctx.getParam<boolean>("binaryData", true);
  const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const path = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    let buf: Buffer;
    if (binaryData) {
      const bin = items[i].binary?.[binaryPropertyName];
      if (!bin) {
        throw new Error(
          `FTP: upload binary property "${binaryPropertyName}" not found on item ${i}`,
        );
      }
      buf = Buffer.from(bin.data, "base64");
    } else {
      const content = String(resolveValue(ctx.getParam("fileContent", ""), items[i].json));
      buf = Buffer.from(content, "utf8");
    }
    await client.put(path, buf);
    out.push({
      json: { success: true, path, bytes: buf.length },
      pairedItem: { item: i, input: 0 },
    });
  }
  return out;
}

async function runDelete(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: FtpClient,
  options: Record<string, unknown>,
): Promise<INodeExecutionData[]> {
  const allowFolder = options.folder === true;
  const recursive = options.recursive === true;
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const path = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    const stat = await client.stat(path);
    const isDir = stat?.isDirectory === true;
    if (isDir && !allowFolder) {
      throw new Error(`FTP: cannot delete directory "${path}" without options.folder`);
    }
    if (isDir) {
      await client.deleteDir(path, recursive);
    } else {
      await client.delete(path);
    }
    out.push({
      json: { success: true, path, ...(isDir ? { directory: true } : {}) },
      pairedItem: { item: i, input: 0 },
    });
  }
  return out;
}

async function runRename(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: FtpClient,
  options: Record<string, unknown>,
): Promise<INodeExecutionData[]> {
  const createDirectories = options.createDirectories === true;
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const oldPath = String(resolveValue(ctx.getParam("oldPath", ""), items[i].json));
    const newPath = String(resolveValue(ctx.getParam("newPath", ""), items[i].json));
    if (createDirectories) {
      const parent = newPath.split("/").slice(0, -1).join("/");
      if (parent) await client.mkdir(parent, true).catch(() => {});
    }
    await client.rename(oldPath, newPath);
    out.push({
      json: { success: true, oldPath, newPath },
      pairedItem: { item: i, input: 0 },
    });
  }
  return out;
}
