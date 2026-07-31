import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleDocs";
const CREDS = { googleDocsOAuth2Api: { accessToken: "tok_docs" } };

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

type Handler = (
  url: string,
  method: string,
  body?: unknown,
) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      lastBody = body;
      return handler(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleDocsOAuth2Api: { name: "googleDocsOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
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
    continueOnFail: opts?.continueOnFail ?? false,
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

describe("googleDocs executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("Create document", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("drive/v3/files")) {
        return mockResponse({
          id: "doc-new-1",
          name: "Test Document",
          mimeType: "application/vnd.google-apps.document",
          kind: "drive#file",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "document",
      operation: "create",
      driveId: "myDrive",
      folderId: "",
      title: "Test Document",
    });
    expect(out[0][0].json).toMatchObject({
      id: "doc-new-1",
      kind: "docs#document",
      mimeType: "application/vnd.google-apps.document",
      name: "Test Document",
    });
  });

  it("Get document (simplified)", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/documents/abc123")) {
        return mockResponse({
          documentId: "abc123",
          body: {
            content: [
              {
                paragraph: {
                  elements: [{ textRun: { content: "The document text content\n" } }],
                },
              },
            ],
          },
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "document",
      operation: "get",
      documentURL: "https://docs.google.com/document/d/abc123/edit",
      simple: true,
    });
    expect(out[0][0].json).toEqual({
      documentId: "abc123",
      content: "The document text content\n",
    });
  });

  it("Update document — insert text at end", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes(":batchUpdate")) {
        return mockResponse({ documentId: "abc123", replies: [{}] });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "document",
        operation: "update",
        documentURL: "abc123",
        simple: true,
        actionsUi: {
          actionFields: [
            {
              object: "text",
              action: "insert",
              text: "={{$json.text}}",
            },
          ],
        },
      },
      [{ text: "Appended paragraph" }],
    );
    expect(out[0][0].json).toEqual({ documentId: "abc123" });
    expect(lastBody).toMatchObject({
      requests: [
        {
          insertText: {
            text: "Appended paragraph",
            endOfSegmentLocation: {},
          },
        },
      ],
    });
  });

  it("Update document — find and replace text", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes(":batchUpdate")) {
        return mockResponse({ documentId: "abc123" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "document",
      operation: "update",
      documentURL: "abc123",
      simple: true,
      actionsUi: {
        actionFields: [
          {
            object: "text",
            action: "replaceAll",
            text: "old text",
            replaceText: "new text",
            matchCase: false,
          },
        ],
      },
    });
    expect(out[0][0].json).toEqual({ documentId: "abc123" });
    expect(lastBody).toMatchObject({
      requests: [
        {
          replaceAllText: {
            containsText: { text: "old text", matchCase: false },
            replaceText: "new text",
          },
        },
      ],
    });
  });

  it("Update document — with write control", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes(":batchUpdate")) {
        return mockResponse({ documentId: "abc123" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "document",
      operation: "update",
      documentURL: "abc123",
      actionsUi: {
        actionFields: [{ object: "text", action: "insert", text: "Hello" }],
      },
      updateFields: {
        writeControlObject: {
          control: "targetRevisionId",
          value: "latest",
        },
      },
    });
    expect(out[0][0].json).toEqual({ documentId: "abc123" });
    expect(lastBody).toMatchObject({
      writeControl: { targetRevisionId: "latest" },
      requests: [{ insertText: { text: "Hello" } }],
    });
  });

  it("continueOnFail emits error item", async () => {
    installFetch(() => mockResponse({ error: { message: "not found" } }, 404));
    const out = await run(
      {
        resource: "document",
        operation: "get",
        documentURL: "missing",
        simple: true,
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("not found") });
  });
});
