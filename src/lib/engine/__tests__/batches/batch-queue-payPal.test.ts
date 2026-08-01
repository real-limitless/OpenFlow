import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import type { INode } from "@/lib/workflow/types";
import { createExecutionContext } from "@/sdk";
import type { ExecutionContext } from "@/sdk";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.payPal";

const MOCK_TOKEN_RESPONSE = { access_token: "test-access-token-123" };
const MOCK_BATCH_RESPONSE = {
  batch_header: {
    payout_batch_id: "PDDRAU4NA3P7Q",
    batch_status: "PENDING",
  },
};
const MOCK_BATCH_DETAILS = {
  batch_header: {
    payout_batch_id: "PDDRAU4NA3P7Q",
    batch_status: "SUCCESS",
  },
  items: [],
};
const MOCK_CANCEL_RESPONSE = {
  payout_item_id: "8XDGEWKQ4RHFE",
  transaction_status: "RETURNED",
};
const MOCK_ITEM_DETAILS = {
  payout_item_id: "8XDGEWKQ4RHFE",
  payout_item: {
    recipient_type: "EMAIL",
    receiver: "recipient@example.com",
    amount: { value: "10.00", currency: "USD" },
  },
  transaction_status: "SUCCESS",
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : (url as Request).url;
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 });
      }
      if (!urlStr.includes("/payouts-item") && urlStr.includes("/v1/payments/payouts") && init?.method === "POST") {
        return new Response(JSON.stringify(MOCK_BATCH_RESPONSE), { status: 201 });
      }
      if (!urlStr.includes("/payouts-item") && urlStr.includes("/v1/payments/payouts/") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify(MOCK_BATCH_DETAILS), { status: 200 });
      }
      if (urlStr.includes("/cancel") && init?.method === "POST") {
        return new Response(JSON.stringify(MOCK_CANCEL_RESPONSE), { status: 200 });
      }
      if (urlStr.includes("/v1/payments/payouts-item/") && init?.method === "GET") {
        return new Response(JSON.stringify(MOCK_ITEM_DETAILS), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCtx(
  parameters: Record<string, unknown> = {},
  items: Array<Record<string, unknown>> = [{}],
  continueOnFail = false,
): ExecutionContext {
  const node: INode = makeNode({ name: "PayPal", type: TYPE, parameters });
  const normalized = items.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as any)
      : { json: item as Record<string, unknown> },
  );
  return createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => normalized,
    continueOnFail,
    getCredential: async () => ({
      clientId: "test-client-id",
      secret: "test-secret",
      environment: "sandbox",
    }),
  });
}

describe("batch-queue payPal — n8n-nodes-base.payPal", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
  });

  describe("createBatchPayout", () => {
    it("calls POST /v1/payments/payouts and returns batch header", async () => {
      const executor = getExecutor(TYPE)!;
      const ctx = makeCtx({
        operation: "createBatchPayout",
        senderBatchHeader: {
          emailSubject: "You have a payout",
          senderBatchId: "batch-001",
        },
        items: [
          {
            recipientType: "EMAIL",
            receiver: "recipient@example.com",
            amount: { value: "10.00", currency: "USD" },
          },
        ],
      });
      const [[out]] = await executor(ctx, ctx.node);
      expect(out.json.batch_header.payout_batch_id).toBe("PDDRAU4NA3P7Q");
      expect(out.json.batch_header.batch_status).toBe("PENDING");
    });

    it("defaults senderBatchHeader fields when omitted", async () => {
      const executor = getExecutor(TYPE)!;
      const ctx = makeCtx({ operation: "createBatchPayout" });
      const [[out]] = await executor(ctx, ctx.node);
      expect(out.json.batch_header.payout_batch_id).toBeTruthy();
    });
  });

  describe("showBatchPayoutDetails", () => {
    it("calls GET /v1/payments/payouts/{id} and returns details", async () => {
      const executor = getExecutor(TYPE)!;
      const ctx = makeCtx({
        operation: "showBatchPayoutDetails",
        payoutBatchId: "PDDRAU4NA3P7Q",
      });
      const [[out]] = await executor(ctx, ctx.node);
      expect(out.json.batch_header.payout_batch_id).toBe("PDDRAU4NA3P7Q");
      expect(out.json.batch_header.batch_status).toBe("SUCCESS");
    });

    it("throws when payoutBatchId is missing", async () => {
      const executor = getExecutor(TYPE)!;
      const ctx = makeCtx({ operation: "showBatchPayoutDetails" });
      await expect(executor(ctx, ctx.node)).rejects.toThrow("Missing required identifier");
    });
  });

  describe("cancelPayoutItem", () => {
    it("calls POST /v1/payments/payouts-item/{id}/cancel and returns result", async () => {
      const executor = getExecutor(TYPE)!;
      const ctx = makeCtx({
        operation: "cancelPayoutItem",
        payoutItemId: "8XDGEWKQ4RHFE",
      });
      const [[out]] = await executor(ctx, ctx.node);
      expect(out.json.payout_item_id).toBe("8XDGEWKQ4RHFE");
      expect(out.json.transaction_status).toBe("RETURNED");
    });

    it("throws when payoutItemId is missing", async () => {
      const executor = getExecutor(TYPE)!;
      const ctx = makeCtx({ operation: "cancelPayoutItem" });
      await expect(executor(ctx, ctx.node)).rejects.toThrow("Missing required identifier");
    });
  });

  describe("showPayoutItemDetails", () => {
    it("calls GET /v1/payments/payouts-item/{id} and returns details", async () => {
      const executor = getExecutor(TYPE)!;
      const ctx = makeCtx({
        operation: "showPayoutItemDetails",
        payoutItemId: "8XDGEWKQ4RHFE",
      });
      const [[out]] = await executor(ctx, ctx.node);
      expect(out.json.payout_item_id).toBe("8XDGEWKQ4RHFE");
      expect(out.json.payout_item.amount.value).toBe("10.00");
      expect(out.json.transaction_status).toBe("SUCCESS");
    });

    it("throws when payoutItemId is missing", async () => {
      const executor = getExecutor(TYPE)!;
      const ctx = makeCtx({ operation: "showPayoutItemDetails" });
      await expect(executor(ctx, ctx.node)).rejects.toThrow("Missing required identifier");
    });
  });

  describe("unsupported operation", () => {
    it("throws by default", async () => {
      const executor = getExecutor(TYPE)!;
      const ctx = makeCtx({ operation: "bogusOp" });
      await expect(executor(ctx, ctx.node)).rejects.toThrow("Unsupported operation");
    });

    it("emits error item with continueOnFail", async () => {
      const executor = getExecutor(TYPE)!;
      const ctx = makeCtx({ operation: "bogusOp" }, [{}], true);
      const [[out]] = await executor(ctx, ctx.node);
      expect(out.json.error).toBeTruthy();
    });
  });
});
