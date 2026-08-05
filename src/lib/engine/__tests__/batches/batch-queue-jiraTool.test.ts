import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.jiraTool";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof vi.fn>>;

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function installFetch(responses: Array<ReturnType<typeof vi.fn>> = [mockResponse({})]) {
  responseQueue = [...responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return responseQueue.shift() ?? mockResponse({});
  }));
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
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { jiraSoftwareCloudApi: { instance: "test", email: "bot@test.com", apiToken: "token123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue jiraTool — n8n-nodes-base.jiraTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Jira Software (AI Tool)");
  });

  it("creates an issue", async () => {
    const apiResponse = { id: "10001", key: "EX-123", self: "https://test.atlassian.net/rest/api/2/issue/10001" };
    installFetch([mockResponse(apiResponse)]);

    const [output] = await run({
      resource: "issue",
      operation: "create",
      project: "EX",
      issueType: "Task",
      summary: "Test issue",
      description: "Created by test",
    });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/rest/api/2/issue");
    const body = JSON.parse(calls[0].body!);
    expect(body.fields.project.key).toBe("EX");
    expect(body.fields.issuetype.name).toBe("Task");
    expect(body.fields.summary).toBe("Test issue");
    expect(body.fields.description).toBe("Created by test");

    expect(output.length).toBe(1);
    expect(output[0].json.id).toBe("10001");
    expect(output[0].json.key).toBe("EX-123");
  });

  it("gets an issue", async () => {
    const apiResponse = { id: "10001", key: "EX-123", fields: { summary: "Test issue" } };
    installFetch([mockResponse(apiResponse)]);

    const [output] = await run({
      resource: "issue",
      operation: "get",
      issueId: "EX-123",
    });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/rest/api/2/issue/EX-123");

    expect(output.length).toBe(1);
    expect(output[0].json.key).toBe("EX-123");
    expect((output[0].json.fields as Record<string, unknown>).summary).toBe("Test issue");
  });

  it("deletes an issue", async () => {
    installFetch([mockResponse({}, 204)]);

    const [output] = await run({
      resource: "issue",
      operation: "delete",
      issueId: "EX-123",
    });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/rest/api/2/issue/EX-123");

    expect(output.length).toBe(1);
    expect(output[0].json.success).toBe(true);
  });

  it("adds a comment to an issue", async () => {
    const apiResponse = { id: "20001", body: { content: [{ content: [{ text: "Test comment" }] }] }, created: "2024-01-01T00:00:00.000Z" };
    installFetch([mockResponse(apiResponse)]);

    const [output] = await run({
      resource: "issueComment",
      operation: "add",
      issueId: "EX-123",
      comment: "Test comment",
    });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/rest/api/2/issue/EX-123/comment");

    expect(output.length).toBe(1);
    expect(output[0].json.id).toBe("20001");
  });

  it("fails when required params are missing", async () => {
    await expect(run({
      resource: "issue",
      operation: "create",
      project: "",
      issueType: "Task",
      summary: "",
    })).rejects.toThrow("Jira Tool: project is required");
  });

  it("handles continueOnFail", async () => {
    installFetch([mockResponse({ errorMessages: ["Not found"] }, 404)]);

    const [output] = await run({
      resource: "issue",
      operation: "get",
      issueId: "MISSING-1",
    }, [{}], { continueOnFail: true });

    expect(calls.length).toBe(1);
    expect(output.length).toBe(1);
    expect(output[0].json.error).toBeDefined();
    expect((output[0].json.error as Record<string, unknown>).message).toContain("Not found");
  });

  it("supports getAll issues with JQL", async () => {
    const apiResponse = {
      issues: [
        { id: "1", key: "EX-1", fields: { summary: "First" } },
        { id: "2", key: "EX-2", fields: { summary: "Second" } },
      ],
    };
    installFetch([mockResponse(apiResponse)]);

    const [output] = await run({
      resource: "issue",
      operation: "getAll",
      options: { jql: "project = EX ORDER BY created DESC" },
      returnAll: false,
      limit: 5,
    });

    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/rest/api/2/search");
    expect(calls[0].url).toContain("jql=project+%3D+EX+ORDER+BY+created+DESC");

    expect(output.length).toBe(2);
    expect(output[0].json.key).toBe("EX-1");
    expect((output[0].json.fields as Record<string, unknown>).summary).toBe("First");
    expect(output[1].json.key).toBe("EX-2");
    expect((output[1].json.fields as Record<string, unknown>).summary).toBe("Second");
  });

  it("notifies an issue with email", async () => {
    installFetch([mockResponse({})]);

    const [output] = await run({
      resource: "issue",
      operation: "notify",
      issueId: "EX-123",
      subject: "Test notification",
      textBody: "This is a test email body",
      recipients: { reporter: true, assignee: true },
    });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/rest/api/2/issue/EX-123/notify");
    const body = JSON.parse(calls[0].body!);
    expect(body.subject).toBe("Test notification");
    expect(body.textBody).toBe("This is a test email body");
    expect(body.to.reporter).toBe(true);
    expect(body.to.assignee).toBe(true);

    expect(output.length).toBe(1);
    expect(output[0].json.success).toBe(true);
  });

  it("paginates getAll with returnAll", async () => {
    const page1 = {
      issues: [
        { id: "1", key: "EX-1", fields: { summary: "One" } },
        { id: "2", key: "EX-2", fields: { summary: "Two" } },
      ],
    };
    const page2 = {
      issues: [
        { id: "3", key: "EX-3", fields: { summary: "Three" } },
      ],
    };
    const page3 = { issues: [] };
    installFetch([mockResponse(page1), mockResponse(page2), mockResponse(page3)]);

    const [output] = await run({
      resource: "issue",
      operation: "getAll",
      options: { jql: "project = EX" },
      returnAll: true,
    });

    expect(calls.length).toBe(3);
    expect(output.length).toBe(3);
    expect(output[0].json.key).toBe("EX-1");
    expect(output[1].json.key).toBe("EX-2");
    expect(output[2].json.key).toBe("EX-3");
  });
});
