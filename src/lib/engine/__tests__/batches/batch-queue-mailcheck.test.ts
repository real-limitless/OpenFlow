import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mailcheck";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 429 ? "Too Many Requests" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
      entries() {
        return new Map([["content-type", "application/json"]]).entries();
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
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses:
    | ReturnType<typeof mockResponse>
    | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      const bodyText =
        typeof init?.body === "string"
          ? init.body
          : init?.body
            ? JSON.stringify(init.body)
            : undefined;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
        body: bodyText,
      });
      const next = responseQueue.shift() ?? mockResponse({});
      return next;
    }),
  );
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function runNode(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Mailcheck", type: TYPE, parameters: params });
  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf-mailcheck",
      name: "Mailcheck Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () =>
      inputItems.map(
        (item): INodeExecutionData =>
          item && typeof item === "object" && "json" in item
            ? (item as unknown as INodeExecutionData)
            : { json: item as Record<string, unknown> },
      ),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ apiKey: "test-key-123" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  return executor(ctx, node);
}

describe("n8n-nodes-base.mailcheck", () => {
  it("registers executor and node type", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE)).toBeTruthy();
  });

  it("basic email check returns API response merged with input", async () => {
    const mockApiResponse = {
      exists: true,
      trustRate: 0.95,
      isDisposable: false,
      isCatchAll: false,
      email: "test@example.com",
    };
    installFetch(mockResponse(mockApiResponse));

    const [out] = await runNode({
      resource: "email",
      operation: "check",
      email: "test@example.com",
    });

    expect(out).toHaveLength(1);
    const item = out[0].json as Record<string, unknown>;
    expect(item.exists).toBe(true);
    expect(item.trustRate).toBe(0.95);
    expect(item.isDisposable).toBe(false);
    expect(item.isCatchAll).toBe(false);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.mailcheck.co/v1/singleEmail:check");
    expect(calls[0].method).toBe("POST");

    const requestBody = JSON.parse(calls[0].body ?? "{}");
    expect(requestBody.email).toBe("test@example.com");
    expect(calls[0].headers["authorization"] || calls[0].headers["Authorization"]).toBe(
      "Bearer test-key-123",
    );
  });

  it("throws error when credential is missing", async () => {
    const node = makeNode({
      name: "Mailcheck",
      type: TYPE,
      parameters: { resource: "email", operation: "check", email: "test@example.com" },
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "wf-mailcheck",
        name: "Mailcheck Test",
        active: false,
        nodes: [node],
        connections: {},
        settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error(`No executor for ${TYPE}`);
    await expect(executor(ctx, node)).rejects.toThrow("credential is not configured");
  });

  it("continueOnFail: emits error item on API failure", async () => {
    installFetch(mockResponse({ message: "invalid email" }, 400));

    const [out] = await runNode(
      {
        resource: "email",
        operation: "check",
        email: "bad-email",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out).toHaveLength(1);
    expect((out[0].json as Record<string, unknown>).error).toBeTruthy();
  });
});
