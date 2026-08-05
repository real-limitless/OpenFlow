import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.clockify";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url).split("?")[0];
      calls.push({ url: String(url) });
      if (!(key in routes)) {
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(routes[key]);
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

const CREDS = { clockifyApi: { apiKey: "test_api_key" } };

beforeEach(() => {
  installFetch({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue clockify — n8n-nodes-base.clockify", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Clockify");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.clockify")).toBe(canonical);
  });

  it("create a project", async () => {
    const fakeProject = {
      id: "proj_xyz789",
      name: "My Test Project",
      workspaceId: "ws_abc123",
      clientId: null,
      billable: false,
      archived: false,
    };
    installFetch({
      "https://api.clockify.me/api/v1/workspaces/ws_abc123/projects": fakeProject,
    });
    const out = await run(
      { resource: "project", operation: "create", workspaceId: "ws_abc123", name: "My Test Project" },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeProject);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/workspaces/ws_abc123/projects");
  });

  it("create a time entry with start time", async () => {
    const fakeEntry = {
      id: "te_001",
      description: "Morning standup",
      workspaceId: "ws_abc123",
      projectId: "proj_xyz789",
      start: "2026-08-03T09:00:00Z",
      end: null,
      billable: false,
    };
    installFetch({
      "https://api.clockify.me/api/v1/workspaces/ws_abc123/time-entries": fakeEntry,
    });
    const out = await run(
      {
        resource: "timeEntry",
        operation: "create",
        workspaceId: "ws_abc123",
        start: "2026-08-03T09:00:00Z",
        additionalFields: { description: "Morning standup", projectId: "proj_xyz789" },
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeEntry);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/workspaces/ws_abc123/time-entries");
  });

  it("get all projects with pagination (returnAll=false, limit=50)", async () => {
    const fakeProjects = [
      { id: "p1", name: "Project A" },
      { id: "p2", name: "Project B" },
    ];
    installFetch({
      "https://api.clockify.me/api/v1/workspaces/ws_abc123/projects": fakeProjects,
    });
    const out = await run(
      { resource: "project", operation: "getAll", workspaceId: "ws_abc123", returnAll: false, limit: 50 },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json)).toBe(true);
    expect((out[0][0].json as unknown[]).length).toBeLessThanOrEqual(50);
    expect(calls[0].url).toContain("page-size=50");
  });

  it("delete a tag", async () => {
    const fakeDeleted = { id: "tag_001", name: "Deprecated" };
    installFetch({
      "https://api.clockify.me/api/v1/workspaces/ws_abc123/tags/tag_001": fakeDeleted,
    });
    const out = await run(
      { resource: "tag", operation: "delete", workspaceId: "ws_abc123", tagId: "tag_001" },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>).id).toBe("tag_001");
  });

  it("list all workspaces (returnAll=true)", async () => {
    const fakeWorkspaces = [
      { id: "ws_1", name: "My Workspace" },
      { id: "ws_2", name: "Team Workspace" },
    ];
    installFetch({
      "https://api.clockify.me/api/v1/workspaces": fakeWorkspaces,
    });
    const out = await run(
      { resource: "workspace", operation: "getAll", returnAll: true },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json)).toBe(true);
    expect((out[0][0].json as unknown[]).length).toBe(2);
  });

  it("multi-item input produces one output per input", async () => {
    const fakeProject = { id: "p1", name: "Test" };
    installFetch({
      "https://api.clockify.me/api/v1/workspaces/ws_abc123/projects": fakeProject,
    });
    const out = await run(
      { resource: "project", operation: "create", workspaceId: "ws_abc123", name: "Test" },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
    expect((out[0][0].json as Record<string, unknown>).id).toBe("p1");
    expect((out[0][1].json as Record<string, unknown>).id).toBe("p1");
    expect(calls).toHaveLength(2);
  });

  it("API error without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      run({ resource: "project", operation: "create", workspaceId: "ws_abc123", name: "X" }, [{}]),
    ).rejects.toThrow();
  });

  it("API error with continueOnFail yields error item", async () => {
    installFetch({});
    const out = await run(
      { resource: "project", operation: "create", workspaceId: "ws_abc123", name: "X", continueOnFail: true },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("missing credential throws descriptive error", async () => {
    installFetch({});
    await expect(
      run(
        { resource: "project", operation: "getAll", workspaceId: "" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/clockifyApi credential is not configured/i);
  });

  it("unsupported resource/operation throws", async () => {
    installFetch({});
    await expect(
      run({ resource: "workspace", operation: "create" } as Record<string, unknown>, [{}]),
    ).rejects.toThrow(/unsupported/i);
  });
});
