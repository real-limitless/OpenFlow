import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor, getExecutorMap } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";
import { executeWorkflow } from "../../runner";
import { createExecutionContext } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.uproc";

interface FetchCall { url: string; method: string; headers: Record<string, string>; body?: string }

let calls: FetchCall[];
let responseStatus = 200;
let responseBody: unknown = {};

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; }, entries() { return new Map().entries(); } },
    async text() { return text; },
    async json() { return JSON.parse(text); },
  };
}

function installFetch(response?: unknown, status?: number) {
  responseBody = response ?? { data: { valid: true, status: "deliverable" } };
  responseStatus = status ?? 200;
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "POST",
      headers,
      body: init?.body as string | undefined,
    });
    return mockResponse(responseBody, responseStatus);
  }));
}

function uninstallFetch() {
  vi.unstubAllGlobals();
}

interface RunOptions {
  params?: Record<string, unknown>;
  inputItems?: Array<Record<string, unknown>>;
  credentials?: Record<string, Record<string, unknown>>;
  continueOnFail?: boolean;
}

async function run(opts: RunOptions = {}) {
  const creds = opts.credentials ?? { uProcApi: { email: "test@example.com", apiKey: "test-key" } };
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters: opts.params ?? { group: "communication", tool: "checkEmail", email: "user@example.com" },
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const input = (opts.inputItems ?? [{}]).map((j) => ({ json: j }));
  const ctx = createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => input,
    continueOnFail: opts.continueOnFail ?? false,
    getCredential: async (name) => creds[name] ?? null,
  });
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue uproc — n8n-nodes-base.uproc", () => {
  beforeEach(() => {
    installFetch();
  });
  afterEach(() => {
    uninstallFetch();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).toBeDefined();
  });

  it("has group and tool parameters in description", () => {
    const desc = getNodeType(TYPE);
    expect(desc?.properties?.find((p) => p.name === "group")).toBeTruthy();
    expect(desc?.properties?.find((p) => p.name === "tool")).toBeTruthy();
  });

  it("has credentials defined", () => {
    const desc = getNodeType(TYPE);
    expect(desc?.credentials?.length).toBeGreaterThanOrEqual(1);
    expect(desc?.credentials?.[0]?.name).toBe("uProcApi");
  });

  it("email validation — makes API call and merges result", async () => {
    installFetch({ data: { valid: true, status: "deliverable" } });
    const out = await run({
      params: { group: "communication", tool: "checkEmail" },
      inputItems: [{ email: "user@example.com" }],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.uproc.io");
    expect(calls[0].method).toBe("POST");
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.tool).toBe("checkEmail");
    expect(reqBody.group).toBe("communication");
    expect(reqBody.email).toBe("user@example.com");

    const j = out[0][0].json as Record<string, unknown>;
    expect(j.email).toBe("user@example.com");
    expect(j.result).toEqual({ valid: true, status: "deliverable" });
  });

  it("company by domain — reads domain param", async () => {
    installFetch({ data: { name: "Example Inc", domain: "example.com", industry: "Technology" } });
    const out = await run({
      params: { group: "company", tool: "getCompanyByDomain", domain: "example.com" },
    });

    expect(calls).toHaveLength(1);
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.tool).toBe("getCompanyByDomain");
    expect(reqBody.domain).toBe("example.com");
    expect((out[0][0].json as Record<string, unknown>).result).toEqual({
      name: "Example Inc", domain: "example.com", industry: "Technology",
    });
  });

  it("SSL check — uses domain from item json", async () => {
    installFetch({ data: { valid: true, expires: "2027-01-01" } });
    const out = await run({
      params: { group: "internet", tool: "checkSsl" },
      inputItems: [{ domain: "example.com" }],
    });

    expect(calls).toHaveLength(1);
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.domain).toBe("example.com");
    expect((out[0][0].json as Record<string, unknown>).result).toEqual({
      valid: true, expires: "2027-01-01",
    });
  });

  it("text translation — uses language option", async () => {
    installFetch({ data: { translatedText: "Hola mundo", sourceLanguage: "en", targetLanguage: "es" } });
    const out = await run({
      params: { group: "text", tool: "translateText", text: "Hello world", language: "es" },
    });

    expect(calls).toHaveLength(1);
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.text).toBe("Hello world");
    expect(reqBody.language).toBe("es");
    expect((out[0][0].json as Record<string, unknown>).result).toBeDefined();
  });

  it("barcode encode — uses number and standard params", async () => {
    installFetch({ data: { barcodeUrl: "https://api.uproc.io/barcode/1234567890128" } });
    const out = await run({
      params: { group: "image", tool: "encodeBarcode", number: "1234567890128", standard: "EAN13" },
    });

    expect(calls).toHaveLength(1);
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.number).toBe("1234567890128");
    expect(reqBody.standard).toBe("EAN13");
    expect((out[0][0].json as Record<string, unknown>).result).toBeDefined();
  });

  it("multiple items — processes each item independently", async () => {
    installFetch({ data: { valid: true, status: "deliverable" } });
    const out = await run({
      params: { group: "communication", tool: "checkEmail" },
      inputItems: [{ email: "a@example.com" }, { email: "b@example.com" }],
    });

    expect(calls).toHaveLength(2);
    expect(out[0]).toHaveLength(2);
  });

  it("continueOnFail — error item contains _error", async () => {
    installFetch({}, 403);
    const out = await run({
      params: { group: "communication", tool: "checkEmail", email: "bad" },
      continueOnFail: true,
    });

    expect(out[0]).toHaveLength(1);
    const j = out[0][0].json as Record<string, unknown>;
    expect(j._error).toBeDefined();
    expect(typeof j._error).toBe("string");
  });

  it("throws when credentials are missing", async () => {
    await expect(
      run({ params: { group: "communication", tool: "checkEmail" }, credentials: {} }),
    ).rejects.toThrow("uProcApi credential is not configured");
  });

  it("runs end-to-end in a workflow", async () => {
    installFetch({ data: { valid: true, status: "deliverable" } });

    const node: INode = {
      id: "u1",
      name: "uProc",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: { group: "communication", tool: "checkEmail", email: "user@example.com" },
      credentials: { uProcApi: { name: "uProcApi" } },
    };

    const wfCtx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ email: "test@example.com", apiKey: "test-key" }),
    });

    const executor = getExecutor(TYPE)!;
    const result = await executor(wfCtx, node);
    expect(result[0][0].json).toMatchObject({ result: { valid: true, status: "deliverable" } });
  });
});
