import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsSes";

const SES_CRED = {
  region: "us-east-1",
  accessKeyId: "AKIA",
  secretAccessKey: "secret",
};

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
let fetchResponse: { status: number; body: string; headers: Record<string, string> };

function mockFetch(resp: Partial<typeof fetchResponse> = {}) {
  fetchResponse = {
    status: 200,
    body: '<SendEmailResponse><SendEmailResult><MessageId>abc123</MessageId></SendEmailResult></SendEmailResponse>',
    headers: {},
    ...resp,
  };
  globalThis.fetch = async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return {
      status: fetchResponse.status,
      text: async () => fetchResponse.body,
      headers: new Map(Object.entries(fetchResponse.headers)),
      ok: fetchResponse.status >= 200 && fetchResponse.status < 300,
    } as Response;
  };
}

function makeCtxWithCred(
  node: INode,
  credentials: Record<string, Record<string, unknown>> = { aws: SES_CRED },
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
    getNodeInputItems: () => [{ json: {} }],
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

async function runSes(
  parameters: Record<string, unknown>,
  credentials: Record<string, Record<string, unknown>> = { aws: SES_CRED },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = makeCtxWithCred(node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue awsSes — n8n-nodes-base.awsSes", () => {
  beforeEach(() => {
    fetchCalls = [];
    mockFetch();
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS SES");
  });

  it("throws when the required credential is missing", async () => {
    await expect(runSes({ to: "a@b.com", from: "c@d.com", subject: "hi", text: "hello" }, {}))
      .rejects.toThrow(/credential "aws"/);
  });

  it("sends a plain-text email successfully", async () => {
    const out = await runSes({ to: "recipient@example.com", from: "sender@example.com", subject: "Hello", text: "World" });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain("email.us-east-1.amazonaws.com");
    expect(fetchCalls[0].init.method).toBe("POST");
    expect(fetchCalls[0].init.headers).toHaveProperty("x-amz-date");

    const body = typeof fetchCalls[0].init.body === "string" ? fetchCalls[0].init.body : "";
    expect(body).toContain("From: sender@example.com");
    expect(body).toContain("To: recipient@example.com");
    expect(body).toContain("Subject: Hello");
    expect(body).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(body).toContain("World");

    expect(out[0][0].json).toMatchObject({ success: true, messageId: "abc123" });
  });

  it("sends an HTML email", async () => {
    const out = await runSes({ to: "recipient@example.com", from: "sender@example.com", subject: "HTML Test", html: "<h1>Welcome</h1>" });

    expect(fetchCalls).toHaveLength(1);
    const body = typeof fetchCalls[0].init.body === "string" ? fetchCalls[0].init.body : "";
    expect(body).toContain("Content-Type: text/html; charset=UTF-8");
    expect(body).toContain("<h1>Welcome</h1>");
    expect(out[0][0].json).toMatchObject({ success: true, messageId: "abc123" });
  });

  it("throws when required parameter 'to' is missing", async () => {
    await expect(runSes({ from: "sender@example.com", subject: "Hi", text: "msg" }))
      .rejects.toThrow(/"to" is required/);
  });

  it("throws when required parameter 'from' is missing", async () => {
    await expect(runSes({ to: "recipient@example.com", subject: "Hi", text: "msg" }))
      .rejects.toThrow(/"from" is required/);
  });

  it("throws on SES API error", async () => {
    mockFetch({ status: 400, body: "<ErrorResponse><Error><Message>MissingRequiredHeader</Message></Error></ErrorResponse>" });
    await expect(runSes({ to: "recipient@example.com", from: "sender@example.com", subject: "Hi", text: "msg" }))
      .rejects.toThrow(/MissingRequiredHeader/);
  });

  it("reports error as item when continueOnFail is on", async () => {
    mockFetch({ status: 500, body: "<ErrorResponse><Error><Message>Throttling</Message></Error></ErrorResponse>" });
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { to: "recipient@example.com", from: "sender@example.com", subject: "Hi", text: "msg" },
    });
    const ctx = makeCtxWithCred(node);
    const ctxWithCoF = createExecutionContext({
      node,
      workflow: {
        id: "wf",
        name: "Test",
        active: false,
        nodes: [node],
        connections: {},
        settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async (name) => ({ aws: SES_CRED })[name] ?? null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctxWithCoF, node);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.success).toBe(false);
  });

  it("sends using template when template param is provided", async () => {
    mockFetch({ status: 200, body: '<SendTemplatedEmailResponse><SendTemplatedEmailResult><MessageId>tmpl-msg-1</MessageId></SendTemplatedEmailResult></SendTemplatedEmailResponse>' });
    const out = await runSes({ to: "recipient@example.com", from: "sender@example.com", subject: "Hi", template: "my-template", text: "msg" });

    expect(fetchCalls).toHaveLength(1);
    const body = typeof fetchCalls[0].init.body === "string" ? fetchCalls[0].init.body : "";
    expect(body).toContain("Action=SendTemplatedEmail");
    expect(body).toContain("Template=my-template");
    expect(out[0][0].json).toMatchObject({ success: true, messageId: "tmpl-msg-1" });
  });

  it("throws when neither html, text, nor template is provided", async () => {
    await expect(runSes({ to: "recipient@example.com", from: "sender@example.com", subject: "Hi" }))
      .rejects.toThrow(/"html", "text", or "template"/);
  });

  it("throws validation error when subject is missing and no template", async () => {
    await expect(runSes({ to: "recipient@example.com", from: "sender@example.com", subject: "", message: "No subject line" }))
      .rejects.toThrow(/AWS SES: "subject" is required/);
  });
});
