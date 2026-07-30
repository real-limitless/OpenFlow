import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setGitClientFactory,
  type GitClient,
  type GitLogEntry,
  type GitReflogEntry,
} from "../../executors/git";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.git";

const GIT_CRED = { username: "u", password: "p" };

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runGit(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = {
    gitPassword: GIT_CRED,
    sshPrivateKey: { privateKey: "key" },
  },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function mockClient(impl: Partial<GitClient> = {}): GitClient {
  return {
    clone: impl.clone ?? (async () => {}),
    add: impl.add ?? (async () => {}),
    commit: impl.commit ?? (async () => "abc123"),
    push: impl.push ?? (async () => {}),
    log: impl.log ?? (async () => []),
    reflog: impl.reflog ?? (async () => []),
    switchBranch: impl.switchBranch ?? (async () => {}),
    tag: impl.tag ?? (async () => []),
    addConfig: impl.addConfig ?? (async () => {}),
    close: impl.close ?? (async () => {}),
  };
}

afterEach(() => setGitClientFactory(null));

describe("batch-queue git — n8n-nodes-base.git", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Git");
  });

  it("throws when no transport client is configured", async () => {
    await expect(runGit({ operation: "log", path: "/tmp/repo" }, [{}])).rejects.toThrow(
      /no transport client configured/,
    );
  });

  it("clone returns success with path and repository", async () => {
    const clones: Array<{ repository: string; path: string }> = [];
    setGitClientFactory(async () =>
      mockClient({
        clone: async (repository, path) => {
          clones.push({ repository, path });
        },
      }),
    );

    const out = await runGit(
      {
        operation: "clone",
        repository: "https://github.com/example/repo.git",
        clonePath: "/tmp/repo",
      },
      [{}],
    );

    expect(clones).toEqual([
      { repository: "https://github.com/example/repo.git", path: "/tmp/repo" },
    ]);
    expect(out[0][0].json).toMatchObject({
      success: true,
      path: "/tmp/repo",
      repository: "https://github.com/example/repo.git",
    });
  });

  it("add stages files and returns success", async () => {
    const adds: Array<{ repoPath: string; pathsToAdd: string }> = [];
    setGitClientFactory(async () =>
      mockClient({
        add: async (repoPath, pathsToAdd) => {
          adds.push({ repoPath, pathsToAdd });
        },
      }),
    );

    const out = await runGit({ operation: "add", path: "/tmp/repo", pathsToAdd: "." }, [{}]);

    expect(adds).toEqual([{ repoPath: "/tmp/repo", pathsToAdd: "." }]);
    expect(out[0][0].json).toMatchObject({ success: true, path: "/tmp/repo", pathsToAdd: "." });
  });

  it("commit returns commit hash", async () => {
    setGitClientFactory(async () =>
      mockClient({
        commit: async () => "deadbeef",
      }),
    );

    const out = await runGit(
      { operation: "commit", path: "/tmp/repo", message: "feat: add feature" },
      [{}],
    );

    expect(out[0][0].json).toMatchObject({
      success: true,
      message: "feat: add feature",
      commitHash: "deadbeef",
    });
  });

  it("push passes remote, branch, and force options", async () => {
    const pushes: Array<{ repoPath: string; remote: string; branch: string; force: boolean }> = [];
    setGitClientFactory(async () =>
      mockClient({
        push: async (repoPath, opts) => {
          pushes.push({
            repoPath,
            remote: opts.remote ?? "",
            branch: opts.branch ?? "",
            force: opts.force ?? false,
          });
        },
      }),
    );

    const out = await runGit(
      { operation: "push", path: "/tmp/repo", remote: "origin", branch: "main", force: true },
      [{}],
    );

    expect(pushes).toEqual([
      { repoPath: "/tmp/repo", remote: "origin", branch: "main", force: true },
    ]);
    expect(out[0][0].json).toMatchObject({ success: true, remote: "origin", branch: "main" });
  });

  it("log returns one item per commit entry up to maxCommits", async () => {
    const entries: GitLogEntry[] = [
      { hash: "aaa", date: "2024-01-01", author: "Alice", message: "first" },
      { hash: "bbb", date: "2024-01-02", author: "Bob", message: "second" },
    ];
    setGitClientFactory(async () => mockClient({ log: async () => entries }));

    const out = await runGit({ operation: "log", path: "/tmp/repo", maxCommits: 5 }, [{}]);

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({
      hash: "aaa",
      date: "2024-01-01",
      author: "Alice",
      message: "first",
    });
    expect(out[0][1].json.hash).toBe("bbb");
  });

  it("reflog returns reflog entries", async () => {
    const entries: GitReflogEntry[] = [
      { hash: "abc", selector: "HEAD@{0}", message: "commit: msg" },
    ];
    setGitClientFactory(async () => mockClient({ reflog: async () => entries }));

    const out = await runGit({ operation: "reflog", path: "/tmp/repo", maxCommits: 10 }, [{}]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      hash: "abc",
      selector: "HEAD@{0}",
      message: "commit: msg",
    });
  });

  it("switchBranch with createBranch calls switchBranch with create flag", async () => {
    const switches: Array<{ repoPath: string; branch: string; create: boolean }> = [];
    setGitClientFactory(async () =>
      mockClient({
        switchBranch: async (repoPath, branch, opts) => {
          switches.push({ repoPath, branch, create: opts.create ?? false });
        },
      }),
    );

    const out = await runGit(
      { operation: "switchBranch", path: "/tmp/repo", branch: "feature-x", createBranch: true },
      [{}],
    );

    expect(switches).toEqual([{ repoPath: "/tmp/repo", branch: "feature-x", create: true }]);
    expect(out[0][0].json).toMatchObject({ success: true, branch: "feature-x" });
  });

  it("tag list returns one item per tag", async () => {
    setGitClientFactory(async () =>
      mockClient({
        tag: async () => ["v1.0.0", "v1.1.0", "v2.0.0"],
      }),
    );

    const out = await runGit({ operation: "tag", path: "/tmp/repo", tagAction: "list" }, [{}]);

    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json.name).toBe("v1.0.0");
    expect(out[0][2].json.name).toBe("v2.0.0");
  });

  it("tag add returns success with tag name", async () => {
    const tags: Array<{ repoPath: string; action: string; name: string }> = [];
    setGitClientFactory(async () =>
      mockClient({
        tag: async (repoPath, action, opts) => {
          tags.push({ repoPath, action, name: opts.name ?? "" });
          return [];
        },
      }),
    );

    const out = await runGit(
      {
        operation: "tag",
        path: "/tmp/repo",
        tagAction: "add",
        tagName: "v1.0.0",
        message: "release",
      },
      [{}],
    );

    expect(tags).toEqual([{ repoPath: "/tmp/repo", action: "add", name: "v1.0.0" }]);
    expect(out[0][0].json).toMatchObject({ success: true, action: "add", name: "v1.0.0" });
  });

  it("addConfig sets key and value", async () => {
    const configs: Array<{ repoPath: string; key: string; value: string }> = [];
    setGitClientFactory(async () =>
      mockClient({
        addConfig: async (repoPath, key, value) => {
          configs.push({ repoPath, key, value });
        },
      }),
    );

    const out = await runGit(
      { operation: "addConfig", path: "/tmp/repo", configKey: "user.name", configValue: "Alice" },
      [{}],
    );

    expect(configs).toEqual([{ repoPath: "/tmp/repo", key: "user.name", value: "Alice" }]);
    expect(out[0][0].json).toMatchObject({ success: true, key: "user.name", value: "Alice" });
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.git")).toBe(canonical);
  });
});
