import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.dropbox";

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  const map = new Map(Object.entries(headers));
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return text ? JSON.parse(text) : null; },
    async text() { return text; },
  };
}

interface FetchCall { url: string; method: string; headers: Record<string, string>; body: string | undefined }

let calls: FetchCall[];
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback = mockResponse({ ok: true }),
) {
  routeMap = routes;
  defaultResponse = fallback;
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url: String(url), method: method.toUpperCase(), headers, body: typeof init?.body === "string" ? init.body : undefined });
    return routeMap[`${method} ${url}`] ?? defaultResponse;
  }));
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i ? (i as INodeExecutionData) : { json: i as Record<string, unknown> },
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
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
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

const CREDS = { dropboxApi: { accessToken: "dropbox-token-abc" } };

beforeEach(() => { installFetch(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue dropbox — n8n-nodes-base.dropbox", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Dropbox");
  });

  it("upload file", async () => {
    installFetch({
      "POST https://content.dropboxapi.com/2/files/upload": mockResponse({
        id: "file123",
        name: "test.txt",
        path_display: "/test.txt",
      }),
    });
    const out = await run({
      resource: "file",
      operation: "upload",
      path: "/test.txt",
      data: "hello world",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://content.dropboxapi.com/2/files/upload");
    const arg = JSON.parse(calls[0].headers["Dropbox-API-Arg"]);
    expect(arg).toMatchObject({ path: "/test.txt", mode: "add", autorename: true });
    expect(out[0][0].json).toMatchObject({ id: "file123", name: "test.txt" });
  });

  it("upload uses credentials", async () => {
    installFetch({
      "POST https://content.dropboxapi.com/2/files/upload": mockResponse({ id: "f1", name: "x.txt" }),
    });
    await run({ resource: "file", operation: "upload", path: "/x.txt", data: "data" });
    expect(calls[0].headers.Authorization).toBe("Bearer dropbox-token-abc");
  });

  it("copy file", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/copy_v2": mockResponse({
        metadata: { name: "copy.txt" },
      }),
    });
    const out = await run({
      resource: "file",
      operation: "copy",
      path: "/source.txt",
      toPath: "/dest/copy.txt",
    });
    expect(JSON.parse(calls[0].body as string)).toEqual({
      from_path: "/source.txt",
      to_path: "/dest/copy.txt",
    });
    expect(out[0][0].json).toBeDefined();
  });

  it("delete file", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/delete_v2": mockResponse(null),
    });
    const out = await run({
      resource: "file",
      operation: "delete",
      path: "/delete-me.txt",
    });
    expect(JSON.parse(calls[0].body as string)).toEqual({ path: "/delete-me.txt" });
    expect(out[0][0].json).toEqual({ success: true, path: "/delete-me.txt" });
  });

  it("create folder", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/create_folder_v2": mockResponse({
        metadata: { name: "new-folder", path_display: "/new-folder" },
      }),
    });
    const out = await run({
      resource: "folder",
      operation: "create",
      path: "/new-folder",
    });
    expect(JSON.parse(calls[0].body as string)).toEqual({
      path: "/new-folder",
      autorename: true,
    });
    expect(out[0][0].json).toMatchObject({ metadata: { name: "new-folder" } });
  });

  it("search query", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/search_v2": mockResponse({
        matches: [
          { metadata: { metadata: { name: "found.txt", path_display: "/found.txt" } } },
        ],
      }),
    });
    const out = await run({
      resource: "search",
      operation: "query",
      query: "found",
    });
    expect(JSON.parse(calls[0].body as string)).toEqual({ query: "found" });
    expect(out[0][0].json).toHaveProperty("matches");
  });

  it("move file", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/move_v2": mockResponse({
        metadata: { name: "moved.txt" },
      }),
    });
    const out = await run({
      resource: "file",
      operation: "move",
      path: "/old.txt",
      toPath: "/new.txt",
    });
    expect(JSON.parse(calls[0].body as string)).toEqual({
      from_path: "/old.txt",
      to_path: "/new.txt",
    });
    expect(out[0][0].json).toBeDefined();
  });

  it("continueOnFail returns error items", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/delete_v2": mockResponse(
        { error_summary: "path/not_found" },
        404,
      ),
    });
    const out = await run(
      { resource: "file", operation: "delete", path: "/missing.txt" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "file", operation: "upload", path: "/x.txt", data: "data" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow("Dropbox: credential is not configured");
  });

  it("throws when path is missing for upload", async () => {
    await expect(
      run({ resource: "file", operation: "upload", data: "data" }),
    ).rejects.toThrow("Dropbox: path is required for upload");
  });

  it("throws when query is missing for search", async () => {
    await expect(
      run({ resource: "search", operation: "query" }),
    ).rejects.toThrow("Dropbox: query is required for search");
  });
});
