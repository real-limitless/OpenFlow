import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.dropboxTool";
const CREDS = { dropboxApi: { accessToken: "tok_dropbox" } };

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) map.set(k.toLowerCase(), v);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return text ? JSON.parse(text) : null; },
    async text() { return text; },
    async arrayBuffer() { return Buffer.from(text); },
  };
}

interface FetchCall { url: string; method: string; body?: string }

let calls: FetchCall[];
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback = mockResponse({}),
) {
  routeMap = routes;
  defaultResponse = fallback;
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({
      url: String(url),
      method,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return routeMap[`${method} ${url}`] ?? defaultResponse;
  }));
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { dropboxApi: { name: "dropboxApi" } },
  });
  const items: INodeExecutionData[] = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
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
    continueOnFail: false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dropboxTool executor", () => {
  it("upload file (text content)", async () => {
    installFetch({
      "POST https://content.dropboxapi.com/2/files/upload": mockResponse({
        name: "test.txt",
        path_display: "/test.txt",
        id: "id:abc123",
        size: 42,
      }),
    });
    const out = await run({
      resource: "file",
      operation: "upload",
      path: "/test.txt",
      content: "hello world",
    });
    expect(out[0][0].json).toMatchObject({
      name: "test.txt",
      path_display: "/test.txt",
      id: "id:abc123",
    });
    expect(calls.length).toBe(1);
  });

  it("upload file (binary data)", async () => {
    installFetch({
      "POST https://content.dropboxapi.com/2/files/upload": mockResponse({
        name: "photo.png",
        path_display: "/photo.png",
        id: "id:img456",
      }),
    });
    const binaryItem = {
      json: {},
      binary: { file: { data: Buffer.from("fake-png").toString("base64"), mimeType: "image/png", fileName: "photo.png" } },
    };
    const out = await run({
      resource: "file",
      operation: "upload",
      path: "/photo.png",
      binaryData: true,
      binaryPropertyName: "file",
    }, [binaryItem]);
    expect(out[0][0].json).toMatchObject({ path_display: "/photo.png" });
  });

  it("download file (binary output)", async () => {
    installFetch({
      "POST https://content.dropboxapi.com/2/files/download": mockResponse("raw content", 200, {
        "Dropbox-API-Result": JSON.stringify({ name: "doc.pdf", path_display: "/doc.pdf", id: "id:doc" }),
      }),
    });
    const out = await run({
      resource: "file",
      operation: "download",
      path: "/doc.pdf",
    });
    expect(out[0][0].json).toMatchObject({ name: "doc.pdf", path_display: "/doc.pdf" });
    expect((out[0][0].json as Record<string, unknown>).binary).toBeTruthy();
  });

  it("copy file", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/copy_v2": mockResponse({
        metadata: { name: "dest.txt", path_display: "/dest.txt" },
      }),
    });
    const out = await run({
      resource: "file",
      operation: "copy",
      path: "/source.txt",
      toPath: "/dest.txt",
    });
    expect(out[0][0].json).toMatchObject({ metadata: { path_display: "/dest.txt" } });
  });

  it("delete file", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/delete_v2": mockResponse({}),
    });
    const out = await run({
      resource: "file",
      operation: "delete",
      path: "/old.txt",
    });
    expect(out[0][0].json).toMatchObject({ success: true, path: "/old.txt" });
  });

  it("move file", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/move_v2": mockResponse({
        metadata: { name: "moved.txt", path_display: "/dest/moved.txt" },
      }),
    });
    const out = await run({
      resource: "file",
      operation: "move",
      path: "/src/moved.txt",
      toPath: "/dest/moved.txt",
    });
    expect(out[0][0].json).toMatchObject({ metadata: { path_display: "/dest/moved.txt" } });
  });

  it("create folder", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/create_folder_v2": mockResponse({
        metadata: { name: "test-folder", path_display: "/test-folder" },
      }),
    });
    const out = await run({
      resource: "folder",
      operation: "create",
      path: "/test-folder",
    });
    expect(out[0][0].json).toMatchObject({ metadata: { path_display: "/test-folder" } });
  });

  it("list folder contents", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/list_folder": mockResponse({
        entries: [
          { name: "a.txt", path_display: "/a.txt", ".tag": "file" },
          { name: "sub", path_display: "/sub", ".tag": "folder" },
        ],
        has_more: false,
      }),
    });
    const out = await run({
      resource: "folder",
      operation: "list",
      path: "",
      limit: 10,
      returnAll: false,
    });
    expect(out[0].length).toBe(2);
    expect(out[0][0].json).toMatchObject({ name: "a.txt", path_display: "/a.txt" });
    expect(out[0][1].json).toMatchObject({ name: "sub", path_display: "/sub" });
  });

  it("search query", async () => {
    installFetch({
      "POST https://api.dropboxapi.com/2/files/search_v2": mockResponse({
        matches: [
          { metadata: { metadata: { name: "found.txt", path_display: "/found.txt" } } },
        ],
        has_more: false,
      }),
    });
    const out = await run({
      resource: "search",
      operation: "query",
      query: "test",
      limit: 5,
      returnAll: false,
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect((json.matches as Record<string, unknown>[]).length).toBe(1);
  });

  it("throws on missing path for upload", async () => {
    await expect(run({
      resource: "file",
      operation: "upload",
    })).rejects.toThrow("DropboxTool: path is required for upload");
  });

  it("throws on unsupported resource/operation", async () => {
    await expect(run({
      resource: "file",
      operation: "unknownOp",
    })).rejects.toThrow('DropboxTool: unsupported resource "file" / operation "unknownOp"');
  });
});
