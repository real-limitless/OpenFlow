import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.bannerbear";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      forEach(fn: (v: string, k: string) => void) { map.forEach((v, k) => fn(v, k)); },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response?: ReturnType<typeof mockResponse>) {
  nextResponse = response ?? mockResponse({ uid: "img_001", status: "pending" });
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return nextResponse;
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

const CREDS = { bannerbearApi: { apiKey: "bb_api_key_xyz" } };

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

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue bannerbear — n8n-nodes-base.bannerbear", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Bannerbear");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  describe("Image — Create", () => {
    it("sends POST /images with template_uid and modifications", async () => {
      installFetch(mockResponse({
        uid: "img_001",
        status: "pending",
        self: "https://api.bannerbear.com/v2/images/img_001",
        image_url: null,
        modifications: ["title", "photo"],
      }));

      const out = await run({
        resource: "Image",
        operation: "Create",
        templateUid: "abc123",
        modifications: JSON.stringify([
          { name: "title", text: "Hello World" },
          { name: "photo", image_url: "https://example.com/img.jpg" },
        ]),
        transparent: false,
        renderPdf: false,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://api.bannerbear.com/v2/images");
      const sentBody = JSON.parse(calls[0].body!);
      expect(sentBody.template_uid).toBe("abc123");
      expect(sentBody.modifications).toHaveLength(2);
      expect(sentBody.modifications[0]).toEqual({ name: "title", text: "Hello World" });

      expect(out[0][0].json).toMatchObject({
        uid: "img_001",
        status: "pending",
        image_url: null,
      });
    });

    it("sends optional boolean flags transparent/renderPdf when true", async () => {
      installFetch(mockResponse({ uid: "img_002", status: "pending" }));

      await run({
        resource: "Image",
        operation: "Create",
        templateUid: "abc123",
        modifications: JSON.stringify([{ name: "layer1", text: "Hi" }]),
        transparent: true,
        renderPdf: true,
      });

      const sentBody = JSON.parse(calls[0].body!);
      expect(sentBody.transparent).toBe(true);
      expect(sentBody.render_pdf).toBe(true);
    });

    it("does not send optional fields when empty", async () => {
      installFetch(mockResponse({ uid: "img_003", status: "pending" }));

      await run({
        resource: "Image",
        operation: "Create",
        templateUid: "abc123",
        modifications: JSON.stringify([{ name: "layer1", text: "Hi" }]),
      });

      const sentBody = JSON.parse(calls[0].body!);
      expect(sentBody.transparent).toBeUndefined();
      expect(sentBody.render_pdf).toBeUndefined();
      expect(sentBody.webhook_url).toBeUndefined();
    });

    it("sends Bearer token from credential", async () => {
      await run({
        resource: "Image",
        operation: "Create",
        templateUid: "abc123",
        modifications: JSON.stringify([{ name: "x", text: "y" }]),
      });

      expect(calls[0].headers["Authorization"]).toBe("Bearer bb_api_key_xyz");
    });

    it("makes one request per input item", async () => {
      installFetch(mockResponse({ uid: "img_a", status: "pending" }));
      const out = await run(
        {
          resource: "Image",
          operation: "Create",
          templateUid: "abc123",
          modifications: JSON.stringify([{ name: "x", text: "y" }]),
        },
        [{ id: "a" }, { id: "b" }],
      );

      expect(calls).toHaveLength(2);
      expect(out[0]).toHaveLength(2);
    });
  });

  describe("Image — Get", () => {
    it("sends GET /images/:uid and returns the response", async () => {
      installFetch(mockResponse({
        uid: "img_001",
        status: "completed",
        image_url: "https://cdn.bannerbear.com/renders/001.png",
      }));

      const out = await run({
        resource: "Image",
        operation: "Get",
        imageUid: "img_001",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://api.bannerbear.com/v2/images/img_001");
      expect(out[0][0].json).toMatchObject({ uid: "img_001", status: "completed" });
    });
  });

  describe("Template — Get", () => {
    it("sends GET /templates/:uid", async () => {
      installFetch(mockResponse({
        uid: "tmpl_001",
        name: "My Template",
        preview_url: "https://cdn.bannerbear.com/templates/preview.png",
        available_modifications: [
          { name: "title", type: "text" },
          { name: "photo", type: "image" },
        ],
      }));

      const out = await run({
        resource: "Template",
        operation: "Get",
        templateUid: "tmpl_001",
      });

      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://api.bannerbear.com/v2/templates/tmpl_001");
      expect(out[0][0].json).toMatchObject({
        uid: "tmpl_001",
        name: "My Template",
      });
      expect(out[0][0].json.available_modifications).toHaveLength(2);
    });
  });

  describe("Template — Get All", () => {
    it("sends GET /templates and returns the array", async () => {
      const templates = [
        { uid: "tmpl_001", name: "Template 1", preview_url: null, available_modifications: [] },
        { uid: "tmpl_002", name: "Template 2", preview_url: "https://cdn.example.com/t2.png", available_modifications: [{
          name: "title", type: "text" }] },
      ];
      installFetch(mockResponse(templates));

      const out = await run({ resource: "Template", operation: "Get All" });

      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://api.bannerbear.com/v2/templates");
      const arr = out[0][0].json as unknown as Array<Record<string, unknown>>;
      expect(arr).toHaveLength(2);
      expect(arr[0].uid).toBe("tmpl_001");
      expect((arr[1].available_modifications as unknown[])).toHaveLength(1);
    });
  });

  describe("Error handling", () => {
    it("throws on missing templateUid for Image Create", async () => {
      await expect(
        run({ resource: "Image", operation: "Create", modifications: "[]" }),
      ).rejects.toThrow(/templateUid is required/);
    });

    it("throws on HTTP 4xx from API", async () => {
      installFetch(mockResponse({ message: "not found" }, { status: 404 }));
      await expect(
        run({
          resource: "Image",
          operation: "Get",
          imageUid: "nonexistent",
        }),
      ).rejects.toThrow(/Bannerbear API error \(404\)/);
    });

    it("emits error item on continueOnFail", async () => {
      installFetch(mockResponse({ message: "bad" }, { status: 500 }));
      const out = await run(
        {
          resource: "Image",
          operation: "Get",
          imageUid: "img_999",
        },
        [{}],
        { continueOnFail: true, credentials: CREDS },
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
    });

    it("throws on unsupported resource/operation", async () => {
      await expect(
        run({ resource: "Image", operation: "Delete" }),
      ).rejects.toThrow(/Unsupported resource\/operation/);
    });

    it("throws when credential is missing", async () => {
      await expect(
        run(
          { resource: "Template", operation: "Get All" },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow(/Credential "bannerbearApi" is not configured/);
    });
  });
});
