import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.jira";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
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
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({})) {
  nextResponse = response;
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
      return nextResponse;
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
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { jiraSoftwareCloudApi: { instance: "example", email: "bot@example.com", apiToken: "token-123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue jira — n8n-nodes-base.jira", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Jira Software");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.jira")).toBe(canonical);
  });

  it("creates an issue", async () => {
    installFetch(
      mockResponse({ id: "10001", key: "TEST-42", self: "https://example.atlassian.net/rest/api/2/issue/10001" }),
    );
    const out = await run(
      {
        resource: "issue",
        operation: "create",
        project: "={{ $json.project }}",
        issuetype: "Bug",
        summary: "={{ $json.summary }}",
      },
      [{ project: "TEST", summary: "Bug: login fails" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://example.atlassian.net/rest/api/2/issue");
    expect(calls[0].headers["Authorization"]).toMatch(/^Basic /);
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.fields.project).toEqual({ key: "TEST" });
    expect(sentBody.fields.issuetype).toEqual({ name: "Bug" });
    expect(sentBody.fields.summary).toBe("Bug: login fails");
    expect(out[0][0].json).toEqual({
      id: "10001",
      key: "TEST-42",
      self: "https://example.atlassian.net/rest/api/2/issue/10001",
    });
  });

  it("searches issues with JQL (getAll)", async () => {
    installFetch(
      mockResponse({
        expand: "schema,names",
        startAt: 0,
        maxResults: 10,
        total: 1,
        issues: [
          {
            id: "10001",
            key: "TEST-42",
            self: "https://example.atlassian.net/rest/api/2/issue/10001",
            fields: { summary: "Bug: login fails", issuetype: { name: "Bug" }, status: { name: "Open" } },
          },
        ],
      }),
    );
    const out = await run({
      resource: "issue",
      operation: "getAll",
      jql: "project = TEST",
      returnAll: false,
      maxResults: 10,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("jql=project+%3D+TEST");
    expect(calls[0].url).toContain("maxResults=10");
    expect(out[0][0].json).toMatchObject({
      expand: "schema,names",
      startAt: 0,
      maxResults: 10,
      total: 1,
      issues: [
        { id: "10001", key: "TEST-42", fields: { summary: "Bug: login fails" } },
      ],
    });
  });

  it("adds an attachment with binary data", async () => {
    installFetch(
      mockResponse([
        {
          id: "10042",
          filename: "screenshot.png",
          mimeType: "image/png",
          size: 204800,
          author: { accountId: "12345", displayName: "Bot" },
          created: "2026-07-30T12:00:00.000+0000",
          content: "https://example.atlassian.net/rest/api/2/attachment/10042/content",
        },
      ]),
    );
    const out = await run(
      {
        resource: "issueAttachment",
        operation: "add",
        issueKey: "={{ $json.issueKey }}",
        binaryPropertyName: "file",
      },
      [
        {
          json: { issueKey: "TEST-42" },
          binary: {
            file: {
              fileName: "screenshot.png",
              mimeType: "image/png",
              data: btoa("fake-png-data"),
            },
          },
        },
      ],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://example.atlassian.net/rest/api/2/issue/TEST-42/attachments");
    expect(calls[0].headers["X-Atlassian-Token"]).toBe("no-check");
    expect(out[0][0].json).toMatchObject({
      id: "10042",
      filename: "screenshot.png",
      mimeType: "image/png",
      size: 204800,
      author: { accountId: "12345", displayName: "Bot" },
    });
  });

  it("adds a comment to an issue", async () => {
    installFetch(
      mockResponse({
        id: "10099",
        author: { accountId: "12345", displayName: "Bot" },
        body: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ text: "Fixed in latest release", type: "text" }] }],
        },
        created: "2026-07-30T12:00:00.000+0000",
        jsdPublic: false,
        self: "https://example.atlassian.net/rest/api/2/issue/TEST-42/comment/10099",
      }),
    );
    const out = await run(
      {
        resource: "issueComment",
        operation: "add",
        issueKey: "={{ $json.issueKey }}",
        comment: "Fixed in latest release",
      },
      [{ issueKey: "TEST-42" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://example.atlassian.net/rest/api/2/issue/TEST-42/comment");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.body.content[0].content[0].text).toBe("Fixed in latest release");
    expect(out[0][0].json).toMatchObject({
      id: "10099",
      author: { accountId: "12345", displayName: "Bot" },
    });
  });

  it("handles continueOnFail with error item", async () => {
    installFetch(mockResponse(
      { errorMessages: ["Issue does not exist or you do not have permission to see it."] },
      { status: 404 },
    ));
    const out = await run(
      {
        resource: "issue",
        operation: "get",
        issueKey: "NONEXISTENT-999",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toMatchObject({
      message: "Issue does not exist or you do not have permission to see it.",
      code: 404,
    });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "issue", operation: "get", issueKey: "TEST-42" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/jiraSoftwareCloudApi credential is not configured/);
  });

  it("deletes an issue", async () => {
    installFetch(mockResponse({}, { status: 204 }));
    const out = await run(
      { resource: "issue", operation: "delete", issueKey: "TEST-42" },
      [{ issueKey: "TEST-42" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://example.atlassian.net/rest/api/2/issue/TEST-42");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("gets a user by account ID", async () => {
    installFetch(
      mockResponse({
        accountId: "12345",
        displayName: "John Doe",
        emailAddress: "john@example.com",
        active: true,
        locale: "en_US",
        timeZone: "America/New_York",
        groups: { items: [] },
        applicationRoles: { items: [] },
      }),
    );
    const out = await run(
      { resource: "user", operation: "get", accountId: "12345" },
      [{ accountId: "12345" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("accountId=12345");
    expect(out[0][0].json).toMatchObject({
      accountId: "12345",
      displayName: "John Doe",
      emailAddress: "john@example.com",
    });
  });
});