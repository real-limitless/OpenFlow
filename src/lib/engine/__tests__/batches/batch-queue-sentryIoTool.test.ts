import { describe, it, expect, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "@/lib/engine";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { sdkHttpRequest } from "@/sdk/helpers/http";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.sentryIoTool";

vi.mock("@/sdk/helpers/http", () => ({
  sdkHttpRequest: vi.fn(async (options: any) => {
    const url = options.url;
    // Issue GET by ID
    if (options.method === "GET" && /api\/0\/issues\/\d+\/$/.test(url)) {
      const id = url.match(/issues\/(\d+)\//)?.[1] ?? "0";
      return {
        status: 200,
        headers: {},
        body: { id, title: "Test Issue", status: "unresolved", level: "error", project: { id: "1", slug: "my-project" } },
      };
    }
    // Issue GET ALL
    if (options.method === "GET" && /api\/0\/projects\/.+\/.+\/issues/.test(url)) {
      return {
        status: 200,
        headers: {},
        body: [
          { id: "1", title: "TypeError", status: "unresolved", level: "error", project: { id: "1", slug: "my-project" } },
          { id: "2", title: "RangeError", status: "unresolved", level: "error", project: { id: "1", slug: "my-project" } },
        ],
      };
    }
    // Issue UPDATE
    if (options.method === "PUT" && /api\/0\/issues\/\d+\//.test(url)) {
      const id = url.match(/issues\/(\d+)\//)?.[1] ?? "0";
      return { status: 200, headers: {}, body: { id, status: options.body?.status ?? "resolved", title: "Updated Issue" } };
    }
    // Issue DELETE
    if (options.method === "DELETE" && /api\/0\/issues\/\d+\//.test(url)) {
      return { status: 200, headers: {}, body: {} };
    }
    // Organization GET ALL
    if (options.method === "GET" && /api\/0\/organizations\/$/.test(url)) {
      return {
        status: 200,
        headers: {},
        body: [
          { slug: "my-org", name: "My Org", id: "1" },
          { slug: "other-org", name: "Other Org", id: "2" },
        ],
      };
    }
    // Organization GET by slug
    if (options.method === "GET" && /api\/0\/organizations\/[^/]+\/$/.test(url)) {
      const slug = url.match(/organizations\/([^/]+)\//)?.[1] ?? "unknown";
      return { status: 200, headers: {}, body: { slug, name: "My Org", id: "1" } };
    }
    // Project GET ALL
    if (options.method === "GET" && /api\/0\/projects\/$/.test(url)) {
      return {
        status: 200,
        headers: {},
        body: [
          { id: "1", slug: "my-project", name: "My Project", platform: "javascript" },
        ],
      };
    }
    // Project GET
    if (options.method === "GET" && /api\/0\/projects\/[^/]+\/[^/]+\/$/.test(url)) {
      return { status: 200, headers: {}, body: { id: "1", slug: "my-project", name: "My Project" } };
    }
    // Release CREATE
    if (options.method === "POST" && /api\/0\/organizations\/[^/]+\/releases\/$/.test(url)) {
      return { status: 200, headers: {}, body: { version: options.body?.version ?? "1.0.0", projects: options.body?.projects ?? [], dateReleased: new Date().toISOString() } };
    }
    // Release GET
    if (options.method === "GET" && /api\/0\/organizations\/[^/]+\/releases\/[^/]+\//.test(url)) {
      return { status: 200, headers: {}, body: { version: "1.0.0", projects: ["my-project"], dateReleased: new Date().toISOString() } };
    }
    // Team GET ALL
    if (options.method === "GET" && /api\/0\/organizations\/[^/]+\/teams\/$/.test(url)) {
      return { status: 200, headers: {}, body: [{ slug: "my-team", name: "My Team", id: "1" }] };
    }
    return { status: 200, headers: {}, body: {} };
  }),
}));

function makeCtx(
  items: INodeExecutionData[],
  parameters: Record<string, unknown>,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  const node = makeNode({ name: "SentryTest", type: TYPE, parameters });
  const defaultCreds = { sentryIoApi: { accessToken: "test-token" } };
  const creds = credentials ?? defaultCreds;
  return createExecutionContext({
    node,
    workflow: { id: "test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async (name) => creds[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function runSentry(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials?: Record<string, Record<string, unknown>>,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, parameters, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue sentryIoTool — n8n-nodes-base.sentryIoTool", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Sentry.io (AI Tool)");
  });

  it("gets issue by ID", async () => {
    const out = await runSentry(
      { resource: "issue", operation: "get", issueId: "54321" },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("id", "54321");
    expect(out[0][0].json).toHaveProperty("title");
    expect(out[0][0].json).toHaveProperty("status");
  });

  it("gets all issues with status and query", async () => {
    const out = await runSentry(
      { resource: "issue", operation: "getAll", organizationSlug: "my-org", projectSlug: "my-project", status: "unresolved", query: "is:unresolved TypeError" },
      [{ json: {} }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("id");
    expect(out[0][0].json).toHaveProperty("title");
    expect(out[0][0].json).toHaveProperty("status", "unresolved");
  });

  it("gets all organizations", async () => {
    const out = await runSentry(
      { resource: "organization", operation: "getAll" },
      [{ json: {} }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("slug");
    expect(out[0][0].json).toHaveProperty("name");
    expect(out[0][0].json).toHaveProperty("id");
  });

  it("updates issue status", async () => {
    const out = await runSentry(
      { resource: "issue", operation: "update", issueId: "12345", status: "resolved" },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("id", "12345");
    expect(out[0][0].json).toHaveProperty("status", "resolved");
  });

  it("creates release with projects as array", async () => {
    const out = await runSentry(
      { resource: "release", operation: "create", organizationSlug: "my-org", version: "2.0.0", projects: ["my-project"] },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("version", "2.0.0");
    expect(out[0][0].json).toHaveProperty("projects");
    expect(out[0][0].json).toHaveProperty("dateReleased");
  });

  it("creates release with projects as comma-separated string", async () => {
    const out = await runSentry(
      { resource: "release", operation: "create", organizationSlug: "my-org", version: "3.0.0", projects: "proj-a,proj-b" },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("version", "3.0.0");
    expect(out[0][0].json.projects).toEqual(["proj-a", "proj-b"]);
  });

  it("gets project getAll", async () => {
    const out = await runSentry(
      { resource: "project", operation: "getAll", organizationSlug: "my-org" },
      [{ json: {} }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("slug", "my-project");
  });

  it("fails when required param is missing", async () => {
    await expect(runSentry({ resource: "issue", operation: "get" }, [{ json: {} }])).rejects.toThrow(/issueId is required/);
  });

  it("handles multi-item input", async () => {
    const out = await runSentry(
      { resource: "issue", operation: "get", issueId: "1" },
      [{ json: {} }, { json: {} }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("id");
    expect(out[0][1].json).toHaveProperty("id");
  });

  it("returns error items on continueOnFail", async () => {
    const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "issue", operation: "get" } });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => ({ accessToken: "test" }),
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("returns error when credential is missing", async () => {
    const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "issue", operation: "get", issueId: "1" } });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
