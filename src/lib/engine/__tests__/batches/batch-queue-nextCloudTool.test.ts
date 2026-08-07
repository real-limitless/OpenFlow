import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.nextCloudTool";
const CREDS = { nextCloudApi: { webDavUrl: "https://nc.example.com", user: "admin", password: "pass" } };

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
      forEach(fn: (v: string, k: string) => void) { map.forEach(fn); },
    },
    async json() { return text ? JSON.parse(text) : null; },
    async text() { return text; },
  };
}

let fetchCalls: Array<{ url: string; method: string; body?: string; headers?: Record<string, string> }>;
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback = mockResponse({}),
) {
  routeMap = routes;
  defaultResponse = fallback;
  fetchCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    if (init?.headers && typeof init.headers === "object" && !Array.isArray(init.headers)) {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[k.toLowerCase()] = String(v);
      }
    }
    fetchCalls.push({
      url: String(url),
      method,
      body: typeof init?.body === "string" ? init.body : undefined,
      headers,
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
    credentials: { nextCloudApi: { name: "nextCloudApi" } },
  });
  const items: INodeExecutionData[] = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf", name: "T", active: false,
      nodes: [node], connections: {}, settings: {},
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

describe("nextCloudTool executor", () => {
  it("uploads a file", async () => {
    installFetch({
      "PUT https://nc.example.com/remote.php/dav/files/test/hello.txt": mockResponse("", 201),
    });
    const out = await run({
      resource: "file",
      operation: "upload",
      filePath: "/test/hello.txt",
    });
    expect(out[0][0].json).toMatchObject({ success: true, path: "/test/hello.txt" });
  });

  it("downloads a file", async () => {
    installFetch({
      "GET https://nc.example.com/remote.php/dav/files/test/doc.txt": mockResponse("file content", 200, {
        "Content-Length": "12",
        "Content-Type": "text/plain",
        "ETag": '"abc"',
        "Last-Modified": "Mon, 01 Jan 2024 00:00:00 GMT",
      }),
    });
    const out = await run({
      resource: "file",
      operation: "download",
      filePath: "/test/doc.txt",
    });
    expect(out[0][0].json).toMatchObject({
      path: "/test/doc.txt", type: "file",
      contentLength: "12", contentType: "text/plain",
    });
  });

  it("copies a file", async () => {
    installFetch({
      "COPY https://nc.example.com/remote.php/dav/files/src.txt": mockResponse("", 201),
    });
    const out = await run({
      resource: "file",
      operation: "copy",
      sourcePath: "/src.txt",
      destinationPath: "/dest.txt",
    });
    expect(out[0][0].json).toMatchObject({ success: true, source: "/src.txt", destination: "/dest.txt" });
  });

  it("moves a file", async () => {
    installFetch({
      "MOVE https://nc.example.com/remote.php/dav/files/src.txt": mockResponse("", 201),
    });
    const out = await run({
      resource: "file",
      operation: "move",
      sourcePath: "/src.txt",
      destinationPath: "/dest.txt",
    });
    expect(out[0][0].json).toMatchObject({ success: true, source: "/src.txt", destination: "/dest.txt" });
  });

  it("deletes a file", async () => {
    installFetch({
      "DELETE https://nc.example.com/remote.php/dav/files/old.txt": mockResponse("", 204),
    });
    const out = await run({
      resource: "file",
      operation: "delete",
      filePath: "/old.txt",
    });
    expect(out[0][0].json).toMatchObject({ success: true, path: "/old.txt" });
  });

  it("creates a folder", async () => {
    installFetch({
      "MKCOL https://nc.example.com/remote.php/dav/files/newfolder": mockResponse("", 201),
    });
    const out = await run({
      resource: "folder",
      operation: "create",
      folderPath: "/newfolder",
    });
    expect(out[0][0].json).toMatchObject({ success: true, path: "/newfolder" });
  });

  it("lists a folder via PROPFIND", async () => {
    const propfindXml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/remote.php/dav/files/Documents/</d:href>
    <d:propstat><d:prop>
      <d:resourcetype><d:collection/></d:resourcetype>
      <d:getcontentlength>0</d:getcontentlength>
      <d:getcontenttype>httpd/unix-directory</d:getcontenttype>
    </d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/Documents/readme.txt</d:href>
    <d:propstat><d:prop>
      <d:resourcetype/>
      <d:getcontentlength>42</d:getcontentlength>
      <d:getcontenttype>text/plain</d:getcontenttype>
    </d:prop></d:propstat>
  </d:response>
</d:multistatus>`;
    installFetch({
      "PROPFIND https://nc.example.com/remote.php/dav/files/Documents": mockResponse(propfindXml, 207),
    });
    const out = await run({
      resource: "folder",
      operation: "list",
      folderPath: "/Documents",
    });
    expect(out[0].length).toBeGreaterThanOrEqual(2);
    const types = out[0].map((item) => (item.json as Record<string, unknown>).type);
    expect(types).toContain("directory");
    expect(types).toContain("file");
  });

  it("shares a file via OCS API", async () => {
    const ocsBody = JSON.stringify({
      ocs: {
        meta: { statuscode: 100, message: "OK" },
        data: { id: 42, url: "https://nc.example.com/s/share123", token: "share123" },
      },
    });
    installFetch({
      "POST https://nc.example.com/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json": mockResponse(ocsBody, 200),
    });
    const out = await run({
      resource: "file",
      operation: "share",
      filePath: "/test/doc.txt",
      shareType: 3,
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json).toMatchObject({ data: { id: 42, url: "https://nc.example.com/s/share123", token: "share123" } });
  });

  it("invites a user", async () => {
    const ocsBody = JSON.stringify({
      ocs: {
        meta: { statuscode: 100, message: "OK" },
        data: { id: "newuser" },
      },
    });
    installFetch({
      "POST https://nc.example.com/ocs/v2.php/cloud/users?format=json": mockResponse(ocsBody, 200),
    });
    const out = await run({
      resource: "user",
      operation: "invite",
      userId: "newuser",
      data: { email: "newuser@example.com" },
    });
    expect(out[0][0].json).toMatchObject({ userId: "newuser", email: "newuser@example.com" });
  });

  it("gets all users", async () => {
    const ocsBody = JSON.stringify({
      ocs: {
        meta: { statuscode: 100, message: "OK" },
        data: { users: ["alice", "bob"] },
      },
    });
    installFetch({
      "GET https://nc.example.com/ocs/v2.php/cloud/users?format=json": mockResponse(ocsBody, 200),
    });
    const out = await run({ resource: "user", operation: "getAll" });
    expect(out[0].length).toBe(2);
    expect(out[0][0].json).toMatchObject({ userId: "alice" });
    expect(out[0][1].json).toMatchObject({ userId: "bob" });
  });

  it("throws on missing filePath for upload", async () => {
    await expect(run({
      resource: "file",
      operation: "upload",
    })).rejects.toThrow("Nextcloud: filePath is required for upload");
  });

  it("throws on unsupported resource/operation", async () => {
    await expect(run({
      resource: "file",
      operation: "unknownOp",
    })).rejects.toThrow('Nextcloud: unsupported resource "file" / operation "unknownOp"');
  });

  it("deletes a folder using folderPath", async () => {
    installFetch({
      "DELETE https://nc.example.com/remote.php/dav/files/oldfolder": mockResponse("", 204),
    });
    const out = await run({
      resource: "folder",
      operation: "delete",
      folderPath: "/oldfolder",
    });
    expect(out[0][0].json).toMatchObject({ success: true, path: "/oldfolder" });
  });

  it("copies a folder using folderPath and destinationPath", async () => {
    installFetch({
      "COPY https://nc.example.com/remote.php/dav/files/srcfolder": mockResponse("", 201),
    });
    const out = await run({
      resource: "folder",
      operation: "copy",
      folderPath: "/srcfolder",
      destinationPath: "/destfolder",
    });
    expect(out[0][0].json).toMatchObject({ success: true, source: "/srcfolder", destination: "/destfolder" });
  });

  it("WebDAV 404 throws when continueOnFail is false", async () => {
    installFetch({
      "GET https://nc.example.com/remote.php/dav/files/missing.txt": mockResponse("Not Found", 404),
    });
    await expect(run({
      resource: "file",
      operation: "download",
      filePath: "/missing.txt",
    })).rejects.toThrow("Nextcloud WebDAV error: 404");
  });

  it("delete non-existent with continueOnFail true yields empty item", async () => {
    installFetch({
      "DELETE https://nc.example.com/remote.php/dav/files/nonexistent": mockResponse("Not Found", 404),
    });
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { resource: "file", operation: "delete", filePath: "/nonexistent" },
      credentials: { nextCloudApi: { name: "nextCloudApi" } },
    });
    const ctx: ExecutionContext = createExecutionContext({
      node,
      workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
    });
    const out = await getExecutor(TYPE)!(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("shares a folder via OCS API using folderPath", async () => {
    const ocsBody = JSON.stringify({
      ocs: {
        meta: { statuscode: 100, message: "OK" },
        data: { id: 43, url: "https://nc.example.com/s/share456", token: "share456" },
      },
    });
    installFetch({
      "POST https://nc.example.com/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json": mockResponse(ocsBody, 200),
    });
    const out = await run({
      resource: "folder",
      operation: "share",
      folderPath: "/SharedFolder",
      shareType: 3,
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json).toMatchObject({ data: { id: 43, url: "https://nc.example.com/s/share456", token: "share456" } });
  });
});
