import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.githubTool";

function mockGithubResponse(data: unknown) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  return {
    status: 200,
    statusText: "OK",
    ok: true,
    headers: {
      get() {
        return "application/json";
      },
      entries() {
        return new Map();
      },
    },
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
  };
}

function mockGithubError(status: number, message: string) {
  const body = JSON.stringify({ message });
  return {
    status,
    statusText: "Error",
    ok: false,
    headers: {
      get() {
        return "application/json";
      },
      entries() {
        return new Map();
      },
    },
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
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

describe("batch-queue githubTool — n8n-nodes-base.githubTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).not.toBeUndefined();
    expect(getNodeType(TYPE).displayName).toBe("GitHub Tool");
  });

  describe("issue create", () => {
    it("creates an issue with static params", async () => {
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
        [{ json: { owner: "acme", repo: "widget" } }],
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

  describe("file listing (getAll)", () => {
    it("lists files in a repository path", async () => {
      defaultResponse = mockGithubResponse([
        { name: "index.ts", type: "file", path: "src/index.ts" },
        { name: "util.ts", type: "file", path: "src/util.ts" },
      ]);
      const out = await run(
        {
          resource: "file",
          operation: "getAll",
          owner: "acme",
          repository: "widget",
          filePath: "src/",
          branch: "main",
          returnAll: false,
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/repos/acme/widget/contents/src%2F");
      expect(calls[0].url).toContain("ref=main");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ name: "index.ts" });
    });
  });

  describe("workflow dispatch", () => {
    it("dispatches a workflow with object inputs", async () => {
      defaultResponse = mockGithubResponse({});
      const out = await run(
        {
          resource: "workflow",
          operation: "dispatch",
          owner: "acme",
          repository: "widget",
          workflowId: "ci.yml",
          dispatchRef: "main",
          dispatchInputs: { environment: "staging" },
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/repos/acme/widget/actions/workflows/ci.yml/dispatches");
      const body = JSON.parse(calls[0].body!);
      expect(body.ref).toBe("main");
      expect(body.inputs).toMatchObject({ environment: "staging" });
      expect(out[0][0].json).toBeDefined();
    });

    it("dispatches a workflow with JSON string inputs", async () => {
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
      const body = JSON.parse(calls[0].body!);
      expect(body.inputs).toMatchObject({ environment: "production" });
    });
  });

  describe("release create", () => {
    it("creates a release with tag and releaseBody", async () => {
      defaultResponse = mockGithubResponse({
        id: 1,
        tag_name: "v1.2.3",
        name: "v1.2.3",
        body: "Release notes",
      });
      const out = await run(
        {
          resource: "release",
          operation: "create",
          owner: "acme",
          repository: "widget",
          tag: "v1.2.3",
          releaseName: "v1.2.3",
          releaseBody: "Release notes",
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/repos/acme/widget/releases");
      const body = JSON.parse(calls[0].body!);
      expect(body.tag_name).toBe("v1.2.3");
      expect(body.name).toBe("v1.2.3");
      expect(body.body).toBe("Release notes");
      expect(out[0][0].json).toMatchObject({ id: 1, tag_name: "v1.2.3" });
    });
  });

  describe("errors with continueOnFail multi-item", () => {
    it("handles two items where first 404s and second succeeds", async () => {
      const firstResp = mockGithubError(404, "Not Found");
      const secondResp = mockGithubResponse({
        id: 1,
        tag_name: "v1.0",
        name: "v1.0",
      });
      const callOrder: number[] = [];
      vi.unstubAllGlobals();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, _init: RequestInit | undefined) => {
          callOrder.push(calls.length);
          const idx = calls.length;
          calls.push({
            url: String(_url),
            method: "POST",
            headers: {},
            body: undefined,
          });
          return idx === 0 ? firstResp : secondResp;
        }),
      );
      const out = await run(
        {
          resource: "release",
          operation: "create",
          owner: "acme",
          repository: "widget",
          tag: "v1.0",
          releaseName: "v1.0",
        },
        [{ json: { a: 1 } }, { json: { a: 2 } }],
        { continueOnFail: true, credentials: CREDS },
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toHaveProperty("error");
      expect(out[0][0].json.error).toMatchObject({ message: "Not Found" });
      expect(out[0][1].json).toMatchObject({ tag_name: "v1.0" });
    });
  });

  it("emits a github handle when there are no main items", async () => {
    defaultResponse = mockGithubResponse({ name: "widget", full_name: "acme/widget" });
    const out = await run({ resource: "repository", operation: "get" }, []);
    const handle = out[0][0].json as {
      name: string;
      invoke: (args: Record<string, unknown>) => Promise<string>;
    };
    expect(handle.name).toBe("github");
    const body = await handle.invoke({ owner: "acme", repo: "widget" });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/repos/acme/widget");
    expect(body).toContain("acme/widget");
  });
});
