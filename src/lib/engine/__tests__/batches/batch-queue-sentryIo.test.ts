import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.sentryIo";

const MOCK_CREDENTIALS = { sentryIoApi: { accessToken: "test-token" } };

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : status === 204 ? "No Content" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url);
      calls.push({ url: key });
      if (!(key in routes)) {
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue sentryIo — n8n-nodes-base.sentryIo", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Sentry.io");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.sentryIo")).toBe(canonical);
  });

  it("issue — get by ID returns issue data", async () => {
    const fakeIssue = {
      id: "54321",
      title: "TypeError: Cannot read property 'x' of undefined",
      status: "unresolved",
      level: "error",
      firstSeen: "2024-01-01T00:00:00Z",
      lastSeen: "2024-06-01T00:00:00Z",
      count: 42,
      project: { id: "1", slug: "my-project", name: "My Project" },
      permalink: "https://sentry.io/organizations/my-org/issues/54321/",
    };
    installFetch({
      "https://sentry.io/api/0/issues/54321/": fakeIssue,
    });
    const out = await runNode(
      TYPE,
      { resource: "issue", operation: "get", issueId: "54321" },
      [{}],
      { credentials: MOCK_CREDENTIALS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeIssue);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sentry.io/api/0/issues/54321/");
  });

  it("release — create sends correct body", async () => {
    const fakeRelease = {
      version: "1.2.3",
      projects: ["my-project"],
      dateReleased: "2024-06-15T12:00:00Z",
    };
    installFetch({
      "https://sentry.io/api/0/organizations/my-org/releases/": fakeRelease,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "release",
        operation: "create",
        organizationSlug: "my-org",
        version: "1.2.3",
        projects: "my-project",
        url: "https://github.com/org/repo/releases/tag/v1.2.3",
        dateReleased: "2024-06-15T12:00:00Z",
      },
      [{}],
      { credentials: MOCK_CREDENTIALS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeRelease);
    expect(calls).toHaveLength(1);
  });

  it("project — getAll with query filter", async () => {
    const fakeProjects = [
      { slug: "frontend-app", name: "Frontend App", id: "1" },
      { slug: "backend-api", name: "Backend API", id: "2" },
    ];
    installFetch({
      "https://sentry.io/api/0/organizations/my-org/projects/?query=frontend": fakeProjects,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "project",
        operation: "getAll",
        organizationSlug: "my-org",
        query: "frontend",
      },
      [{}],
      { credentials: MOCK_CREDENTIALS },
    );
    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as Array<{ slug: string }>;
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("issue — update status", async () => {
    const fakeUpdated = { id: "12345", status: "resolved" };
    installFetch({
      "https://sentry.io/api/0/issues/12345/": fakeUpdated,
    });
    const out = await runNode(
      TYPE,
      { resource: "issue", operation: "update", issueId: "12345", status: "resolved" },
      [{}],
      { credentials: MOCK_CREDENTIALS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeUpdated);
    expect(calls).toHaveLength(1);
  });

  it("project — delete issues DELETE request", async () => {
    const fakeBody = { success: true };
    installFetch({
      "https://sentry.io/api/0/projects/my-org/temp-project/": fakeBody,
    });
    const out = await runNode(
      TYPE,
      { resource: "project", operation: "delete", organizationSlug: "my-org", projectSlug: "temp-project" },
      [{}],
      { credentials: MOCK_CREDENTIALS },
    );
    expect(out[0]).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sentry.io/api/0/projects/my-org/temp-project/");
  });

  it("continueOnFail with invalid resource yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "event", operation: "get", issueId: "", eventId: "" },
      [{}],
      { continueOnFail: true, credentials: MOCK_CREDENTIALS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("missing required params throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "issue", operation: "get", issueId: "" }, [{}], { credentials: MOCK_CREDENTIALS }),
    ).rejects.toThrow(/issueId is required/i);
  });

  it("organization — getAll lists organizations", async () => {
    const fakeOrgs = [{ slug: "my-org", name: "My Org" }];
    installFetch({
      "https://sentry.io/api/0/organizations/": fakeOrgs,
    });
    const out = await runNode(
      TYPE,
      { resource: "organization", operation: "getAll" },
      [{}],
      { credentials: MOCK_CREDENTIALS },
    );
    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json)).toBe(true);
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeIssue = { id: "1", title: "Test", status: "unresolved" };
    installFetch({
      "https://sentry.io/api/0/issues/1/": fakeIssue,
    });
    const out = await runNode(
      TYPE,
      { resource: "issue", operation: "get", issueId: "1" },
      [{}, {}],
      { credentials: MOCK_CREDENTIALS },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual(fakeIssue);
    expect(out[0][1].json).toEqual(fakeIssue);
    expect(calls).toHaveLength(2);
  });

  it("fetch failure without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "issue", operation: "get", issueId: "999" }, [{}], { credentials: MOCK_CREDENTIALS }),
    ).rejects.toThrow();
  });
});
