import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.github";

function mockGithubResponse(data: unknown) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  return {
    status: 200,
    statusText: "OK",
    ok: true,
    headers: { get() { return "application/json"; }, entries() { return new Map(); } },
    async json() { return JSON.parse(body); },
    async text() { return body; },
  };
}

function mockGithubError(status: number, message: string) {
  const body = JSON.stringify({ message });
  return {
    status,
    statusText: "Error",
    ok: false,
    headers: { get() { return "application/json"; }, entries() { return new Map(); } },
    async json() { return JSON.parse(body); },
    async text() { return body; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: (init?.method ?? "GET").toUpperCase(),
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return defaultResponse;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

let defaultResponse: ReturnType<typeof mockGithubResponse>;

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
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
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

const CREDS = {
  githubApi: { accessToken: "ghp_abc123" },
};

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: {
    continueOnFail?: boolean;
    credentials?: Record<string, Record<string, unknown>>;
  },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue github — n8n-nodes-base.github", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).not.toBeUndefined();
    expect(getNodeType(TYPE).displayName).toBe("GitHub");
  });

  describe("file get", () => {
    it("gets a repository file", async () => {
      const content = Buffer.from("# Hello").toString("base64");
      defaultResponse = mockGithubResponse({
        name: "README.md",
        path: "README.md",
        content,
        encoding: "base64",
        sha: "abc123",
      });
      const out = await run(
        {
          resource: "file",
          operation: "get",
          owner: "acme",
          repository: "widget",
          filePath: "README.md",
          branch: "main",
        },
        [{ json: { owner: "acme", repo: "widget", path: "README.md", branch: "main" } }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/repos/acme/widget/contents/README.md");
      expect(calls[0].url).toContain("ref=main");
      expect(calls[0].headers["Authorization"]).toBe("Bearer ghp_abc123");
      expect(out[0][0].json).toMatchObject({ name: "README.md", content });
    });
  });

  describe("file create", () => {
    it("creates a file with commit", async () => {
      defaultResponse = mockGithubResponse({
        content: { name: "hello.txt", path: "docs/hello.txt" },
        commit: { sha: "def456" },
      });
      const out = await run(
        {
          resource: "file",
          operation: "create",
          owner: "acme",
          repository: "widget",
          filePath: "docs/hello.txt",
          branch: "main",
          content: "hello\n",
          commitMessage: "Add greeting",
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PUT");
      expect(calls[0].url).toContain("/repos/acme/widget/contents/docs%2Fhello.txt");
      const body = JSON.parse(calls[0].body!);
      expect(body.message).toBe("Add greeting");
      expect(body.content).toBe(Buffer.from("hello\n").toString("base64"));
      expect(body.branch).toBe("main");
      expect(out[0][0].json).toMatchObject({ content: { name: "hello.txt" } });
    });
  });

  describe("issue create and comment", () => {
    it("creates an issue", async () => {
      defaultResponse = mockGithubResponse({
        id: 42,
        number: 1,
        title: "Bug report",
        body: "The widget crashes on startup.",
        state: "open",
      });
      const out = await run(
        {
          resource: "issue",
          operation: "create",
          owner: "acme",
          repository: "widget",
          title: "Bug report",
          body: "The widget crashes on startup.",
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/repos/acme/widget/issues");
      const body = JSON.parse(calls[0].body!);
      expect(body.title).toBe("Bug report");
      expect(body.body).toBe("The widget crashes on startup.");
      expect(out[0][0].json).toMatchObject({ id: 42, title: "Bug report" });
    });
  });

  describe("release getAll with limit", () => {
    it("lists releases with a bound", async () => {
      defaultResponse = mockGithubResponse([
        { tag_name: "v1.0", name: "Version 1.0" },
        { tag_name: "v1.1", name: "Version 1.1" },
        { tag_name: "v2.0", name: "Version 2.0" },
      ]);
      const out = await run(
        {
          resource: "release",
          operation: "getAll",
          owner: "acme",
          repository: "widget",
          returnAll: false,
          limit: 2,
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/repos/acme/widget/releases");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ tag_name: "v1.0" });
      expect(out[0][1].json).toMatchObject({ tag_name: "v1.1" });
    });
  });

  describe("workflow dispatch", () => {
    it("dispatches a workflow", async () => {
      defaultResponse = mockGithubResponse({});
      const out = await run(
        {
          resource: "workflow",
          operation: "dispatch",
          owner: "acme",
          repository: "widget",
          workflowId: "ci.yml",
          dispatchRef: "main",
          dispatchInputs: JSON.stringify({ environment: "production" }),
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/repos/acme/widget/actions/workflows/ci.yml/dispatches");
      const body = JSON.parse(calls[0].body!);
      expect(body.ref).toBe("main");
      expect(body.inputs).toMatchObject({ environment: "production" });
      expect(out[0][0].json).toBeDefined();
    });
  });

  describe("errors", () => {
    it("throws on 404 with meaningful message", async () => {
      defaultResponse = mockGithubError(404, "Not Found");
      await expect(
        run(
          {
            resource: "file",
            operation: "get",
            owner: "acme",
            repository: "widget",
            filePath: "nonexistent.md",
            branch: "main",
          },
          [{ json: {} }],
        ),
      ).rejects.toThrow("Not Found");
    });

    it("continueOnFail returns error items", async () => {
      defaultResponse = mockGithubError(404, "Not Found");
      const out = await run(
        {
          resource: "file",
          operation: "get",
          owner: "acme",
          repository: "widget",
          filePath: "nonexistent.md",
          branch: "main",
        },
        [{ json: {} }],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect(out[0][0].json.error).toMatchObject({ message: "Not Found" });
    });

    it("throws on missing credential", async () => {
      await expect(
        run(
          {
            resource: "file",
            operation: "get",
            owner: "acme",
            repository: "widget",
            filePath: "test.md",
            branch: "main",
          },
          [{ json: {} }],
          { credentials: {} },
        ),
      ).rejects.toThrow("GitHub: githubApi credential is not configured");
    });

    it("processes multiple input items", async () => {
      defaultResponse = mockGithubResponse({
        name: "test.txt",
        content: Buffer.from("data").toString("base64"),
      });
      const out = await run(
        {
          resource: "file",
          operation: "get",
          owner: "acme",
          repository: "widget",
          filePath: "test.txt",
          branch: "main",
        },
        [{ json: { a: 1 } }, { json: { a: 2 } }],
      );
      expect(out[0]).toHaveLength(2);
      expect(calls).toHaveLength(2);
    });
  });
});
