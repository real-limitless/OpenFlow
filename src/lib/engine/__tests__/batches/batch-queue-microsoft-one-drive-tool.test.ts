import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TOOL_TYPE = "n8n-nodes-base.microsoftOneDriveTool";
const BASE_TYPE = "n8n-nodes-base.microsoftOneDrive";

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

const CREDS = { microsoftOneDriveOAuth2Api: { accessToken: "mock-token-abc" } };

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
    type: TOOL_TYPE,
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TOOL_TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue microsoftOneDriveTool — n8n-nodes-base.microsoftOneDriveTool", () => {
  it("resolves via alias to the base OneDrive executor", () => {
    const toolExecutor = getExecutor(TOOL_TYPE);
    const baseExecutor = getExecutor(BASE_TYPE);
    expect(toolExecutor).toBeDefined();
    expect(baseExecutor).toBeDefined();
    expect(toolExecutor).toBe(baseExecutor);
  });

  it("the tool type resolves a non-placeholder description from the alias chain", () => {
    const desc = getNodeType(TOOL_TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Microsoft OneDrive");
  });

  describe("AI agent file upload (acceptance test 1)", () => {
    it("uploads content to OneDrive root and returns driveItem metadata", async () => {
      const driveItem = {
        id: "UPLOAD001",
        name: "report.txt",
        size: 42,
        webUrl: "https://1drv.ms/u/upload001",
        createdDateTime: "2025-01-01T00:00:00Z",
        lastModifiedDateTime: "2025-01-01T00:00:01Z",
      };
      installFetch({
        "PUT https://graph.microsoft.com/v1.0/me/drive/root:/report.txt:/content": mockResponse(driveItem),
      });
      const out = await run({
        resource: "file",
        operation: "upload",
        parentFolder: "",
        fileName: "report.txt",
        binaryPropertyName: "file",
      }, [{
        json: {},
        binary: {
          file: {
            mimeType: "text/plain",
            data: Buffer.from("hello world").toString("base64"),
          },
        },
      }]);
      expect(out[0][0].json).toMatchObject({ id: "UPLOAD001", name: "report.txt", webUrl: expect.any(String) });
    });
  });

  describe("Folder share with AI parameters (acceptance test 2)", () => {
    it("creates anonymous view-only sharing link for a folder", async () => {
      const shareResponse = {
        id: "perm1",
        roles: ["read"],
        link: { scope: "anonymous", type: "view", webUrl: "https://1drv.ms/f/sharelink" },
      };
      installFetch({
        "POST https://graph.microsoft.com/v1.0/me/drive/items/FOLDER123/createLink": mockResponse(shareResponse),
      });
      const out = await run({
        resource: "folder",
        operation: "share",
        folderId: "{{ $json.folderId }}",
        permissions: "read",
        requireSignIn: false,
      }, [{ json: { folderId: "FOLDER123" } }]);
      expect(calls[0].method).toBe("POST");
      const body = JSON.parse(calls[0].body!);
      expect(body.type).toBe("view");
      expect(body.scope).toBe("anonymous");
      expect(out[0][0].json).toMatchObject({ link: expect.objectContaining({ webUrl: "https://1drv.ms/f/sharelink" }) });
    });
  });

  describe("Search-then-download chain (acceptance test 3)", () => {
    it("searches for a file and then downloads it in sequence", async () => {
      const searchResults = {
        value: [{ id: "FOUND1", name: "target.pdf", size: 2048 }],
      };
      const metadata = { id: "FOUND1", name: "target.pdf", size: 2048, file: { mimeType: "application/pdf" } };
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/root/search(q='target.pdf')": mockResponse(searchResults),
        "GET https://graph.microsoft.com/v1.0/me/drive/items/FOUND1": mockResponse(metadata),
        "GET https://graph.microsoft.com/v1.0/me/drive/items/FOUND1/content": mockResponse("pdf content", { contentType: "application/pdf" }),
      });

      const searchOut = await run({
        resource: "file",
        operation: "search",
        query: "target.pdf",
      });
      expect(searchOut[0][0].json).toMatchObject({ id: "FOUND1", name: "target.pdf" });

      const fileId = (searchOut[0][0].json as Record<string, unknown>).id as string;
      const downloadOut = await run({
        resource: "file",
        operation: "download",
        fileId,
        binaryPropertyName: "file",
      }, [{ json: { fileId } }]);

      expect(downloadOut[0][0].binary).toBeDefined();
      expect(downloadOut[0][0].binary!["file"]).toBeDefined();
      expect(downloadOut[0][0].binary!["file"].data).toBe(Buffer.from("pdf content").toString("base64"));
    });
  });

  describe("Continue-on-fail with deleted file (acceptance test 4)", () => {
    it("emits error item instead of throwing when continueOnFail is true", async () => {
      installFetch({
        "DELETE https://graph.microsoft.com/v1.0/me/drive/items/GONE": mockResponse({ error: "itemNotFound" }, { status: 404 }),
      });
      const out = await run({
        resource: "file",
        operation: "delete",
        fileId: "GONE",
      }, [{}], { continueOnFail: true });
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect(String(out[0][0].json.error)).toContain("itemNotFound");
    });
  });

  describe("Async copy completion (acceptance test 5)", () => {
    it("polls monitor URL and returns driveItem metadata, not bare success", async () => {
      const monitorResult = { id: "COPY001", name: "copied.txt", size: 100, parentReference: { driveId: "d1", id: "DEST" }, webUrl: "https://1drv.ms/u/copy001" };
      installFetch({
        "POST https://graph.microsoft.com/v1.0/me/drive/items/SRC001/copy": mockResponse("", { status: 202, headers: { location: "https://graph.microsoft.com/v1.0/monitor/op1" } }),
        "GET https://graph.microsoft.com/v1.0/monitor/op1": mockResponse({ status: "completed", resourceId: "COPY001", resourceLocation: "https://graph.microsoft.com/v1.0/me/drive/items/COPY001" }),
        "GET https://graph.microsoft.com/v1.0/me/drive/items/COPY001": mockResponse(monitorResult),
      });
      const out = await run({
        resource: "file",
        operation: "copy",
        fileId: "SRC001",
      });
      expect(out[0][0].json).toMatchObject({ id: "COPY001", name: "copied.txt" });
      expect(out[0][0].json).not.toHaveProperty("success");
    });
  });
});
