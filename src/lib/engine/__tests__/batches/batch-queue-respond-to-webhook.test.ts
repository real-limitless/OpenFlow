import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  getWebhookResponse,
  clearAllWebhookResponses,
} from "../../executors/respond-to-webhook";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.respondToWebhook";

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
  credentials: Record<string, Record<string, unknown>> = {},
  continueOnFail = false,
  executionId = "exec-rtw",
): ExecutionContext {
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
    __executionId: executionId,
  };
  return createExecutionContext({
    node,
    workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

async function runRespond(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    typeVersion?: number;
    credentials?: Record<string, Record<string, unknown>>;
    continueOnFail?: boolean;
    executionId?: string;
  } = {},
) {
  const node = makeNode({
    name: "Respond",
    type: TYPE,
    typeVersion: opts.typeVersion ?? 1,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(
    items,
    node,
    opts.credentials ?? {},
    opts.continueOnFail ?? false,
    opts.executionId ?? "exec-rtw",
  );
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue respond-to-webhook — n8n-nodes-base.respondToWebhook", () => {
  beforeEach(() => {
    clearAllWebhookResponses();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Respond to Webhook");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.respondToWebhook")).toBe(canonical);
  });

  it("JSON body response — parses string body, empty headers, 200", async () => {
    const { out } = await runRespond(
      { respondWith: "json", responseBody: '{\n  "ok": true\n}' },
      [{ hello: "world" }],
      { executionId: "rtw-json" },
    );

    const res = getWebhookResponse("rtw-json");
    expect(res).toEqual({ statusCode: 200, body: { ok: true }, headers: {} });
    expect(out[0]).toEqual([{ json: { hello: "world" } }]);
  });

  it("first incoming item (default) — body is first item json", async () => {
    await runRespond(
      { respondWith: "firstIncomingItem" },
      [{ id: 1, name: "alpha" }, { id: 2, name: "beta" }],
      { executionId: "rtw-first" },
    );

    const res = getWebhookResponse("rtw-first");
    expect(res?.body).toEqual({ id: 1, name: "alpha" });
    expect(res?.statusCode).toBe(200);
  });

  it("redirect with default status — 307, location header, null body", async () => {
    await runRespond(
      { respondWith: "redirect", redirectURL: "https://example.com" },
      [{}],
      { executionId: "rtw-redirect" },
    );

    expect(getWebhookResponse("rtw-redirect")).toEqual({
      statusCode: 307,
      body: null,
      headers: { location: "https://example.com" },
    });
  });

  it("text response with custom code and lowercased headers", async () => {
    await runRespond(
      {
        respondWith: "text",
        responseBody: "Workflow completed",
        options: {
          responseCode: 202,
          responseHeaders: {
            entries: [
              { name: "Content-Type", value: "text/plain" },
              { name: "X-Custom", value: "abc" },
            ],
          },
        },
      },
      [{}],
      { executionId: "rtw-text" },
    );

    expect(getWebhookResponse("rtw-text")).toEqual({
      statusCode: 202,
      body: "Workflow completed",
      headers: { "content-type": "text/plain", "x-custom": "abc" },
    });
  });

  it("text response defaults to text/html content-type when none provided", async () => {
    await runRespond(
      { respondWith: "text", responseBody: "hi" },
      [{}],
      { executionId: "rtw-text-default" },
    );

    const res = getWebhookResponse("rtw-text-default");
    expect(res?.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(res?.body).toBe("hi");
  });

  it("all incoming items with responseKey wraps the array", async () => {
    await runRespond(
      { respondWith: "allIncomingItems", options: { responseKey: "data" } },
      [{ id: 1 }, { id: 2 }],
      { executionId: "rtw-all" },
    );

    expect(getWebhookResponse("rtw-all")?.body).toEqual({ data: [{ id: 1 }, { id: 2 }] });
  });

  it("response output branch (v1.4 + enableResponseOutput) emits two outputs", async () => {
    const { out } = await runRespond(
      {
        respondWith: "json",
        responseBody: '{\n  "ok": true\n}',
        enableResponseOutput: true,
      },
      [{ x: 1 }],
      { typeVersion: 1.4, executionId: "rtw-branch" },
    );

    expect(out[0]).toEqual([{ json: { x: 1 } }]);
    expect(out[1]).toEqual([
      { json: { response: { body: { ok: true }, headers: {}, statusCode: 200 } } },
    ]);
  });

  it("v1.3 always emits the response output branch", async () => {
    const { out } = await runRespond(
      { respondWith: "noData" },
      [{ x: 1 }],
      { typeVersion: 1.3, executionId: "rtw-v13" },
    );

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual([{ json: { x: 1 } }]);
    expect(out[1][0].json.response.statusCode).toBe(200);
  });

  it("v1.4 without enableResponseOutput emits a single output", async () => {
    const { out } = await runRespond(
      { respondWith: "noData" },
      [{ x: 1 }],
      { typeVersion: 1.4, executionId: "rtw-v14-single" },
    );

    expect(out).toHaveLength(1);
  });

  it("noData — empty body, default 200", async () => {
    await runRespond({ respondWith: "noData" }, [{ a: 1 }], {
      executionId: "rtw-nodata",
    });

    expect(getWebhookResponse("rtw-nodata")).toEqual({
      statusCode: 200,
      body: null,
      headers: {},
    });
  });

  it("jwt mode signs a token with jwtAuth credential", async () => {
    const { out } = await runRespond(
      { respondWith: "jwt", payload: { sub: "abc" } },
      [{}],
      {
        executionId: "rtw-jwt",
        credentials: {
          jwtAuth: { keyType: "passphrase", secret: "s3cret", algorithm: "HS256" },
        },
      },
    );

    const res = getWebhookResponse("rtw-jwt");
    const token = (res?.body as { token: string }).token;
    expect(token).toBeTruthy();
    expect(token.split(".")).toHaveLength(3);

    const payloadB64 = token.split(".")[1];
    const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64").toString("utf8"),
    );
    expect(payload.sub).toBe("abc");

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("jwt mode throws 'Error signing JWT token' on signing failure", async () => {
    await expect(
      runRespond(
        { respondWith: "jwt", payload: { sub: "abc" } },
        [{}],
        {
          executionId: "rtw-jwt-fail",
          credentials: {
            jwtAuth: { keyType: "pemKey", privateKey: "not-a-key", algorithm: "RS256" },
          },
        },
      ),
    ).rejects.toThrow(/Error signing JWT token/i);
  });

  it("invalid JSON responseBody throws the spec error message", async () => {
    await expect(
      runRespond(
        { respondWith: "json", responseBody: "{ not valid" },
        [{}],
        { executionId: "rtw-badjson" },
      ),
    ).rejects.toThrow(/Invalid JSON in 'Response Body' field/i);
  });

  it("unsupported respondWith throws not-supported error", async () => {
    await expect(
      runRespond({ respondWith: "bogus" }, [{}], { executionId: "rtw-bogus" }),
    ).rejects.toThrow(/not supported/i);
  });

  it("binary mode throws when no binary data on first item", async () => {
    await expect(
      runRespond({ respondWith: "binary" }, [{}], { executionId: "rtw-bin-empty" }),
    ).rejects.toThrow(/No binary data exists on the first item!/i);
  });

  it("binary mode returns binary buffer from first item (automatically)", async () => {
    const { out } = await runRespond(
      { respondWith: "binary" },
      [{ json: {}, binary: { data: { data: "aGVsbG8=", mimeType: "text/plain" } } }],
      { executionId: "rtw-bin" },
    );

    const res = getWebhookResponse("rtw-bin");
    expect(Buffer.isBuffer(res?.body)).toBe(true);
    expect((res?.body as Buffer).toString("utf8")).toBe("hello");
    expect(res?.headers["content-type"]).toBe("text/plain");
    expect(out[0]).toHaveLength(1);
  });

  it("continueOnFail returns error item instead of throwing", async () => {
    const { out } = await runRespond(
      { respondWith: "json", responseBody: "{ not valid" },
      [{}],
      { executionId: "rtw-cof", continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/Invalid JSON in 'Response Body' field/i);
    expect(getWebhookResponse("rtw-cof")).toBeUndefined();
  });

  it("passes input items through unchanged on output 0", async () => {
    const { out } = await runRespond(
      { respondWith: "noData" },
      [{ a: 1 }, { b: 2 }],
      { executionId: "rtw-passthru" },
    );

    expect(out[0]).toEqual([{ json: { a: 1 } }, { json: { b: 2 } }]);
  });
});