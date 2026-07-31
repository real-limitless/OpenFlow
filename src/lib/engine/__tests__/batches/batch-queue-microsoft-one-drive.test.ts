import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftOneDrive";

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
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      forEach(cb: (v: string, k: string) => void) { map.forEach((v, k) => cb(v, k)); },
      entries() { return map.entries(); },
    },
    async json() { return text ? JSON.parse(text) : null; },
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
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback: ReturnType<typeof mockResponse> = mockResponse({}),
) {
  routeMap = routes;
  defaultResponse = fallback;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        url: String(url),
        method,
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const key = `${method} ${url}`;
      return routeMap[key] ?? defaultResponse;
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
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { microsoftOneDriveOAuth2Api: { accessToken: "mock-token-abc" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue microsoftOneDrive — n8n-nodes-base.microsoftOneDrive", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft OneDrive");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.microsoftOneDrive")).toBe(canonical);
  });

  describe("file upload", () => {
    it("uploads a file with binary data and returns metadata", async () => {
      const uploaded = { id: "FILE001", name: "hello.txt", size: 11, webUrl: "https://1drv.ms/u/file001", parentReference: { driveId: "drive1", id: "ROOT" } };
      installFetch({
        "PUT https://graph.microsoft.com/v1.0/me/drive/root:/hello.txt:/content": mockResponse(uploaded),
      });
      const out = await run({
        resource: "file",
        operation: "upload",
        parentFolder: "",
        fileName: "hello.txt",
        binaryPropertyName: "file",
      }, [{
        json: { folderName: "/Documents" },
        binary: {
          file: {
            mimeType: "text/plain",
            data: "aGVsbG8gd29ybGQ=",
          },
        },
      }]);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PUT");
      expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/drive/root:/hello.txt:/content");
      expect(out[0][0].json).toMatchObject({ id: "FILE001", name: "hello.txt", size: 11, parentReference: expect.any(Object), webUrl: expect.any(String) });
    });

    it("throws when binary property is missing", async () => {
      await expect(
        run({
          resource: "file",
          operation: "upload",
          fileName: "hello.txt",
          binaryPropertyName: "file",
        }, [{}]),
      ).rejects.toThrow(/binary property.*file.*not found/);
    });

    it("throws a size-limit error when payload exceeds 4MB", async () => {
      const oversized = Buffer.alloc(4 * 1024 * 1024 + 1, 0x61);
      await expect(
        run({
          resource: "file",
          operation: "upload",
          parentFolder: "/Documents",
          fileName: "large.bin",
          binaryPropertyName: "file",
        }, [{
          json: { folderName: "/Documents" },
          binary: {
            file: {
              mimeType: "application/octet-stream",
              data: oversized.toString("base64"),
            },
          },
        }]),
      ).rejects.toThrow(/exceeds 4MB limit/);
      expect(calls).toHaveLength(0);
    });
  });

  describe("folder getAll", () => {
    it("lists children of a folder", async () => {
      const children = [
        { id: "CHILD1", name: "file.txt", size: 100, file: {}, lastModifiedDateTime: "2024-01-01T00:00:00Z" },
        { id: "CHILD2", name: "subfolder", size: 0, folder: {}, lastModifiedDateTime: "2024-01-02T00:00:00Z" },
      ];
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/ABC123/children": mockResponse({ value: children }),
      });
      const out = await run({
        resource: "folder",
        operation: "getAll",
        folderId: "{{ $json.folderId }}",
      }, [{ json: { folderId: "ABC123" } }]);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/ABC123/children");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: "CHILD1", name: "file.txt" });
      expect(out[0][1].json).toMatchObject({ id: "CHILD2", name: "subfolder" });
    });
  });

  describe("file download", () => {
    it("downloads a file and returns metadata + binary data", async () => {
      const metadata = { id: "FILE456", name: "report.pdf", size: 1024, webUrl: "https://1drv.ms/u/file456", file: { mimeType: "application/pdf" } };
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/FILE456": mockResponse(metadata),
        "GET https://graph.microsoft.com/v1.0/me/drive/items/FILE456/content": mockResponse("raw content data", { contentType: "application/pdf" }),
      });
      const out = await run({
        resource: "file",
        operation: "download",
        fileId: "{{ $json.fileId }}",
        binaryPropertyName: "file",
      }, [{ json: { fileId: "FILE456" } }]);

      expect(calls).toHaveLength(2);
      expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/FILE456");
      expect(calls[1].url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/FILE456/content");
      expect(out[0][0].json).toMatchObject({ id: "FILE456", name: "report.pdf" });
      expect(out[0][0].binary).toBeDefined();
      expect(out[0][0].binary!["file"]).toBeDefined();
      expect(out[0][0].binary!["file"].data).toBe(Buffer.from("raw content data").toString("base64"));
    });
  });

  describe("folder share", () => {
    it("creates a sharing link for a folder", async () => {
      const shareResponse = {
        "@odata.type": "#microsoft.graph.permission",
        id: "perm1",
        roles: ["read"],
        link: { scope: "anonymous", type: "view", webUrl: "https://1drv.ms/f/sharelink" },
      };
      installFetch({
        "POST https://graph.microsoft.com/v1.0/me/drive/items/FOLDER789/createLink": mockResponse(shareResponse),
      });
      const out = await run({
        resource: "folder",
        operation: "share",
        folderId: "{{ $json.folderId }}",
        permissions: "read",
        requireSignIn: true,
      }, [{ json: { folderId: "FOLDER789" } }]);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/FOLDER789/createLink");
      const body = JSON.parse(calls[0].body!);
      expect(body.type).toBe("view");
      expect(body.scope).toBe("organization");
      expect(out[0][0].json).toMatchObject({ link: expect.objectContaining({ webUrl: "https://1drv.ms/f/sharelink" }) });
    });
  });

  describe("file delete (continueOnFail)", () => {
    it("returns error item when continueOnFail is enabled", async () => {
      installFetch({
        "DELETE https://graph.microsoft.com/v1.0/me/drive/items/NONEXISTENT": mockResponse({ error: "itemNotFound" }, { status: 404 }),
      });
      const out = await run({
        resource: "file",
        operation: "delete",
        fileId: "{{ $json.fileId }}",
      }, [{ json: { fileId: "NONEXISTENT" } }], { continueOnFail: true });

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect(String(out[0][0].json.error)).toContain("itemNotFound");
    });
  });

  describe("file delete passthrough", () => {
    it("passes the original item through on successful delete", async () => {
      installFetch({
        "DELETE https://graph.microsoft.com/v1.0/me/drive/items/FILE456": mockResponse(null, { status: 204 }),
      });
      const out = await run({
        resource: "file",
        operation: "delete",
        fileId: "{{ $json.fileId }}",
      }, [{ json: { fileId: "FILE456", originalField: "preserved" } }]);

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ fileId: "FILE456", originalField: "preserved" });
      expect(out[0][0].json).not.toHaveProperty("success");
    });
  });

  describe("folder delete passthrough", () => {
    it("passes the original item through on successful folder delete", async () => {
      installFetch({
        "DELETE https://graph.microsoft.com/v1.0/me/drive/items/FOLDER001": mockResponse(null, { status: 204 }),
      });
      const out = await run({
        resource: "folder",
        operation: "delete",
        folderId: "FOLDER001",
      }, [{ json: { folderId: "FOLDER001", myField: "keep" } }]);

      expect(out[0][0].json).toMatchObject({ folderId: "FOLDER001", myField: "keep" });
      expect(out[0][0].json).not.toHaveProperty("success");
    });
  });

  describe("file copy (async 202)", () => {
    it("returns driveItem body when Graph returns 202 with body fields", async () => {
      const copyResponse = { id: "COPY001", name: "copied.txt", size: 100, parentReference: { driveId: "d1", id: "DEST" }, webUrl: "https://1drv.ms/u/copy001" };
      installFetch({
        "POST https://graph.microsoft.com/v1.0/me/drive/items/FILE456/copy": mockResponse(copyResponse, { status: 202 }),
      });
      const out = await run({
        resource: "file",
        operation: "copy",
        fileId: "{{ $json.fileId }}",
        destinationFolder: "{{ $json.destFolderId }}",
      }, [{ json: { fileId: "FILE456", destFolderId: "FOLDER789" } }]);

      expect(out[0][0].json).toMatchObject({ id: "COPY001", name: "copied.txt" });
      expect(out[0][0].json).not.toHaveProperty("success");
    });

    it("polls Location monitor URL when 202 response body is empty", async () => {
      const monitorResult = { id: "POLL001", name: "polled.txt", size: 50, parentReference: { driveId: "d1", id: "DEST" }, webUrl: "https://1drv.ms/u/poll001" };
      installFetch({
        "POST https://graph.microsoft.com/v1.0/me/drive/items/FILE456/copy": mockResponse("", { status: 202, headers: { location: "https://graph.microsoft.com/v1.0/monitor/op1" } }),
        "GET https://graph.microsoft.com/v1.0/monitor/op1": mockResponse({ status: "completed", resourceId: "POLL001", resourceLocation: "https://graph.microsoft.com/v1.0/me/drive/items/POLL001" }),
        "GET https://graph.microsoft.com/v1.0/me/drive/items/POLL001": mockResponse(monitorResult),
      });
      const out = await run({
        resource: "file",
        operation: "copy",
        fileId: "FILE456",
        destinationFolder: "FOLDER789",
      });

      expect(out[0][0].json).toMatchObject({ id: "POLL001", name: "polled.txt" });
      expect(out[0][0].json).not.toHaveProperty("success");
    });
  });

  describe("file get", () => {
    it("gets file metadata", async () => {
      const fileMeta = { id: "FILE101", name: "doc.docx", size: 2048, webUrl: "https://1drv.ms/u/file101" };
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/FILE101": mockResponse(fileMeta),
      });
      const out = await run({
        resource: "file",
        operation: "get",
        fileId: "FILE101",
      });

      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/FILE101");
      expect(out[0][0].json).toMatchObject({ id: "FILE101", name: "doc.docx" });
    });
  });

  describe("file rename", () => {
    it("renames a file", async () => {
      const renamed = { id: "FILE101", name: "new-name.docx" };
      installFetch({
        "PATCH https://graph.microsoft.com/v1.0/me/drive/items/FILE101": mockResponse(renamed),
      });
      const out = await run({
        resource: "file",
        operation: "rename",
        fileId: "FILE101",
        newName: "new-name.docx",
      });

      expect(calls[0].method).toBe("PATCH");
      expect(JSON.parse(calls[0].body!)).toEqual({ name: "new-name.docx" });
      expect(out[0][0].json).toMatchObject({ id: "FILE101", name: "new-name.docx" });
    });
  });

  describe("folder create", () => {
    it("creates a folder", async () => {
      const created = { id: "FOLDER_NEW", name: "New Folder", folder: {} };
      installFetch({
        "POST https://graph.microsoft.com/v1.0/me/drive/root/children": mockResponse(created),
      });
      const out = await run({
        resource: "folder",
        operation: "create",
        folderName: "New Folder",
      });

      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/drive/root/children");
      expect(JSON.parse(calls[0].body!)).toEqual({ name: "New Folder", folder: {} });
      expect(out[0][0].json).toMatchObject({ id: "FOLDER_NEW", name: "New Folder" });
    });
  });

  describe("authentication", () => {
    it("sends Bearer token from microsoftOneDriveOAuth2Api credential", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/FILE1": mockResponse({ id: "FILE1" }),
      });
      await run(
        { resource: "file", operation: "get", fileId: "FILE1" },
        [{}],
        { credentials: { microsoftOneDriveOAuth2Api: { accessToken: "my-token" } } },
      );
      expect(calls[0].headers["Authorization"]).toBe("Bearer my-token");
    });

    it("throws when no credential is configured", async () => {
      await expect(
        run(
          { resource: "file", operation: "get", fileId: "FILE1" },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow(/Microsoft credential is required/);
    });
  });

  it("processes multiple input items", async () => {
    const fileMeta = { id: "FILE1", name: "a.txt" };
    installFetch({
      "GET https://graph.microsoft.com/v1.0/me/drive/items/FILE1": mockResponse(fileMeta),
      "GET https://graph.microsoft.com/v1.0/me/drive/items/FILE2": mockResponse(fileMeta),
    });
    const out = await run(
      { resource: "file", operation: "get", fileId: "={{ $json.id }}" },
      [{ id: "FILE1" }, { id: "FILE2" }],
    );
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});