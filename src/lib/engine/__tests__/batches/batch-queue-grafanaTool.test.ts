import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.grafanaTool";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function mockResponse(body: unknown, init: { status?: number; contentType?: string; headers?: Record<string, string> } = {}) {
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
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
      forEach(fn: (v: string, k: string) => void) { map.forEach((v, k) => fn(v, k)); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
    async arrayBuffer() { return Buffer.from(text); },
  };
}

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url,
      method: (init?.method as string) ?? "GET",
      headers,
      body: init?.body as string | undefined,
    });
    return responseQueue.shift() ?? mockResponse({});
  }));
}

describe("n8n-nodes-base.grafanaTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  const mockCreds = {
    grafanaApi: { apiKey: "glsa_test-key-123", baseUrl: "http://localhost:3000" },
  };

  it("creates a dashboard", async () => {
    const expectedResponse = {
      id: 1,
      uid: "cIBgcSjkk",
      title: "My Test Dashboard",
      url: "/d/cIBgcSjkk/my-test-dashboard",
      status: "success",
      version: 1,
      slug: "my-test-dashboard",
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "dashboard",
      operation: "create",
      title: "My Test Dashboard",
    }, [{}], { credentials: mockCreds });

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject(expectedResponse);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("http://localhost:3000/api/dashboards/db");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.dashboard.title).toBe("My Test Dashboard");
    expect(body.overwrite).toBe(false);
  });

  it("gets a dashboard by UID", async () => {
    const expectedResponse = {
      dashboard: {
        id: 1,
        uid: "cIBgcSjkk",
        title: "My Test Dashboard",
        panels: [],
        templating: { list: [] },
      },
      meta: {
        isStarred: false,
        slug: "my-test-dashboard",
        folderId: 0,
        folderUid: "",
        folderTitle: "General",
        version: 1,
      },
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "dashboard",
      operation: "get",
      dashboardUidOrUrl: "cIBgcSjkk",
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({
      dashboard: { uid: "cIBgcSjkk", title: "My Test Dashboard" },
      meta: { slug: "my-test-dashboard" },
    });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("http://localhost:3000/api/dashboards/uid/cIBgcSjkk");
  });

  it("lists all teams", async () => {
    const expectedResponse = {
      teams: [
        { id: 1, name: "Engineering", email: "eng@example.com", memberCount: 5, permission: 0 },
      ],
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "team",
      operation: "getAll",
      returnAll: true,
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toEqual(expectedResponse.teams);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/api/teams/search");
  });

  it("adds a team member", async () => {
    installFetch(mockResponse({}));

    const out = await runNode(TYPE, {
      resource: "teamMember",
      operation: "add",
      userId: "3",
      teamId: "1",
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toEqual({});
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("http://localhost:3000/api/teams/1/members");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.userId).toBe(3);
  });

  it("updates a user role", async () => {
    const expectedResponse = { id: 5, email: "user@example.com", role: "Editor" };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "user",
      operation: "update",
      userId: "5",
      updateFields: { role: "Editor" },
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject(expectedResponse);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe("http://localhost:3000/api/org/users/5");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.role).toBe("Editor");
  });

  it("returns error on continueOnFail", async () => {
    installFetch(mockResponse({ message: "Dashboard not found" }, { status: 404 }));

    const out = await runNode(TYPE,
      { resource: "dashboard", operation: "get", dashboardUidOrUrl: "nonexistent" },
      [{}],
      { continueOnFail: true, credentials: mockCreds },
    );

    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toHaveProperty("message");
    expect(out[0][0].json.error).toHaveProperty("statusCode");
  });
});
