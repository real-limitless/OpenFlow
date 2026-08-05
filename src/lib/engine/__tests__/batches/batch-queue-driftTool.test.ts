import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.driftTool";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  body?: unknown;
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

function mockFetch(response: MockResponseInit, fail = false) {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (fail) {
      const err = new Error("Network error");
      (err as any).code = "NETWORK_ERROR";
      throw err;
    }
    const status = response.status ?? 200;
    if (status === 204) {
      return new Response(null, { status: 204 });
    }
    const body = response.body !== undefined ? JSON.stringify(response.body) : "{}";
    return new Response(body, {
      status,
      headers: { "Content-Type": response.contentType ?? "application/json" },
    });
  });
}

function makeDriftToolNode(
  parameters: Record<string, unknown>,
  continueOnFail = false,
): { executor: ReturnType<typeof getExecutor>; node: INode } {
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`${TYPE} not registered`);
  const node = makeNode({
    name: "Drift Tool",
    type: TYPE,
    parameters,
  });
  return { executor, node };
}

async function runOnce(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  continueOnFail = false,
): Promise<INodeExecutionData[]> {
  const { executor, node } = makeDriftToolNode(params, continueOnFail);
  const normalized: INodeExecutionData[] = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf-drift-tool",
      name: "Drift Tool Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => normalized,
    continueOnFail,
    getCredential: async (name: string) => {
      if (name === "driftApi") return { accessToken: "test-token" };
      if (name === "driftOAuth2Api") return null;
      return null;
    },
  });
  const out = await executor(ctx, node);
  return out[0] ?? [];
}

describe("Drift Tool node", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (fetchSpy) fetchSpy.mockRestore();
  });

  it("resolves to drift executor and description via alias", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe("n8n-nodes-base.drift");
    expect(desc.displayName).toBe("Drift");
    expect(desc.category).toBe("Sales");
  });

  it("create contact via AI tool", async () => {
    mockFetch({
      status: 200,
      body: {
        data: {
          id: 15811408544,
          createdAt: 1664572604326,
          attributes: { email: "alice@example.com", name: "Alice" },
        },
      },
    });
    const result = await runOnce({
      resource: "contact",
      operation: "create",
      email: "alice@example.com",
      additionalFields: { name: "Alice" },
    });
    expect(result).toHaveLength(1);
    expect(result[0].json).toMatchObject({
      id: 15811408544,
      createdAt: 1664572604326,
      attributes: { email: "alice@example.com", name: "Alice" },
    });
  });

  it("get contact by ID", async () => {
    mockFetch({
      status: 200,
      body: {
        data: {
          id: 12345678,
          attributes: {},
        },
      },
    });
    const result = await runOnce(
      {
        resource: "contact",
        operation: "get",
        contactId: "={{ $json.driftContactId }}",
      },
      [{ json: { driftContactId: 12345678 } }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].json).toMatchObject({ id: 12345678 });
  });

  it("update contact email", async () => {
    mockFetch({
      status: 200,
      body: {
        data: {
          id: 87654321,
          attributes: { email: "newemail@example.com" },
        },
      },
    });
    const result = await runOnce(
      {
        resource: "contact",
        operation: "update",
        contactId: "={{ $json.contactId }}",
        additionalFields: { email: "newemail@example.com" },
      },
      [{ json: { contactId: 87654321 } }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].json).toMatchObject({
      id: 87654321,
      attributes: { email: "newemail@example.com" },
    });
  });

  it("delete contact", async () => {
    mockFetch({ status: 204 });
    const result = await runOnce(
      {
        resource: "contact",
        operation: "delete",
        contactId: "={{ $json.contactId }}",
      },
      [{ json: { contactId: 555555 } }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].json).toEqual({ id: "555555" });
  });

  it("get custom attributes", async () => {
    mockFetch({
      status: 200,
      body: {
        data: [
          { id: 1, name: "Custom Field 1", type: "string", value: "val1" },
        ],
      },
    });
    const result = await runOnce({
      resource: "contact",
      operation: "getAll",
    });
    expect(result).toHaveLength(1);
    expect(result[0].json).toMatchObject({
      data: [{ id: 1, name: "Custom Field 1", type: "string", value: "val1" }],
    });
  });

  it("continueOnFail wraps error", async () => {
    mockFetch({ status: 200 }, true);
    const result = await runOnce(
      {
        resource: "contact",
        operation: "create",
        email: "bob@example.com",
      },
      [{}],
      true,
    );
    expect(result).toHaveLength(1);
    expect(result[0].json.error).toBeDefined();
    expect(result[0].json.error.message).toContain("Network error");
  });
});
