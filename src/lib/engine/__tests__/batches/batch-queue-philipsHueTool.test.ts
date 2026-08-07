import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.philipsHueTool";
const CREDS = { philipsHueOAuth2Api: { accessToken: "test-token-abc" } };

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: new Map(),
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

type Handler = (
  url: string,
  method: string,
  body?: unknown,
) => ReturnType<typeof mockResponse>;
let handler: Handler;

function installFetch(h: Handler) {
  handler = h;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      return handler(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { philipsHueOAuth2Api: { name: "philipsHueOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("philipsHueTool executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("retrieves all lights via AI tool", async () => {
    const lights = [
      {
        id: "7a345bcd-1234-5678-abcd-1a2b3c4d5e6f",
        type: "light",
        metadata: { name: "Living Room" },
        on: { on: true },
        dimming: { brightness: 80 },
      },
    ];
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/resource/light")) {
        return mockResponse({ data: lights, errors: [] });
      }
      return mockResponse({});
    });
    const out = await run({ resource: "light", operation: "getAll" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "7a345bcd-1234-5678-abcd-1a2b3c4d5e6f",
      type: "light",
    });
  });

  it("gets a specific light", async () => {
    const light = {
      id: "7a345bcd-1234-5678-abcd-1a2b3c4d5e6f",
      type: "light",
      metadata: { name: "Bedroom" },
      on: { on: false },
    };
    installFetch((url, method) => {
      if (
        method === "GET" &&
        url.includes("/resource/light/7a345bcd-1234-5678-abcd-1a2b3c4d5e6f")
      ) {
        return mockResponse({ data: [light], errors: [] });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "light",
        operation: "get",
        lightId: "7a345bcd-1234-5678-abcd-1a2b3c4d5e6f",
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({ id: "7a345bcd-1234-5678-abcd-1a2b3c4d5e6f" });
  });

  it("turns a light on via AI tool", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, unknown>;
      if (
        method === "PUT" &&
        url.includes("/resource/light/7a345bcd-1234-5678-abcd-1a2b3c4d5e6f")
      ) {
        expect(b).toMatchObject({
          on: { on: true },
          dynamics: { duration: 400 },
        });
        return mockResponse({
          data: [{ id: "7a345bcd-1234-5678-abcd-1a2b3c4d5e6f", on: { on: true } }],
          errors: [],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "light",
        operation: "update",
        lightId: "7a345bcd-1234-5678-abcd-1a2b3c4d5e6f",
        on: true,
        transitionTime: 400,
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({ data: [{ on: { on: true } }] });
  });

  it("throws validation error when lightId is missing for get", async () => {
    await expect(
      run({ resource: "light", operation: "get", lightId: "" }, [{}]),
    ).rejects.toThrow("lightId is required");
  });

  it("continueOnFail emits error item", async () => {
    const out = await run(
      { resource: "light", operation: "get", lightId: "" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
  });
});
