import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { getWebhookResponse, clearAllWebhookResponses } from "../../executors/respond-to-webhook";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.webhook";

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
  executionId = "exec-wh",
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
    continueOnFail: false,
  });
}

async function runWebhook(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { executionId?: string } = {},
) {
  const node = makeNode({
    name: "Webhook",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, opts.executionId ?? "exec-wh");
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue webhook — n8n-nodes-base.webhook", () => {
  beforeEach(() => {
    clearAllWebhookResponses();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Webhook");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.webhook")).toBe(canonical);
  });

  it("POST JSON body maps to item json with documented shape", async () => {
    const { out } = await runWebhook(
      {
        httpMethod: "POST",
        path: "orders",
        responseMode: "immediately",
        responseCode: 200,
      },
      [
        {
          headers: { "content-type": "application/json" },
          query: { ref: "abc" },
          body: { order: 7, total: 12.5 },
          path: "orders",
          webhookUrl: "https://host/webhook/orders",
          executionMode: "test",
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      headers: { "content-type": "application/json" },
      params: {},
      query: { ref: "abc" },
      body: { order: 7, total: 12.5 },
      webhookUrl: "https://host/webhook/orders",
      executionMode: "test",
    });
  });

  it("extracts route parameters from :variable path segments", async () => {
    const { out } = await runWebhook(
      {
        httpMethod: "GET",
        path: "user/:id/profile",
        responseMode: "immediately",
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "user/42/profile",
          webhookUrl: "https://host/webhook/user/42/profile",
          executionMode: "test",
        },
      ],
    );

    expect(out[0][0].json.params).toEqual({ id: "42" });
  });

  it("extracts multiple route parameters", async () => {
    const { out } = await runWebhook(
      {
        httpMethod: "GET",
        path: ":var1/path/:var2",
        responseMode: "immediately",
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "alpha/path/beta",
          webhookUrl: "https://host/webhook/alpha/path/beta",
          executionMode: "test",
        },
      ],
    );

    expect(out[0][0].json.params).toEqual({ var1: "alpha", var2: "beta" });
  });

  it("IP whitelist rejects non-whitelisted IP with 403", async () => {
    await expect(
      runWebhook(
        {
          httpMethod: "POST",
          path: "ping",
          responseMode: "immediately",
          options: { ipWhitelist: "10.0.0.5" },
        },
        [
          {
            headers: {},
            query: {},
            body: {},
            path: "ping",
            ip: "198.51.100.7",
            webhookUrl: "https://host/webhook/ping",
            executionMode: "test",
          },
        ],
        { executionId: "wh-ip-reject" },
      ),
    ).rejects.toThrow(/not whitelisted/i);

    const res = getWebhookResponse("wh-ip-reject");
    expect(res?.statusCode).toBe(403);
  });

  it("IP whitelist allows whitelisted IP through", async () => {
    const { out } = await runWebhook(
      {
        httpMethod: "POST",
        path: "ping",
        responseMode: "immediately",
        options: { ipWhitelist: "10.0.0.5,198.51.100.7" },
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "ping",
          ip: "198.51.100.7",
          webhookUrl: "https://host/webhook/ping",
          executionMode: "test",
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
  });

  it("respond immediately stores 'Workflow got started' response", async () => {
    await runWebhook(
      {
        httpMethod: "POST",
        path: "ping",
        responseMode: "immediately",
        responseCode: 200,
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "ping",
          webhookUrl: "https://host/webhook/ping",
          executionMode: "test",
        },
      ],
      { executionId: "wh-immediately" },
    );

    const res = getWebhookResponse("wh-immediately");
    expect(res?.statusCode).toBe(200);
    expect(res?.body).toBe("Workflow got started");
  });

  it("noResponseBody option suppresses the response body", async () => {
    await runWebhook(
      {
        httpMethod: "POST",
        path: "ping",
        responseMode: "immediately",
        options: { noResponseBody: true },
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "ping",
          webhookUrl: "https://host/webhook/ping",
          executionMode: "test",
        },
      ],
      { executionId: "wh-no-body" },
    );

    const res = getWebhookResponse("wh-no-body");
    expect(res?.statusCode).toBe(200);
    expect(res?.body).toBeNull();
  });

  it("options.responseCode overrides responseCode parameter", async () => {
    await runWebhook(
      {
        httpMethod: "POST",
        path: "ping",
        responseMode: "immediately",
        responseCode: 200,
        options: { responseCode: 201 },
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "ping",
          webhookUrl: "https://host/webhook/ping",
          executionMode: "test",
        },
      ],
      { executionId: "wh-code-override" },
    );

    expect(getWebhookResponse("wh-code-override")?.statusCode).toBe(201);
  });

  it("whenLastNode mode does not store an immediate response", async () => {
    await runWebhook(
      {
        httpMethod: "POST",
        path: "api",
        responseMode: "whenLastNode",
        responseData: "firstEntryJson",
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "api",
          webhookUrl: "https://host/webhook/api",
          executionMode: "test",
        },
      ],
      { executionId: "wh-last-node" },
    );

    expect(getWebhookResponse("wh-last-node")).toBeUndefined();
  });

  it("responseNode mode does not store an immediate response", async () => {
    await runWebhook(
      {
        httpMethod: "POST",
        path: "api",
        responseMode: "responseNode",
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "api",
          webhookUrl: "https://host/webhook/api",
          executionMode: "test",
        },
      ],
      { executionId: "wh-response-node" },
    );

    expect(getWebhookResponse("wh-response-node")).toBeUndefined();
  });

  it("ignoreBots drops requests from user agents matching bot pattern", async () => {
    const { out } = await runWebhook(
      {
        httpMethod: "GET",
        path: "ping",
        responseMode: "immediately",
        options: { ignoreBots: true },
      },
      [
        {
          headers: { "user-agent": "GoogleBot/2.1" },
          query: {},
          body: {},
          path: "ping",
          webhookUrl: "https://host/webhook/ping",
          executionMode: "test",
        },
      ],
    );

    expect(out[0]).toHaveLength(0);
  });

  it("ignoreBots allows non-bot requests through", async () => {
    const { out } = await runWebhook(
      {
        httpMethod: "GET",
        path: "ping",
        responseMode: "immediately",
        options: { ignoreBots: true },
      },
      [
        {
          headers: { "user-agent": "Mozilla/5.0" },
          query: {},
          body: {},
          path: "ping",
          webhookUrl: "https://host/webhook/ping",
          executionMode: "test",
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
  });

  it("empty input emits a single empty item", async () => {
    const { out } = await runWebhook(
      { httpMethod: "GET", path: "test", responseMode: "immediately" },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("CORS allowedOrigins adds Access-Control-Allow-Origin header", async () => {
    await runWebhook(
      {
        httpMethod: "POST",
        path: "ping",
        responseMode: "immediately",
        options: { allowedOrigins: "https://example.com" },
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "ping",
          webhookUrl: "https://host/webhook/ping",
          executionMode: "test",
        },
      ],
      { executionId: "wh-cors" },
    );

    const res = getWebhookResponse("wh-cors");
    expect(res?.headers["access-control-allow-origin"]).toBe("https://example.com");
  });

  it("default CORS header is *", async () => {
    await runWebhook(
      {
        httpMethod: "POST",
        path: "ping",
        responseMode: "immediately",
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "ping",
          webhookUrl: "https://host/webhook/ping",
          executionMode: "test",
        },
      ],
      { executionId: "wh-cors-default" },
    );

    expect(getWebhookResponse("wh-cors-default")?.headers["access-control-allow-origin"]).toBe("*");
  });

  it("preserves binary data from input item", async () => {
    const { out } = await runWebhook(
      { httpMethod: "POST", path: "upload", responseMode: "immediately" },
      [
        {
          json: {
            headers: {},
            query: {},
            body: {},
            path: "upload",
            webhookUrl: "https://host/webhook/upload",
            executionMode: "test",
          },
          binary: { data: { data: "aGVsbG8=", mimeType: "text/plain" } },
        },
      ],
    );

    expect(out[0][0].binary).toEqual({
      data: { data: "aGVsbG8=", mimeType: "text/plain" },
    });
  });

  it("custom response headers are included in immediate response", async () => {
    await runWebhook(
      {
        httpMethod: "POST",
        path: "ping",
        responseMode: "immediately",
        options: {
          responseHeaders: {
            entries: [
              { name: "X-Custom", value: "abc" },
              { name: "Content-Type", value: "text/plain" },
            ],
          },
        },
      },
      [
        {
          headers: {},
          query: {},
          body: {},
          path: "ping",
          webhookUrl: "https://host/webhook/ping",
          executionMode: "test",
        },
      ],
      { executionId: "wh-headers" },
    );

    const res = getWebhookResponse("wh-headers");
    expect(res?.headers["x-custom"]).toBe("abc");
    expect(res?.headers["content-type"]).toBe("text/plain");
  });
});
