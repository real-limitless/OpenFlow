import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.airtop";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; }, entries() { return new Map().entries(); } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

let calls: Array<{ url: string; method: string; body?: string }>;
let responseQueue: ReturnType<typeof mockResponse>[];

function installFetch(responses?: ReturnType<typeof mockResponse> | ReturnType<typeof mockResponse>[]) {
  responseQueue = Array.isArray(responses) ? [...responses] : responses ? [responses] : [];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined });
    return responseQueue.shift() ?? mockResponse({});
  }));
}

function uninstallFetch() {
  vi.unstubAllGlobals();
}

describe("airtop node", () => {
  beforeEach(() => {
    installFetch();
  });
  afterEach(() => {
    uninstallFetch();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has descriptions registered", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
    expect(desc?.displayName).toBe("Airtop");
  });

  it("has resource and operation parameters", () => {
    const desc = getNodeType(TYPE);
    const resourceParam = desc?.properties?.find((p) => p.name === "resource");
    expect(resourceParam).toBeTruthy();
    expect(resourceParam?.type).toBe("options");
    const options = resourceParam?.options as Array<{ name: string; value: string }>;
    expect(options?.find((o) => o.value === "session")).toBeTruthy();
    expect(options?.find((o) => o.value === "window")).toBeTruthy();
    expect(options?.find((o) => o.value === "extraction")).toBeTruthy();
    expect(options?.find((o) => o.value === "interaction")).toBeTruthy();
    expect(options?.find((o) => o.value === "file")).toBeTruthy();
    expect(options?.find((o) => o.value === "agent")).toBeTruthy();
  });

  it("has credentials defined", () => {
    const desc = getNodeType(TYPE);
    expect(desc?.credentials?.length).toBeGreaterThanOrEqual(1);
    expect(desc?.credentials?.[0]?.name).toBe("airtopApi");
  });

  it("session create makes API call", async () => {
    responseQueue = [
      mockResponse({ data: { sessionId: "sess_abc123" } }),
    ];
    const exec = getExecutor(TYPE);
    const result = await exec!(
      {
        getInputItems: () => [{ json: {} }],
        getParam: (name: string) => {
          if (name === "resource") return "session";
          if (name === "operation") return "create";
          return undefined;
        },
        getNode: () => ({ name: "Airtop1", type: TYPE, typeVersion: 1, id: "n1", position: [0, 0], parameters: {} }),
        getCredential: async () => ({ apiKey: "test-key" }),
        continueOnFail: () => false,
      } as any,
      { name: "Airtop1", type: TYPE, typeVersion: 1, id: "n1", parameters: { resource: "session", operation: "create" } } as any,
    );
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/sessions");
    expect(calls[0].method).toBe("POST");
    expect(result[0]?.[0]?.json).toBeTruthy();
  });

  it("window create uses sessionId and URL", async () => {
    responseQueue = [
      mockResponse({ data: { windowId: "win_456" } }),
    ];
    const exec = getExecutor(TYPE);
    const result = await exec!(
      {
        getInputItems: () => [{ json: { sessionId: "sess_123" } }],
        getParam: (name: string) => {
          if (name === "resource") return "window";
          if (name === "operation") return "create";
          if (name === "sessionId") return "sess_123";
          if (name === "url") return "https://example.com";
          return undefined;
        },
        getNode: () => ({ name: "Airtop2", type: TYPE, typeVersion: 1, id: "n2", position: [0, 0], parameters: {} }),
        getCredential: async () => ({ apiKey: "test-key" }),
        continueOnFail: () => false,
      } as any,
      { name: "Airtop2", type: TYPE, typeVersion: 1, id: "n2", parameters: { resource: "window", operation: "create", sessionId: "sess_123", url: "https://example.com" } } as any,
    );
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/sessions/sess_123/windows");
    expect(result[0]?.[0]?.json).toBeTruthy();
  });

  it("extraction query sends prompt", async () => {
    responseQueue = [
      mockResponse({ data: { title: "Example", heading: "Welcome" } }),
    ];
    const exec = getExecutor(TYPE);
    const result = await exec!(
      {
        getInputItems: () => [{ json: { sessionId: "sess_123", windowId: "win_456" } }],
        getParam: (name: string) => {
          if (name === "resource") return "extraction";
          if (name === "operation") return "query";
          if (name === "sessionId") return "sess_123";
          if (name === "windowId") return "win_456";
          if (name === "prompt") return "Extract title and heading";
          return undefined;
        },
        getNode: () => ({ name: "Airtop3", type: TYPE, typeVersion: 1, id: "n3", position: [0, 0], parameters: {} }),
        getCredential: async () => ({ apiKey: "test-key" }),
        continueOnFail: () => false,
      } as any,
      { name: "Airtop3", type: TYPE, typeVersion: 1, id: "n3", parameters: { resource: "extraction", operation: "query", sessionId: "sess_123", windowId: "win_456", prompt: "Extract title and heading" } } as any,
    );
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/extraction/query");
    expect(result[0]?.[0]?.json).toBeTruthy();
  });

  it("click element interaction sends elementDescription", async () => {
    responseQueue = [
      mockResponse({ data: { actionId: "act_789", requestId: "req_abc", status: "success" } }),
    ];
    const exec = getExecutor(TYPE);
    const result = await exec!(
      {
        getInputItems: () => [{ json: { sessionId: "sess_123", windowId: "win_456" } }],
        getParam: (name: string) => {
          if (name === "resource") return "interaction";
          if (name === "operation") return "click";
          if (name === "sessionId") return "sess_123";
          if (name === "windowId") return "win_456";
          if (name === "elementDescription") return "the submit button";
          if (name === "clickType") return "click";
          return undefined;
        },
        getNode: () => ({ name: "Airtop4", type: TYPE, typeVersion: 1, id: "n4", position: [0, 0], parameters: {} }),
        getCredential: async () => ({ apiKey: "test-key" }),
        continueOnFail: () => false,
      } as any,
      { name: "Airtop4", type: TYPE, typeVersion: 1, id: "n4", parameters: { resource: "interaction", operation: "click", sessionId: "sess_123", windowId: "win_456", elementDescription: "the submit button", clickType: "click" } } as any,
    );
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/interaction/click");
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.elementDescription).toBe("the submit button");
    expect(result[0]?.[0]?.json).toBeTruthy();
  });

  it("upload file with triggerFileInput sends file metadata", async () => {
    responseQueue = [
      mockResponse({ data: { fileId: "file_001", fileName: "test.pdf", status: "uploaded" } }),
    ];
    const exec = getExecutor(TYPE);
    const result = await exec!(
      {
        getInputItems: () => [{ json: { sessionId: "sess_123", windowId: "win_456" }, binary: { data: { type: "application/pdf", data: "base64mock" } } }],
        getParam: (name: string) => {
          if (name === "resource") return "file";
          if (name === "operation") return "upload";
          if (name === "sessionId") return "sess_123";
          if (name === "windowId") return "win_456";
          if (name === "fileName") return "test.pdf";
          if (name === "fileType") return "customer_upload";
          if (name === "source") return "binary";
          if (name === "binaryPropertyName") return "data";
          if (name === "triggerFileInputParameter") return true;
          if (name === "elementDescription") return "file upload input";
          return undefined;
        },
        getNode: () => ({ name: "Airtop5", type: TYPE, typeVersion: 1, id: "n5", position: [0, 0], parameters: {} }),
        getCredential: async () => ({ apiKey: "test-key" }),
        continueOnFail: () => false,
      } as any,
      { name: "Airtop5", type: TYPE, typeVersion: 1, id: "n5", parameters: { resource: "file", operation: "upload", sessionId: "sess_123", windowId: "win_456", fileName: "test.pdf", fileType: "customer_upload", source: "binary", binaryPropertyName: "data", triggerFileInputParameter: true, elementDescription: "file upload input" } } as any,
    );
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/sessions/sess_123/files");
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.fileName).toBe("test.pdf");
    expect(reqBody.triggerFileInputParameter).toBe(true);
    expect(result[0]?.[0]?.json).toBeTruthy();
  });

  it("run agent with await sends agentId and parameters", async () => {
    responseQueue = [
      mockResponse({ data: { invocationId: "inv_001", status: "completed", output: { success: true } } }),
    ];
    const exec = getExecutor(TYPE);
    const result = await exec!(
      {
        getInputItems: () => [{ json: { sessionId: "sess_123", windowId: "win_456" } }],
        getParam: (name: string) => {
          if (name === "resource") return "agent";
          if (name === "operation") return "run";
          if (name === "agentId") return "agent_abc";
          if (name === "awaitExecution") return true;
          if (name === "timeout") return 120;
          if (name === "agentParameters") return '{"key":"value"}';
          if (name === "sessionId") return "sess_123";
          if (name === "windowId") return "win_456";
          return undefined;
        },
        getNode: () => ({ name: "Airtop6", type: TYPE, typeVersion: 1, id: "n6", position: [0, 0], parameters: {} }),
        getCredential: async () => ({ apiKey: "test-key" }),
        continueOnFail: () => false,
      } as any,
      { name: "Airtop6", type: TYPE, typeVersion: 1, id: "n6", parameters: { resource: "agent", operation: "run", agentId: "agent_abc", awaitExecution: true, timeout: 120, agentParameters: '{"key":"value"}', sessionId: "sess_123", windowId: "win_456" } } as any,
    );
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/agents/agent_abc/invoke");
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.awaitExecution).toBe(true);
    expect(reqBody.agentParameters).toBe('{"key":"value"}');
    expect(result[0]?.[0]?.json).toBeTruthy();
  });
});
