import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, makeNode, makeWorkflow } from "../helpers";
import { createExecutionContext } from "@/sdk";
import crypto from "node:crypto";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.facebookTrigger";

const WEBHOOK_PAYLOAD = {
  object: "page",
  entry: [
    {
      id: "12345",
      time: 1700000000,
      changes: [
        { field: "feed", value: { item: "post", post_id: "123_456" } },
        { field: "mention", value: { item: "comment", page_id: "12345" } },
      ],
    },
  ],
};

describe("batch-queue facebookTrigger — n8n-nodes-base.facebookTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Facebook Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("webhook payload passes through", async () => {
    const out = await runNode(
      TYPE,
      { appId: "12345", object: "page" },
      [WEBHOOK_PAYLOAD],
    );
    expect(out).toEqual([[{ json: WEBHOOK_PAYLOAD }]]);
  });

  it("emits one item per webhook event", async () => {
    const out = await runNode(
      TYPE,
      { appId: "12345", object: "page" },
      [WEBHOOK_PAYLOAD],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(WEBHOOK_PAYLOAD);
  });

  it("rejects payload with wrong x-hub-signature-256", async () => {
    const rawBody = JSON.stringify(WEBHOOK_PAYLOAD);
    const appSecret = "test_app_secret_123";
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        appId: "12345",
        object: "page",
        __webhookHeaders: {
          "x-hub-signature-256": "sha256=invalid_signature_here",
          rawBody,
        },
      },
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(
      createExecutionContext({
        node,
        workflow: makeWorkflow([node]),
        getNodeInputItems: () => [{ json: WEBHOOK_PAYLOAD }],
        continueOnFail: false,
        getCredential: async () => ({ appSecret }),
      }),
      node,
    );
    expect(out).toEqual([[]]);
  });

  it("passes through with valid x-hub-signature-256", async () => {
    const rawBody = JSON.stringify(WEBHOOK_PAYLOAD);
    const appSecret = "test_app_secret_123";
    const expectedSig = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        appId: "12345",
        object: "page",
        __webhookHeaders: {
          "x-hub-signature-256": expectedSig,
          rawBody,
        },
      },
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(
      createExecutionContext({
        node,
        workflow: makeWorkflow([node]),
        getNodeInputItems: () => [{ json: WEBHOOK_PAYLOAD }],
        continueOnFail: false,
        getCredential: async () => ({ appSecret }),
      }),
      node,
    );
    expect(out).toEqual([[{ json: WEBHOOK_PAYLOAD }]]);
  });
});
