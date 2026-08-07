import { describe, it, expect, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.elasticSecurityTool";

const CREDENTIALS = {
  elasticSecurityApi: {
    baseUrl: "https://elastic.example.com",
    apiKey: "test-api-key",
  },
};

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : status === 204 ? "No Content" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
  headers: Record<string, string>;
}

let calls: FetchCall[];

function installFetch(responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({})) {
  const responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const body = typeof init?.body === "string" ? init.body : init?.body ? JSON.stringify(init.body) : undefined;
    const headers = (init?.headers as Record<string, string>) ?? {};
    calls.push({ url: String(url), method: init?.method ?? "GET", body, headers });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

describe("batch-queue elasticSecurityTool — n8n-nodes-base.elasticSecurityTool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has a description", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
  });

  it("creates a case", async () => {
    installFetch(mockResponse({ id: "case_001", title: "Test case from n8n", description: "Automated test case", status: "open", totalCommentCount: 0, totalAlerts: 0 }));
    const output = await runNode(TYPE, {
      resource: "case",
      operation: "create",
      title: "Test case from n8n",
      description: "Automated test case",
      connector: { id: "none", name: "none", type: ".none", fields: null },
    }, [{}], { credentials: CREDENTIALS });
    expect(output).toHaveLength(1);
    expect(output[0]).toHaveLength(1);
    const result = output[0][0].json as Record<string, unknown>;
    expect(result.id).toBe("case_001");
    expect(result.title).toBe("Test case from n8n");
    expect(lastCall().method).toBe("POST");
    expect(lastCall().url).toContain("/api/cases");
  });

  it("gets all cases with pagination", async () => {
    installFetch(mockResponse({ page: 1, perPage: 10, total: 2, cases: [{ id: "case_001" }, { id: "case_002" }] }));
    const output = await runNode(TYPE, {
      resource: "case",
      operation: "getAll",
      page: 1,
      perPage: 10,
    }, [{}], { credentials: CREDENTIALS });
    expect(output[0]).toHaveLength(2);
    expect(lastCall().url).toContain("page=1");
    expect(lastCall().url).toContain("perPage=10");
  });

  it("adds a case tag", async () => {
    installFetch(mockResponse({ id: "case_001", tags: ["critical"] }));
    const output = await runNode(TYPE, {
      resource: "caseTag",
      operation: "add",
      caseId: "={{ $json.caseId }}",
      tag: "critical",
    }, [{ caseId: "existing_case" }], { credentials: CREDENTIALS });
    expect(output).toHaveLength(1);
    expect(lastCall().method).toBe("POST");
    expect(lastCall().url).toContain("/api/cases/existing_case/tags");
  });

  it("creates a case comment", async () => {
    installFetch(mockResponse({ id: "comment_001", comment: "Updated via n8n automation", caseId: "existing_case" }));
    const output = await runNode(TYPE, {
      resource: "caseComment",
      operation: "create",
      caseId: "={{ $json.caseId }}",
      comment: "Updated via n8n automation",
    }, [{ caseId: "existing_case" }], { credentials: CREDENTIALS });
    expect(output).toHaveLength(1);
    expect(lastCall().method).toBe("POST");
    expect(lastCall().url).toContain("/api/cases/existing_case/comments");
  });

  it("gets case summary", async () => {
    installFetch(mockResponse({ totalComments: 3, totalAlerts: 1, userActions: [{ action: "created", user: "test" }] }));
    const output = await runNode(TYPE, {
      resource: "case",
      operation: "getSummary",
      caseId: "={{ $json.caseId }}",
    }, [{ caseId: "existing_case" }], { credentials: CREDENTIALS });
    expect(output).toHaveLength(1);
    const result = output[0][0].json as Record<string, unknown>;
    expect(result.totalComments).toBe(3);
    expect(lastCall().url).toContain("/api/cases/existing_case/summary");
  });

  it("throws on missing caseId for delete", async () => {
    await expect(runNode(TYPE, {
      resource: "case",
      operation: "delete",
    }, [{}], { credentials: CREDENTIALS })).rejects.toThrow();
  });
});
