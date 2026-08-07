import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mailjetTrigger";

const OPEN_PAYLOAD = {
  event: "open",
  time: 1735689600,
  MessageID: "1234567890",
  email: "user@example.com",
  mj_campaign_id: "campaign-1",
};

const BOUNCE_PAYLOAD = {
  event: "bounce",
  time: 1735689601,
  MessageID: "2345678901",
  email: "bounce@example.com",
  blocked: true,
  hardbounce: true,
};

const SPAM_PAYLOAD = {
  event: "spam",
  time: 1735689602,
  MessageID: "3456789012",
  email: "spam@example.com",
  source: "abuse@provider.com",
};

const BLOCKED_PAYLOAD = {
  event: "blocked",
  time: 1735689603,
  MessageID: "4567890123",
  email: "blocked@example.com",
  error_related_to: "content",
  error: "Message blocked due to spam content",
};

const UNSUB_PAYLOAD = {
  event: "unsub",
  time: 1735689604,
  MessageID: "5678901234",
  email: "unsub@example.com",
};

describe("batch-queue mailjetTrigger — n8n-nodes-base.mailjetTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mailjet Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
    expect(getNodeType(TYPE).credentials).toEqual([
      { name: "mailjetEmailApi", required: true },
    ]);
  });

  it("open event payload passes through", async () => {
    const out = await runNode(TYPE, { event: "open" }, [OPEN_PAYLOAD]);
    expect(out).toEqual([[{ json: OPEN_PAYLOAD }]]);
  });

  it("bounce event payload passes through with bounce-specific fields", async () => {
    const out = await runNode(TYPE, { event: "bounce" }, [BOUNCE_PAYLOAD]);
    expect(out).toEqual([[{ json: BOUNCE_PAYLOAD }]]);
    const item = out[0][0].json as Record<string, unknown>;
    expect(item.blocked).toBe(true);
    expect(item.hardbounce).toBe(true);
  });

  it("spam event payload passes through with source field", async () => {
    const out = await runNode(TYPE, { event: "spam" }, [SPAM_PAYLOAD]);
    expect(out).toEqual([[{ json: SPAM_PAYLOAD }]]);
    const item = out[0][0].json as Record<string, unknown>;
    expect(item.source).toBe("abuse@provider.com");
  });

  it("blocked event payload passes through with error fields", async () => {
    const out = await runNode(TYPE, { event: "blocked" }, [BLOCKED_PAYLOAD]);
    expect(out).toEqual([[{ json: BLOCKED_PAYLOAD }]]);
    const item = out[0][0].json as Record<string, unknown>;
    expect(item.error_related_to).toBe("content");
    expect(item.error).toBe("Message blocked due to spam content");
  });

  it("unsub event payload passes through", async () => {
    const out = await runNode(TYPE, { event: "unsub" }, [UNSUB_PAYLOAD]);
    expect(out).toEqual([[{ json: UNSUB_PAYLOAD }]]);
  });

  it("non-matching events are filtered out", async () => {
    const out = await runNode(TYPE, { event: "open" }, [BOUNCE_PAYLOAD]);
    expect(out).toEqual([[]]);
  });

  it("empty input produces empty output", async () => {
    const out = await runNode(TYPE, { event: "open" }, []);
    expect(out).toEqual([[]]);
  });
});
