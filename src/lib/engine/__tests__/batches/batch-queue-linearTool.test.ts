import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.linearTool";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function mockGraphqlResponse(data: unknown, errors?: unknown) {
  const res: Record<string, unknown> = {};
  if (data !== undefined) res.data = data;
  if (errors) res.errors = errors;
  return {
    status: errors ? 200 : 200,
    statusText: "OK",
    ok: true,
    headers: { get: () => "application/json", entries: () => [] as [string, string][] },
    async json() { return res; },
    async text() { return JSON.stringify(res); },
  };
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockGraphqlResponse>>;

function installFetch(
  ...responses: ReturnType<typeof mockGraphqlResponse>[]
) {
  responseQueue = responses.length ? [...responses] : [mockGraphqlResponse({})];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const next = responseQueue.shift() ?? mockGraphqlResponse({});
      return next;
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

const CREDS = { linearApi: { apiKey: "lin_api_test_token" } };

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

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue linearTool — n8n-nodes-base.linearTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Linear (AI Tool)");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.linearTool")).toBe(canonical);
  });

  it("issue.create — creates an issue", async () => {
    installFetch(
      mockGraphqlResponse({
        issueCreate: {
          issue: { id: "issue-1", title: "Bug report via AI", description: null, priority: 2 },
        },
      }),
    );

    const out = await run({
      resource: "issue",
      operation: "create",
      issueFields: {
        title: "Bug report via AI",
        teamId: "team-abc",
        priority: 2,
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.linear.app/graphql");
    expect(calls[0].headers.Authorization).toBe("Bearer lin_api_test_token");

    const graphqlBody = JSON.parse(calls[0].body!);
    expect(graphqlBody.query).toContain("issueCreate");
    expect(graphqlBody.variables.input.teamId).toBe("team-abc");
    expect(graphqlBody.variables.input.title).toBe("Bug report via AI");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("issue-1");
    expect(out[0][0].json.title).toBe("Bug report via AI");
  });

  it("issue.create — resolves expressions from input items", async () => {
    installFetch(
      mockGraphqlResponse({
        issueCreate: {
          issue: { id: "issue-2", title: "Dynamic title", priority: 1 },
        },
      }),
    );

    const out = await run(
      {
        resource: "issue",
        operation: "create",
        issueFields: {
          title: "={{ $json.title }}",
          teamId: "={{ $json.team }}",
          priority: "={{ $json.prio }}",
        },
      },
      [{ json: { team: "team-456", title: "Dynamic title", prio: 1 } }],
    );

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.variables.input.teamId).toBe("team-456");
    expect(body.variables.input.title).toBe("Dynamic title");
    expect(body.variables.input.priority).toBe(1);

    expect(out[0][0].json.id).toBe("issue-2");
  });

  it("issue.create — fails when title is missing", async () => {
    await expect(
      run({
        resource: "issue",
        operation: "create",
        issueFields: { teamId: "team-abc" },
      }),
    ).rejects.toThrow(/title/);
  });

  it("issue.create — fallback to top-level teamId", async () => {
    installFetch(
      mockGraphqlResponse({
        issueCreate: {
          issue: { id: "issue-fb", title: "Fallback" },
        },
      }),
    );

    const out = await run({
      resource: "issue",
      operation: "create",
      teamId: "team-fallback",
      issueFields: { title: "Fallback" },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.variables.input.teamId).toBe("team-fallback");
    expect(body.variables.input.title).toBe("Fallback");
    expect(out[0][0].json.id).toBe("issue-fb");
  });

  it("issue.get — fetches an issue using issueIdentifier", async () => {
    installFetch(
      mockGraphqlResponse({
        issue: { id: "ISS-456", title: "Found issue", description: "Details", priority: 2, url: "https://linear.app/issue/456" },
      }),
    );

    const out = await run({
      resource: "issue",
      operation: "get",
      issueIdentifier: "ISS-456",
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.query).toContain("issue(id:");
    expect(body.variables.id).toBe("ISS-456");
    expect(out[0][0].json.id).toBe("ISS-456");
  });

  it("issue.get — resolves issueIdentifier from input", async () => {
    installFetch(
      mockGraphqlResponse({
        issue: { id: "ISS-789", title: "Resolved" },
      }),
    );

    const out = await run(
      {
        resource: "issue",
        operation: "get",
        issueIdentifier: "={{ $json.issueId }}",
      },
      [{ json: { issueId: "ISS-789" } }],
    );

    const body = JSON.parse(calls[0].body!);
    expect(body.variables.id).toBe("ISS-789");
    expect(out[0][0].json.id).toBe("ISS-789");
  });

  it("issue.update — updates an issue", async () => {
    installFetch(
      mockGraphqlResponse({
        issueUpdate: {
          issue: { id: "ISS-123", title: "Updated title", priority: 3 },
        },
      }),
    );

    const out = await run({
      resource: "issue",
      operation: "update",
      issueIdentifier: "ISS-123",
      issueFields: {
        title: "Updated title",
        priority: 3,
      },
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.query).toContain("issueUpdate");
    expect(body.variables.id).toBe("ISS-123");
    expect(body.variables.input.title).toBe("Updated title");
    expect(body.variables.input.priority).toBe(3);
    expect(out[0][0].json.id).toBe("ISS-123");
  });

  it("issue.delete — deletes an issue", async () => {
    installFetch(
      mockGraphqlResponse({
        issueDelete: { success: true },
      }),
    );

    const out = await run({
      resource: "issue",
      operation: "delete",
      issueIdentifier: "ISS-to-delete",
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.query).toContain("issueDelete");
    expect(body.variables.id).toBe("ISS-to-delete");
    expect(out[0][0].json.success).toBe(true);
  });

  it("issue.getAll — retrieves issues with default limit", async () => {
    installFetch(
      mockGraphqlResponse({
        issues: {
          nodes: [
            { id: "i1", title: "Issue 1", priority: 1 },
            { id: "i2", title: "Issue 2", priority: 1 },
          ],
        },
      }),
    );

    const out = await run({
      resource: "issue",
      operation: "getAll",
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.query).toContain("issues(first:");
    expect(body.variables.first).toBe(10);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("i1");
    expect(out[0][1].json.id).toBe("i2");
  });

  it("issue.getAll — getMany alias works", async () => {
    installFetch(
      mockGraphqlResponse({
        issues: {
          nodes: [{ id: "i3", title: "Alias" }],
        },
      }),
    );

    const out = await run({
      resource: "issue",
      operation: "getMany",
      limit: 50,
    });

    expect(calls).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("i3");
  });

  it("issue.getAll — respects returnAll", async () => {
    installFetch(
      mockGraphqlResponse({
        issues: {
          nodes: [
            { id: "a", title: "A" },
            { id: "b", title: "B" },
            { id: "c", title: "C" },
          ],
        },
      }),
    );

    const out = await run({
      resource: "issue",
      operation: "getAll",
      returnAll: true,
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.variables.first).toBe(250);
    expect(out[0]).toHaveLength(3);
  });

  it("issue.addLink — adds a link using issueIdentifier, linkUrl, linkTitle, linkLabel", async () => {
    installFetch(
      mockGraphqlResponse({
        attachmentCreate: {
          attachment: { id: "att-1", url: "https://example.com", title: "Reference" },
        },
      }),
    );

    const out = await run({
      resource: "issue",
      operation: "addLink",
      issueIdentifier: "ISS-1",
      linkUrl: "https://example.com",
      linkTitle: "Link Title",
      linkLabel: "Reference",
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.query).toContain("attachmentCreate");
    expect(body.variables.input.issueId).toBe("ISS-1");
    expect(body.variables.input.url).toBe("https://example.com");
    expect(body.variables.input.title).toBe("Link Title");
    expect(out[0][0].json.id).toBe("att-1");
  });

  it("comment.addComment — adds a comment using issueIdentifier and commentBody", async () => {
    installFetch(
      mockGraphqlResponse({
        commentCreate: {
          comment: { id: "comment-1", body: "Reviewed by AI agent" },
        },
      }),
    );

    const out = await run({
      resource: "comment",
      operation: "addComment",
      issueIdentifier: "ISS-456",
      commentBody: "Reviewed by AI agent",
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.query).toContain("commentCreate");
    expect(body.variables.input.issueId).toBe("ISS-456");
    expect(body.variables.input.body).toBe("Reviewed by AI agent");
    expect(out[0][0].json.id).toBe("comment-1");
    expect(out[0][0].json.body).toBe("Reviewed by AI agent");
  });

  it("comment.addComment — supports optional parentCommentId", async () => {
    installFetch(
      mockGraphqlResponse({
        commentCreate: {
          comment: { id: "c-2", body: "Reply" },
        },
      }),
    );

    const out = await run({
      resource: "comment",
      operation: "addComment",
      issueIdentifier: "ISS-456",
      commentBody: "Reply",
      parentCommentId: "parent-1",
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.variables.input.parentId).toBe("parent-1");
    expect(out[0][0].json.id).toBe("c-2");
  });

  it("fails when credential is missing", async () => {
    await expect(
      run(
        { resource: "issue", operation: "get", issueIdentifier: "x" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/credential/);
  });

  it("continueOnFail yields error item", async () => {
    installFetch(
      mockGraphqlResponse(undefined, [{ message: "Resource not found" }]),
    );

    const out = await run(
      {
        resource: "issue",
        operation: "get",
        issueIdentifier: "nonexistent-id",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/Linear/);
  });
});
