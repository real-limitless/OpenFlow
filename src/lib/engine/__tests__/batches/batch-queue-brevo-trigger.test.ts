import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.sendInBlueTrigger";

const EMAIL_SENT_BODY = {
  event: "email_sent",
  email: "user@example.com",
  id: "<abc123@mail.example.com>",
  date: "2025-01-15T10:30:00+00:00",
  ts: 1736937000,
  "smtp-id": "<abc123@mail.example.com>",
  category: ["test"],
  sg_event_id: "EVENT_ID_1",
  marketing_campaign: { name: "Newsletter", id: 42 },
  from: "sender@example.com",
  subject: "Hello",
  ip: "203.0.113.1",
};

const EMAIL_CLICKED_BODY = {
  event: "email_clicked",
  email: "user@example.com",
  url: "https://example.com/click",
  ts: 1736937100,
};

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(items: INodeExecutionData[], node: INode): ExecutionContext {
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
  };
  return createExecutionContext({
    node,
    workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runBrevoTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
) {
  const node = makeNode({
    name: "Brevo Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue brevoTrigger — n8n-nodes-base.sendInBlueTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Brevo Trigger");
  });

  it("emits one item per webhook event", async () => {
    const { out } = await runBrevoTrigger(
      { events: ["email_sent"] },
      [EMAIL_SENT_BODY],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event).toBe("email_sent");
    expect(out[0][0].json.email).toBe("user@example.com");
    expect(out[0][0].json.marketing_campaign).toEqual({ name: "Newsletter", id: 42 });
  });

  it("supports all 12 event types", async () => {
    const { out } = await runBrevoTrigger(
      { events: ["email_blocked", "email_clicked", "email_deferred", "email_delivered", "email_hardBounce", "email_invalid", "email_markedSpam", "email_opened", "email_sent", "email_softBounce", "email_uniqueOpened", "email_unsubscribed"] },
      [EMAIL_CLICKED_BODY],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event).toBe("email_clicked");
    expect(out[0][0].json.url).toBe("https://example.com/click");
  });

  it("filters events based on the events param", async () => {
    const { out } = await runBrevoTrigger(
      { events: ["email_sent"] },
      [EMAIL_CLICKED_BODY, EMAIL_SENT_BODY],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event).toBe("email_sent");
  });

  it("defaults to all events when events list is empty", async () => {
    const { out } = await runBrevoTrigger(
      {},
      [EMAIL_CLICKED_BODY, EMAIL_SENT_BODY],
    );

    expect(out[0]).toHaveLength(2);
  });

  it("emits empty item for empty input", async () => {
    const { out } = await runBrevoTrigger(
      { events: ["email_sent"] },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("preserves binary data from input item", async () => {
    const { out } = await runBrevoTrigger(
      { events: ["email_sent"] },
      [
        {
          json: EMAIL_SENT_BODY,
          binary: { attachment: { data: "aGVsbG8=", mimeType: "text/plain" } },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toEqual({
      attachment: { data: "aGVsbG8=", mimeType: "text/plain" },
    });
  });
});
