import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.gitlab";

function mockGitlabResponse(data: unknown) {
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

function mockGitlabError(status: number, message: string) {
  const body = JSON.stringify({ error: message });
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

let defaultResponse: ReturnType<typeof mockGitlabResponse>;

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
  gitlabApi: { server: "https://gitlab.com", accessToken: "glpat_abc123" },
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

describe("batch-queue gitlab — n8n-nodes-base.gitlab", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("GitLab");
  });

  describe("file get", () => {
    it("gets a repository file", async () => {
      defaultResponse = mockGitlabResponse({
        file_name: "README.md",
        file_path: "README.md",
        size: 1024,
        encoding: "base64",
        content: Buffer.from("# Hello").toString("base64"),
        ref: "main",
      });
      const out = await run(
        {
          resource: "file",
          operation: "get",
          project: "acme%2Fwidget",
          filePath: "README.md",
          ref: "main",
        },
        [{ json: { project: "acme%2Fwidget", path: "README.md", ref: "main" } }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/api/v4/projects/acme%252Fwidget/repository/files/README.md");
      expect(calls[0].url).toContain("ref=main");
      expect(calls[0].headers["PRIVATE-TOKEN"]).toBe("glpat_abc123");
      expect(out[0][0].json).toMatchObject({ file_name: "README.md" });
    });
  });

  describe("file create", () => {
    it("creates a file with commit", async () => {
      defaultResponse = mockGitlabResponse({
        file_path: "docs/hello.txt",
        branch: "main",
        commit_id: "abc123",
      });
      const out = await run(
        {
          resource: "file",
          operation: "create",
          project: "acme/widget",
          filePath: "docs/hello.txt",
          branch: "main",
          content: "hello\n",
          commitMessage: "Add greeting",
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/api/v4/projects/acme%2Fwidget/repository/files/docs%2Fhello.txt");
      const body = JSON.parse(calls[0].body!);
      expect(body.branch).toBe("main");
      expect(body.content).toBe("hello\n");
      expect(body.commit_message).toBe("Add greeting");
      expect(out[0][0].json).toMatchObject({ file_path: "docs/hello.txt" });
    });
  });

  describe("issue createComment", () => {
    it("creates a comment on an issue", async () => {
      defaultResponse = mockGitlabResponse({
        id: 42,
        body: "Investigated in the latest run.",
        noteable_iid: 7,
      });
      const out = await run(
        {
          resource: "issue",
          operation: "createComment",
          project: "acme/widget",
          issueIid: 7,
          body: "Investigated in the latest run.",
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/api/v4/projects/acme%2Fwidget/issues/7/notes");
      const body = JSON.parse(calls[0].body!);
      expect(body.body).toBe("Investigated in the latest run.");
      expect(out[0][0].json).toMatchObject({ id: 42, body: "Investigated in the latest run." });
    });
  });

  describe("release getAll with limit", () => {
    it("lists releases with a bound", async () => {
      defaultResponse = mockGitlabResponse([
        { tag_name: "v1.0", name: "Version 1.0" },
        { tag_name: "v1.1", name: "Version 1.1" },
        { tag_name: "v2.0", name: "Version 2.0" },
      ]);
      const out = await run(
        {
          resource: "release",
          operation: "getAll",
          project: "acme/widget",
          returnAll: false,
          limit: 2,
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/api/v4/projects/acme%2Fwidget/releases");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ tag_name: "v1.0" });
      expect(out[0][1].json).toMatchObject({ tag_name: "v1.1" });
    });
  });

  describe("errors", () => {
    it("throws on 404 with meaningful message", async () => {
      defaultResponse = mockGitlabError(404, "404 Not Found");
      await expect(
        run(
          {
            resource: "file",
            operation: "get",
            project: "acme/widget",
            filePath: "nonexistent.md",
            ref: "main",
          },
          [{ json: {} }],
        ),
      ).rejects.toThrow("404 Not Found");
    });

    it("continueOnFail returns error items", async () => {
      defaultResponse = mockGitlabError(404, "404 Not Found");
      const out = await run(
        {
          resource: "file",
          operation: "get",
          project: "acme/widget",
          filePath: "nonexistent.md",
          ref: "main",
        },
        [{ json: {} }],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect(out[0][0].json.error).toMatchObject({ message: "404 Not Found" });
    });

    it("throws on missing credential", async () => {
      await expect(
        run(
          {
            resource: "file",
            operation: "get",
            project: "acme/widget",
            filePath: "test.md",
            ref: "main",
          },
          [{ json: {} }],
          { credentials: {} },
        ),
      ).rejects.toThrow("GitLab: gitlabApi credential is not configured");
    });

    it("processes multiple input items", async () => {
      defaultResponse = mockGitlabResponse({
        file_name: "test.txt",
        content: Buffer.from("data").toString("base64"),
      });
      const out = await run(
        {
          resource: "file",
          operation: "get",
          project: "acme/widget",
          filePath: "test.txt",
          ref: "main",
        },
        [{ json: { a: 1 } }, { json: { a: 2 } }],
      );
      expect(out[0]).toHaveLength(2);
      expect(calls).toHaveLength(2);
    });
  });
});