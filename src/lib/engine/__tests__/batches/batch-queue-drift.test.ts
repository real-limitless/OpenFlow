import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.drift";

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

function makeDriftNode(
  parameters: Record<string, unknown>,
  continueOnFail = false,
): { executor: ReturnType<typeof getExecutor>; node: INode } {
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`${TYPE} not registered`);
  const node = makeNode({
    name: "Drift",
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
  const { executor, node } = makeDriftNode(params, continueOnFail);
  const normalized: INodeExecutionData[] = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf-drift",
      name: "Drift Test",
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

describe("Drift node", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (fetchSpy) fetchSpy.mockRestore();
  });

  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.displayName).toBe("Drift");
    expect(desc.category).toBe("Sales");
  });

  it("create contact", async () => {
    mockFetch({
      status: 200,
      body: {
        data: {
          id: 15811408544,
          createdAt: 1664572604326,
          attributes: { email: "alice@example.com", name: "Alice", externalId: "ext-001" },
        },
      },
    });
    const result = await runOnce({
      resource: "contact",
      operation: "create",
      email: "alice@example.com",
      additionalFields: { name: "Alice", externalId: "ext-001" },
    });
    expect(result).toHaveLength(1);
    expect(result[0].json).toEqual({
      id: 15811408544,
      createdAt: 1664572604326,
      attributes: { email: "alice@example.com", name: "Alice", externalId: "ext-001" },
    });
  });

  it("get contact with expression", async () => {
    mockFetch({
      status: 200,
      body: {
        data: {
          id: 15811408544,
          attributes: {},
        },
      },
    });
    const result = await runOnce(
      {
        resource: "contact",
        operation: "get",
        contactId: "={{ $json.myId }}",
      },
      [{ json: { myId: 15811408544 } }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].json).toMatchObject({ id: 15811408544 });
  });

  it("delete contact", async () => {
    mockFetch({ status: 204 });
    const result = await runOnce(
      {
        resource: "contact",
        operation: "delete",
        contactId: "={{ $json.contactId }}",
      },
      [{ json: { contactId: 15811408544 } }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].json).toEqual({ id: "15811408544" });
  });

  it("getAll contacts (simplified)", async () => {
    mockFetch({
      status: 200,
      body: {
        data: [{ id: 1, attributes: {} }],
        meta: { total_count: 1 },
      },
    });
    const result = await runOnce({
      resource: "contact",
      operation: "getAll",
      simplify: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].json).toEqual({
      data: [{ id: 1, attributes: {} }],
    });
  });

  it("throws validation error when email missing for create", async () => {
    await expect(
      runOnce({
        resource: "contact",
        operation: "create",
      }),
    ).rejects.toThrow("Drift: required parameter 'email' is missing for create");
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

  it("supports update with additionalFields", async () => {
    mockFetch({
      status: 200,
      body: {
        data: {
          id: 15811408544,
          attributes: { email: "alice@example.com", name: "Alice Updated" },
        },
      },
    });
    const result = await runOnce({
      resource: "contact",
      operation: "update",
      contactId: "15811408544",
      additionalFields: { name: "Alice Updated" },
    });
    expect(result).toHaveLength(1);
    expect(result[0].json).toMatchObject({
      id: 15811408544,
      attributes: { name: "Alice Updated" },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://driftapi.com/contacts/15811408544",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("Alice Updated"),
      }),
    );
  });
});
