import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

export type GitOperation =
  "add" | "addConfig" | "clone" | "commit" | "log" | "push" | "reflog" | "switchBranch" | "tag";

export type TagAction = "add" | "list" | "delete";

export interface GitLogEntry {
  hash: string;
  date: string;
  author: string;
  message: string;
}

export interface GitReflogEntry {
  hash: string;
  selector: string;
  message: string;
}

export interface GitClient {
  clone(
    repository: string,
    path: string,
    options: { branch?: string; credentials?: Record<string, unknown> },
  ): Promise<void>;
  add(repoPath: string, pathsToAdd: string): Promise<void>;
  commit(repoPath: string, message: string, options: { allowEmpty?: boolean }): Promise<string>;
  push(
    repoPath: string,
    options: {
      remote?: string;
      branch?: string;
      force?: boolean;
      credentials?: Record<string, unknown>;
    },
  ): Promise<void>;
  log(repoPath: string, maxCommits: number): Promise<GitLogEntry[]>;
  reflog(repoPath: string, maxCommits: number): Promise<GitReflogEntry[]>;
  switchBranch(
    repoPath: string,
    branch: string,
    options: { create?: boolean; force?: boolean },
  ): Promise<void>;
  tag(
    repoPath: string,
    action: TagAction,
    options: { name?: string; message?: string },
  ): Promise<string[]>;
  addConfig(repoPath: string, key: string, value: string): Promise<void>;
  close(): Promise<void>;
}

export type GitClientFactory = (
  credentials: Record<string, unknown> | null,
  options: Record<string, unknown>,
) => Promise<GitClient>;

let clientFactory: GitClientFactory | null = null;

export function setGitClientFactory(factory: GitClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: GitClientFactory = async (credentials, options) => {
  const { defaultGitClientFactory } = await import("./git-transport");
  return defaultGitClientFactory(credentials, options);
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

export const gitExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<GitOperation>("operation", "clone");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeout = (options.timeout as number) ?? 10000;

  const credentials = await ctx.getCredential("gitPassword").catch(() => null);
  const sshCredentials = await ctx.getCredential("sshPrivateKey").catch(() => null);
  const resolvedCredentials = credentials ?? sshCredentials ?? null;

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(resolvedCredentials, { ...options, timeout });

  try {
    switch (operation) {
      case "clone":
        return [await runClone(ctx, items, client, resolvedCredentials)];
      case "add":
        return [await runAdd(ctx, items, client)];
      case "commit":
        return [await runCommit(ctx, items, client)];
      case "push":
        return [await runPush(ctx, items, client, resolvedCredentials)];
      case "log":
        return [await runLog(ctx, items, client)];
      case "reflog":
        return [await runReflog(ctx, items, client)];
      case "switchBranch":
        return [await runSwitchBranch(ctx, items, client)];
      case "tag":
        return [await runTag(ctx, items, client)];
      case "addConfig":
        return [await runAddConfig(ctx, items, client)];
      default:
        throw new Error(`Git: unknown operation "${operation}"`);
    }
  } finally {
    await client.close().catch(() => {});
  }
};

async function runClone(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: GitClient,
  credentials: Record<string, unknown> | null,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const repository = String(resolveValue(ctx.getParam("repository", ""), items[i].json));
    const clonePath = String(resolveValue(ctx.getParam("clonePath", ""), items[i].json));
    const branch = String(resolveValue(ctx.getParam("branch", ""), items[i].json));
    await client.clone(repository, clonePath, {
      ...(branch ? { branch } : {}),
      ...(credentials ? { credentials } : {}),
    });
    out.push({
      json: { success: true, path: clonePath, repository },
      pairedItem: { item: i, input: 0 },
    });
  }
  return out;
}

async function runAdd(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: GitClient,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const repoPath = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    const pathsToAdd = String(resolveValue(ctx.getParam("pathsToAdd", "."), items[i].json));
    await client.add(repoPath, pathsToAdd);
    out.push({
      json: { success: true, path: repoPath, pathsToAdd },
      pairedItem: { item: i, input: 0 },
    });
  }
  return out;
}

async function runCommit(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: GitClient,
): Promise<INodeExecutionData[]> {
  const allowEmpty = ctx.getParam<boolean>("allowEmpty", false);
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const repoPath = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    const message = String(resolveValue(ctx.getParam("message", ""), items[i].json));
    const commitHash = await client.commit(repoPath, message, { allowEmpty });
    out.push({
      json: { success: true, message, commitHash },
      pairedItem: { item: i, input: 0 },
    });
  }
  return out;
}

async function runPush(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: GitClient,
  credentials: Record<string, unknown> | null,
): Promise<INodeExecutionData[]> {
  const force = ctx.getParam<boolean>("force", false);
  const remote = ctx.getParam<string>("remote", "origin");
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const repoPath = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    const branch = String(resolveValue(ctx.getParam("branch", ""), items[i].json));
    await client.push(repoPath, {
      remote,
      ...(branch ? { branch } : {}),
      force,
      ...(credentials ? { credentials } : {}),
    });
    out.push({
      json: { success: true, remote, ...(branch ? { branch } : {}) },
      pairedItem: { item: i, input: 0 },
    });
  }
  return out;
}

async function runLog(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: GitClient,
): Promise<INodeExecutionData[]> {
  const maxCommits = ctx.getParam<number>("maxCommits", 100);
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const repoPath = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    const entries = await client.log(repoPath, maxCommits);
    for (const e of entries) {
      out.push({
        json: { hash: e.hash, date: e.date, author: e.author, message: e.message },
        pairedItem: { item: i, input: 0 },
      });
    }
  }
  return out;
}

async function runReflog(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: GitClient,
): Promise<INodeExecutionData[]> {
  const maxCommits = ctx.getParam<number>("maxCommits", 100);
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const repoPath = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    const entries = await client.reflog(repoPath, maxCommits);
    for (const e of entries) {
      out.push({
        json: { hash: e.hash, selector: e.selector, message: e.message },
        pairedItem: { item: i, input: 0 },
      });
    }
  }
  return out;
}

async function runSwitchBranch(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: GitClient,
): Promise<INodeExecutionData[]> {
  const createBranch = ctx.getParam<boolean>("createBranch", false);
  const force = ctx.getParam<boolean>("force", false);
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const repoPath = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    const branch = String(resolveValue(ctx.getParam("branch", ""), items[i].json));
    await client.switchBranch(repoPath, branch, { create: createBranch, force });
    out.push({
      json: { success: true, branch },
      pairedItem: { item: i, input: 0 },
    });
  }
  return out;
}

async function runTag(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: GitClient,
): Promise<INodeExecutionData[]> {
  const tagAction = ctx.getParam<TagAction>("tagAction", "add");
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const repoPath = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    const tagName = String(resolveValue(ctx.getParam("tagName", ""), items[i].json));
    const message = String(resolveValue(ctx.getParam("message", ""), items[i].json));
    const tags = await client.tag(repoPath, tagAction, {
      ...(tagName ? { name: tagName } : {}),
      ...(message ? { message } : {}),
    });
    if (tagAction === "list") {
      for (const name of tags) {
        out.push({
          json: { name },
          pairedItem: { item: i, input: 0 },
        });
      }
    } else {
      out.push({
        json: { success: true, action: tagAction, name: tagName },
        pairedItem: { item: i, input: 0 },
      });
    }
  }
  return out;
}

async function runAddConfig(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: GitClient,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const repoPath = String(resolveValue(ctx.getParam("path", ""), items[i].json));
    const key = String(resolveValue(ctx.getParam("configKey", ""), items[i].json));
    const value = String(resolveValue(ctx.getParam("configValue", ""), items[i].json));
    await client.addConfig(repoPath, key, value);
    out.push({
      json: { success: true, key, value },
      pairedItem: { item: i, input: 0 },
    });
  }
  return out;
}
