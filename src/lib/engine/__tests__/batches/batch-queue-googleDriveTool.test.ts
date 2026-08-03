import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleDriveTool";
const CREDS = { googleDriveOAuth2Api: { accessToken: "tok_drive" } };

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

type Handler = (url: string, method: string) => ReturnType<typeof mockResponse>;
let handler: Handler;

function installFetch(h: Handler) {
  handler = h;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) =>
      handler(String(url), init?.method ?? "GET"),
    ),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleDriveOAuth2Api: { name: "googleDriveOAuth2Api" } },
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
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleDriveTool executor – acceptance tests", () => {
  it("file create (text)", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url === "https://www.googleapis.com/drive/v3/files") {
        return mockResponse({
          id: "file1",
          name: "notes.txt",
          mimeType: "text/plain",
          parents: ["root"],
          webViewLink: "https://drive.google.com/file/d/file1",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "create",
      fileName: "notes.txt",
      content: "hello",
      folderId: "root",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.name).toBe("notes.txt");
    expect(json.id).toBeTruthy();
    expect(json.mimeType).toBe("text/plain");
    expect(json.parents).toContain("root");
  });

  it("file search by name", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("name+contains")) {
        return mockResponse({
          files: [
            { id: "f1", name: "notes.txt", mimeType: "text/plain", parents: ["root"] },
            { id: "f2", name: "notes-2.txt", mimeType: "text/plain", parents: ["root"] },
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "fileFolder",
      operation: "search",
      searchMode: "name",
      query: "notes",
      returnAll: false,
      limit: 5,
    });
    const items = out[0].map((item) => item.json as Record<string, unknown>);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items[0].name).toMatch(/notes/);
    expect(items[0].id).toBeTruthy();
    expect(items[0].mimeType).toBeTruthy();
  });

  it("file share with user", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/permissions")) {
        return mockResponse({
          id: "perm1",
          role: "reader",
          type: "user",
          emailAddress: "alice@example.com",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "share",
      fileId: "abc123",
      permissions: [{ role: "reader", type: "user", email: "alice@example.com" }],
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.role).toBe("reader");
    expect(json.emailAddress).toBe("alice@example.com");
  });

  it("file move between folders", async () => {
    installFetch((url, method) => {
      if (url.includes("fields=parents")) {
        return mockResponse({ parents: ["1oldFolder"] });
      }
      if (method === "PATCH" && url.includes("addParents")) {
        return mockResponse({
          id: "abc123",
          name: "moved_file",
          mimeType: "text/plain",
          parents: ["2targetFolder"],
          webViewLink: "https://drive.google.com/file/d/abc123",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "move",
      fileId: "abc123",
      parentId: "2targetFolder",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBe("abc123");
    expect(json.parents).toEqual(["2targetFolder"]);
  });

  it("folder create", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url === "https://www.googleapis.com/drive/v3/files") {
        return mockResponse({
          id: "folder1",
          name: "NewFolder",
          mimeType: "application/vnd.google-apps.folder",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "folder",
      operation: "create",
      folderName: "NewFolder",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBeTruthy();
    expect(json.name).toBe("NewFolder");
    expect(json.mimeType).toBe("application/vnd.google-apps.folder");
  });

  it("file upload with binary data", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
        return mockResponse({
          id: "up1",
          name: "report.pdf",
          mimeType: "application/pdf",
          parents: ["1abcFolder"],
          webViewLink: "https://drive.google.com/file/d/up1",
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "file",
        operation: "upload",
        binaryField: "file",
        fileName: "report.pdf",
        folderId: "1abcFolder",
      },
      [
        {
          json: {},
          binary: {
            file: { fileName: "report.pdf", mimeType: "application/pdf", data: "base64data" },
          },
        },
      ],
    );
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.name).toBe("report.pdf");
    expect(json.id).toBeTruthy();
    expect(json.mimeType).toBe("application/pdf");
    expect(json.parents).toContain("1abcFolder");
  });
});
