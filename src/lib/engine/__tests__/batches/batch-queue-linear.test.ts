import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.linear";

function mockGraphqlResponse(data: Record<string, unknown>) {
  const body = JSON.stringify({ data });
  return {
    status: 200,
    statusText: "OK",
    ok: true,
    headers: { get() { return "application/json"; }, entries() { return new Map(); } },
    async json() { return JSON.parse(body); },
    async text() { return body; },
  };
}

function mockGraphqlError(errors: Array<{ message: string }>) {
  const body = JSON.stringify({ errors });
  return {
    status: 200,
    statusText: "OK",
    ok: true,
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

let defaultResponse: ReturnType<typeof mockGraphqlResponse>;

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
  linearApi: { apiKey: "lin_api_key_abc123" },
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

describe("batch-queue linear — n8n-nodes-base.linear", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Linear");
  });

  describe("issue create", () => {
    it("creates an issue", async () => {
      defaultResponse = mockGraphqlResponse({
        issueCreate: { issue: { id: "issue-1", title: "Investigate timeout", description: null, priority: 0 } },
      });
      const out = await run(
        {
          resource: "issue",
          operation: "create",
          issueFields: JSON.stringify({ title: "Investigate timeout", team: "team-123" }),
        },
        [{ json: { title: "Investigate timeout" } }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.linear.app/graphql");
      expect(calls[0].method).toBe("POST");
      expect(calls[0].headers["Authorization"]).toBe("Bearer lin_api_key_abc123");
      const body = JSON.parse(calls[0].body!);
      expect(body.query).toContain("issueCreate");
      expect(body.variables.input.title).toBe("Investigate timeout");
      expect(body.variables.input.teamId).toBe("team-123");
      expect(out[0][0].json).toMatchObject({ id: "issue-1", title: "Investigate timeout" });
    });
  });

  describe("issue get", () => {
    it("gets an issue by identifier", async () => {
      defaultResponse = mockGraphqlResponse({
        issue: { id: "issue-123", title: "Test Issue", description: "Test desc", priority: 2, url: "https://linear.app/issue/test" },
      });
      const out = await run(
        { resource: "issue", operation: "get", issueIdentifier: "issue-123" },
        [{ json: { issueId: "issue-123" } }],
      );
      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body.query).toContain("issue(id:");
      expect(body.variables.id).toBe("issue-123");
      expect(out[0][0].json).toMatchObject({ id: "issue-123", title: "Test Issue" });
    });
  });

  describe("issue update", () => {
    it("updates an issue", async () => {
      defaultResponse = mockGraphqlResponse({
        issueUpdate: { issue: { id: "issue-123", title: "Resolved timeout", description: null, priority: 0 } },
      });
      const out = await run(
        {
          resource: "issue",
          operation: "update",
          issueIdentifier: "issue-123",
          issueFields: JSON.stringify({ title: "Resolved timeout" }),
        },
        [{ json: { issueId: "issue-123", newTitle: "Resolved timeout" } }],
      );
      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body.query).toContain("issueUpdate");
      expect(body.variables.id).toBe("issue-123");
      expect(body.variables.input.title).toBe("Resolved timeout");
      expect(out[0][0].json).toMatchObject({ id: "issue-123" });
    });
  });

  describe("issue delete", () => {
    it("deletes an issue", async () => {
      defaultResponse = mockGraphqlResponse({
        issueDelete: { success: true },
      });
      const out = await run(
        { resource: "issue", operation: "delete", issueIdentifier: "issue-123" },
        [{ json: { issueId: "issue-123" } }],
      );
      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body.query).toContain("issueDelete");
      expect(body.variables.id).toBe("issue-123");
      expect(out[0][0].json).toMatchObject({ success: true });
    });
  });

  describe("comment addComment", () => {
    it("adds a comment to an issue", async () => {
      defaultResponse = mockGraphqlResponse({
        commentCreate: { comment: { id: "comment-1", body: "Reviewed by automation" } },
      });
      const out = await run(
        {
          resource: "comment",
          operation: "addComment",
          issueIdentifier: "issue-123",
          commentBody: "Reviewed by automation",
        },
        [{ json: { issueId: "issue-123", message: "Reviewed by automation" } }],
      );
      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body.query).toContain("commentCreate");
      expect(body.variables.input.issueId).toBe("issue-123");
      expect(body.variables.input.body).toBe("Reviewed by automation");
      expect(out[0][0].json).toMatchObject({ id: "comment-1", body: "Reviewed by automation" });
    });
  });

  describe("errors", () => {
    it("throws on GraphQL error", async () => {
      defaultResponse = mockGraphqlError([{ message: "Resource not found" }]);
      await expect(
        run(
          { resource: "issue", operation: "get", issueIdentifier: "nonexistent" },
          [{ json: {} }],
        ),
      ).rejects.toThrow("Resource not found");
    });

    it("continueOnFail returns error items", async () => {
      defaultResponse = mockGraphqlError([{ message: "Resource not found" }]);
      const out = await run(
        { resource: "issue", operation: "get", issueIdentifier: "nonexistent" },
        [{ json: {} }],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect(String(out[0][0].json.error)).toContain("Resource not found");
    });

    it("throws on missing credential", async () => {
      await expect(
        run(
          { resource: "issue", operation: "create", issueFields: JSON.stringify({ title: "test", team: "team-1" }) },
          [{ json: {} }],
          { credentials: {} },
        ),
      ).rejects.toThrow("Linear: credential with apiKey or accessToken is required");
    });

    it("processes multiple input items", async () => {
      defaultResponse = mockGraphqlResponse({
        issueCreate: { issue: { id: "issue-1", title: "Test", description: null, priority: 0 } },
      });
      const out = await run(
        { resource: "issue", operation: "create", issueFields: JSON.stringify({ title: "Test", team: "team-1" }) },
        [{ json: { title: "A" } }, { json: { title: "B" } }],
      );
      expect(out[0]).toHaveLength(2);
      expect(calls).toHaveLength(2);
    });
  });
});