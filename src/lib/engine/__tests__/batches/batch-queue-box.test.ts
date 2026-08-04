import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.box";

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
  const rawText = typeof init.body === "string" ? init.body : text;
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
    },
    async json() {
      return JSON.parse(rawText);
    },
    async text() {
      return rawText;
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
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(
  response: ReturnType<typeof mockResponse> = mockResponse({ id: "file_1", type: "file", name: "test.txt" }),
) {
  nextResponse = response;
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

const CREDS = { boxOAuth2Api: { accessToken: "tok_box_123" } };

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

describe("batch-queue box — n8n-nodes-base.box", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Box");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.box")).toBe(canonical);
  });

  it("gets a file via GET /files/{id}", async () => {
    installFetch(mockResponse({ id: "12345", type: "file", name: "doc.pdf", size: 1024 }));
    const out = await run({
      resource: "file",
      operation: "get",
      fileId: "12345",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.box.com/2.0/files/12345");
    expect(out[0][0].json).toMatchObject({ id: "12345", type: "file", name: "doc.pdf" });
  });

  it("deletes a file and returns success:true", async () => {
    installFetch(mockResponse({}, { status: 204 }));
    const out = await run({
      resource: "file",
      operation: "delete",
      fileId: "12345",
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.box.com/2.0/files/12345");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("copies a file via POST /files/{id}/copy", async () => {
    installFetch(mockResponse({ id: "copied_1", type: "file", name: "copy.pdf" }));
    const out = await run({
      resource: "file",
      operation: "copy",
      fileId: "12345",
      parentId: "folder_99",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.box.com/2.0/files/12345/copy");
    expect(JSON.parse(calls[0].body!)).toEqual({ parent: { id: "folder_99" } });
    expect(out[0][0].json).toMatchObject({ id: "copied_1" });
  });

  it("copies a file with a new name", async () => {
    installFetch(mockResponse({ id: "copied_2", type: "file", name: "renamed.pdf" }));
    await run({
      resource: "file",
      operation: "copy",
      fileId: "12345",
      parentId: "folder_99",
      name: "renamed.pdf",
    });

    expect(JSON.parse(calls[0].body!)).toEqual({
      parent: { id: "folder_99" },
      name: "renamed.pdf",
    });
  });

  it("searches files via GET /search", async () => {
    installFetch(mockResponse({
      entries: [
        { id: "f1", type: "file", name: "report.pdf" },
        { id: "f2", type: "file", name: "notes.txt" },
      ],
    }));
    const out = await run({
      resource: "file",
      operation: "search",
      query: "test",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/search");
    expect(calls[0].url).toContain("query=test");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "f1" });
    expect(out[0][1].json).toMatchObject({ id: "f2" });
  });

  it("shares a file by setting shared_link", async () => {
    installFetch(mockResponse({
      id: "12345",
      type: "file",
      name: "shared.pdf",
      shared_link: { url: "https://box.com/s/abc", access: "open" },
    }));
    const out = await run({
      resource: "file",
      operation: "share",
      fileId: "12345",
      additionalFields: {
        sharedLinkAccess: "company",
      },
    });

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.box.com/2.0/files/12345");
    expect(JSON.parse(calls[0].body!)).toMatchObject({
      shared_link: { access: "company", permissions: { can_download: true, can_preview: true } },
    });
    expect(out[0][0].json).toMatchObject({ id: "12345" });
  });

  it("creates a folder via POST /folders", async () => {
    installFetch(mockResponse({ id: "folder_new", type: "folder", name: "My Folder" }));
    const out = await run({
      resource: "folder",
      operation: "create",
      name: "My Folder",
      parentId: "0",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.box.com/2.0/folders");
    expect(JSON.parse(calls[0].body!)).toEqual({ name: "My Folder", parent: { id: "0" } });
    expect(out[0][0].json).toMatchObject({ id: "folder_new", type: "folder", name: "My Folder" });
  });

  it("gets a folder via GET /folders/{id}", async () => {
    installFetch(mockResponse({ id: "folder_1", type: "folder", name: "Root" }));
    const out = await run({
      resource: "folder",
      operation: "get",
      folderId: "folder_1",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.box.com/2.0/folders/folder_1");
    expect(out[0][0].json).toMatchObject({ id: "folder_1" });
  });

  it("deletes a folder and returns success:true", async () => {
    installFetch(mockResponse({}, { status: 204 }));
    const out = await run({
      resource: "folder",
      operation: "delete",
      folderId: "folder_1",
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.box.com/2.0/folders/folder_1");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("searches folders via GET /search", async () => {
    installFetch(mockResponse({
      entries: [
        { id: "folder_a", type: "folder", name: "invoices" },
      ],
    }));
    const out = await run({
      resource: "folder",
      operation: "search",
      query: "invoices",
    });

    expect(calls[0].url).toContain("/search");
    expect(calls[0].url).toContain("query=invoices");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "folder_a" });
  });

  it("updates a folder via PUT /folders/{id}", async () => {
    installFetch(mockResponse({ id: "folder_1", type: "folder", name: "Renamed", description: "updated" }));
    const out = await run({
      resource: "folder",
      operation: "update",
      folderId: "folder_1",
      name: "Renamed",
      additionalFields: {
        description: "updated",
        canNonOwnersInvite: false,
        tags: "important,work",
      },
    });

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.box.com/2.0/folders/folder_1");
    const body = JSON.parse(calls[0].body!);
    expect(body.name).toBe("Renamed");
    expect(body.description).toBe("updated");
    expect(body.can_non_owners_invite).toBe(false);
    expect(body.tags).toEqual(["important", "work"]);
    expect(out[0][0].json).toMatchObject({ id: "folder_1" });
  });

  it("sends Bearer token from boxOAuth2Api credential", async () => {
    await run(
      {
        resource: "file",
        operation: "get",
        fileId: "12345",
      },
      [{}],
      { credentials: CREDS },
    );

    expect(calls[0].headers["Authorization"]).toBe("Bearer tok_box_123");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "file",
          operation: "get",
          fileId: "12345",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/Box: credential is not configured/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ message: "Bad Request" }, { status: 400 }));
    const out = await run(
      {
        resource: "file",
        operation: "get",
        fileId: "bad_id",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("makes one request per input item", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit | undefined) => {
        calls.push({
          url: String(url),
          method: init?.method ?? "GET",
          headers: (init?.headers as Record<string, string>) ?? {},
          body: typeof init?.body === "string" ? init.body : undefined,
        });
        callCount++;
        return mockResponse({ id: `file_${callCount}` });
      }),
    );
    await run(
      {
        resource: "file",
        operation: "get",
        fileId: "={{ $json.file_id }}",
      },
      [{ file_id: "id_a" }, { file_id: "id_b" }],
      { credentials: CREDS },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/files/");
    expect(calls[1].url).toContain("/files/");
  });

  describe("upload (spec acceptance)", () => {
    it("uploads file from text content (binaryData=false)", async () => {
      installFetch(mockResponse({
        total_count: 1,
        entries: [{ id: "f_up1", type: "file", name: "hello.txt" }],
      }));
      const out = await run({
        resource: "file",
        operation: "upload",
        fileName: "hello.txt",
        binaryData: false,
        fileContent: "Hello, Box!",
        parentId: "0",
      });

      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://upload.box.com/api/2.0/files/content");
      expect(calls[0].body).toContain("Hello, Box!");
      expect(calls[0].body).toContain("hello.txt");
      expect(calls[0].body).toContain('"parent":{"id":"0"}');
      expect(out[0][0].json).toMatchObject({ id: "f_up1", name: "hello.txt", type: "file" });
    });

    it("uploads file from binary data (binaryData=true)", async () => {
      installFetch(mockResponse({
        total_count: 1,
        entries: [{ id: "f_up2", type: "file", name: "test.txt" }],
      }));
      const out = await run(
        {
          resource: "file",
          operation: "upload",
          fileName: "test.txt",
          binaryData: true,
          binaryPropertyName: "data",
          parentId: "0",
        },
        [{
          json: {},
          binary: {
            data: { data: "dGVzdCBjb250ZW50", mimeType: "text/plain", fileName: "test.txt" },
          },
        } satisfies INodeExecutionData],
      );

      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://upload.box.com/api/2.0/files/content");
      expect(calls[0].body).toContain("dGVzdCBjb250ZW50");
      expect(out[0][0].json).toMatchObject({ id: "f_up2", name: "test.txt", type: "file" });
    });
  });

  describe("download (spec acceptance)", () => {
    it("downloads a file and returns binary output", async () => {
      const fileInfo = { id: "12345", type: "file", name: "doc.pdf", size: 1024 };
      installFetch(mockResponse(fileInfo, {
        headers: { "Box-API-Result": JSON.stringify(fileInfo) },
        contentType: "application/octet-stream",
        body: "binary content here",
      }));
      const out = await run({
        resource: "file",
        operation: "download",
        fileId: "12345",
        binaryPropertyName: "data",
      });

      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://api.box.com/2.0/files/12345/content");
      expect(out[0][0].json).toMatchObject({ id: "12345", name: "doc.pdf" });
      expect(out[0][0].binary).toBeDefined();
      expect(out[0][0].binary!.data).toBeDefined();
      expect(out[0][0].binary!.data.mimeType).toBe("application/octet-stream");
      expect(out[0][0].binary!.data.fileName).toBe("doc.pdf");
    });
  });
});
