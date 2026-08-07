import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.vero";

interface MockResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Bad Request",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
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
  body: string | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response = mockResponse({ status: 200, message: "Success." })) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return nextResponse;
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
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { veroApi: { authToken: "abc-vero-token-123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue vero — n8n-nodes-base.vero", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Vero");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.vero")).toBe(canonical);
  });

  describe("User — createOrUpdate", () => {
    it("sends POST /users/track with id, email, and data", async () => {
      const out = await run(
        { resource: "User", operation: "createOrUpdate", id: "={{ $json.id }}", email: "={{ $json.email }}", data: '={"firstName": $json.firstName}' },
        [{ json: { id: "usr_1000", email: "alice@example.com", firstName: "Alice" } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/users/track?auth_token=abc-vero-token-123");
      const body = JSON.parse(calls[0].body!);
      expect(body.id).toBe("usr_1000");
      expect(body.email).toBe("alice@example.com");
      expect(body.data).toEqual({ firstName: "Alice" });

      expect(out[0][0].json).toEqual({ status: 200, message: "Success." });
    });

    it("sends POST /users/track with email only", async () => {
      const out = await run(
        { resource: "User", operation: "createOrUpdate", email: "{{ $json.email }}" },
        [{ json: { email: "bob@example.com" } }],
      );

      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body.email).toBe("bob@example.com");
      expect(body.id).toBeUndefined();
      expect(out[0][0].json).toEqual({ status: 200, message: "Success." });
    });
  });

  describe("User — alias", () => {
    it("sends PUT /users/reidentify", async () => {
      await run(
        { resource: "User", operation: "alias", id: "={{ $json.id }}", newId: "={{ $json.newId }}" },
        [{ json: { id: "usr_1000", newId: "usr_2000" } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PUT");
      expect(calls[0].url).toContain("/users/reidentify");
      const body = JSON.parse(calls[0].body!);
      expect(body).toEqual({ id: "usr_1000", new_id: "usr_2000" });
    });
  });

  describe("User — unsubscribe", () => {
    it("sends POST /users/unsubscribe", async () => {
      await run(
        { resource: "User", operation: "unsubscribe", id: "={{ $json.id }}" },
        [{ json: { id: "usr_1000" } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/users/unsubscribe");
      const body = JSON.parse(calls[0].body!);
      expect(body).toEqual({ id: "usr_1000" });
    });
  });

  describe("User — resubscribe", () => {
    it("sends POST /users/resubscribe", async () => {
      await run(
        { resource: "User", operation: "resubscribe", id: "{{ $json.id }}" },
        [{ json: { id: "usr_1000" } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/users/resubscribe");
    });
  });

  describe("User — delete", () => {
    it("sends POST /users/delete", async () => {
      await run(
        { resource: "User", operation: "delete", id: "{{ $json.id }}" },
        [{ json: { id: "usr_1000" } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/users/delete");
    });
  });

  describe("User — addTags", () => {
    it("sends PUT /users/tags/edit with add array", async () => {
      await run(
        { resource: "User", operation: "addTags", id: "={{ $json.id }}", tags: "={{ $json.newTags }}" },
        [{ json: { id: "usr_1000", newTags: ["prospect", "trial"] } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PUT");
      expect(calls[0].url).toContain("/users/tags/edit");
      const body = JSON.parse(calls[0].body!);
      expect(body).toEqual({ id: "usr_1000", add: ["prospect", "trial"] });
    });
  });

  describe("User — removeTags", () => {
    it("sends PUT /users/tags/edit with remove array", async () => {
      await run(
        { resource: "User", operation: "removeTags", id: "={{ $json.id }}", tags: "={{ $json.tags }}" },
        [{ json: { id: "usr_1000", tags: ["old-tag"] } }],
      );

      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body).toEqual({ id: "usr_1000", remove: ["old-tag"] });
    });
  });

  describe("Event — track", () => {
    it("sends POST /events/track with identity and event_name", async () => {
      await run(
        { resource: "Event", operation: "track", "identity.id": "={{ $json.id }}", eventName: "={{ $json.event }}", data: '={"sku": $json.sku}' },
        [{ json: { id: "usr_1000", event: "Purchased Item", sku: "TSHIRT-RED" } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/events/track");
      const body = JSON.parse(calls[0].body!);
      expect(body.identity).toEqual({ id: "usr_1000" });
      expect(body.event_name).toBe("Purchased Item");
      expect(body.data).toEqual({ sku: "TSHIRT-RED" });
    });
  });

  describe("error handling", () => {
    it("throws when credential is missing", async () => {
      await expect(
        run(
          { resource: "User", operation: "createOrUpdate", id: "usr_1" },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow(/Vero.*credential/);
    });

    it("throws when id is missing for unsubscribe", async () => {
      await expect(
        run({ resource: "User", operation: "unsubscribe" }),
      ).rejects.toThrow(/required parameter.*id/);
    });

    it("throws on HTTP error", async () => {
      installFetch(mockResponse({ status: 401, message: "Unauthorized" }, { status: 401 }));
      await expect(
        run(
          { resource: "User", operation: "unsubscribe", id: "usr_1" },
          [{}],
        ),
      ).rejects.toThrow(/401/);
    });

    it("emits error item with continueOnFail on HTTP error", async () => {
      installFetch(mockResponse({ status: 500, message: "Server Error" }, { status: 500 }));
      const out = await run(
        { resource: "User", operation: "unsubscribe", id: "usr_1" },
        [{}],
        { continueOnFail: true, credentials: CREDS },
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
    });

    it("emits error item when required param is missing with continueOnFail", async () => {
      const out = await run(
        { resource: "User", operation: "unsubscribe" },
        [{}],
        { continueOnFail: true, credentials: CREDS },
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
    });
  });

  describe("unsupported resource/operation", () => {
    it("emits error item for unknown combination", async () => {
      const out = await run(
        { resource: "User", operation: "flyToMoon" },
        [{}],
        { continueOnFail: true, credentials: CREDS },
      );

      expect(out[0][0].json).toEqual({ error: "Vero: unsupported resource/operation: User/flyToMoon" });
    });
  });

  describe("multiple input items", () => {
    it("processes each item independently", async () => {
      const out = await run(
        { resource: "User", operation: "unsubscribe", id: "={{ $json.id }}" },
        [{ json: { id: "usr_1" } }, { json: { id: "usr_2" } }],
      );

      expect(calls).toHaveLength(2);
      expect(JSON.parse(calls[0].body!).id).toBe("usr_1");
      expect(JSON.parse(calls[1].body!).id).toBe("usr_2");
      expect(out[0]).toHaveLength(2);
    });
  });
});
