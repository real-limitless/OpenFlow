import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.slackTrigger";

function eventCallback(eventOverrides: Record<string, unknown> = {}) {
  return {
    json: {
      token: "shared-secret",
      type: "event_callback",
      event: {
        type: "message",
        channel: "C1234567890",
        user: "U1234567890",
        text: "Hello world",
        ts: "1699999999.123456",
        ...eventOverrides,
      },
    },
  };
}

describe("batch-queue slackTrigger — n8n-nodes-base.slackTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Slack Trigger");
  });

  it("emits one item for a matching message event in the watched channel (happy path)", async () => {
    const out = await runNode(
      TYPE,
      {
        events: ["message"],
        watchWholeWorkspace: false,
        channel: { mode: "id", value: "C1234567890" },
      },
      [eventCallback()],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>)?.event).toBeDefined();
    const event = (out[0][0].json as Record<string, unknown>)?.event as Record<string, unknown>;
    expect(event.text).toBe("Hello world");
    expect(event.channel).toBe("C1234567890");
  });

  it("drops events outside the watched channel", async () => {
    const out = await runNode(
      TYPE,
      {
        events: ["message"],
        watchWholeWorkspace: false,
        channel: { mode: "id", value: "C1234567890" },
      },
      [eventCallback({ channel: "C0000000001" })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("filters out events from ignored users", async () => {
    const out = await runNode(
      TYPE,
      {
        events: ["message"],
        watchWholeWorkspace: false,
        channel: { mode: "id", value: "C1234567890" },
        options: { ignoreUsers: "U9999999999" },
      },
      [eventCallback({ user: "U9999999999" })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("filters reaction events by emoji filter", async () => {
    const out = await runNode(
      TYPE,
      {
        events: ["reaction_added"],
        watchWholeWorkspace: false,
        channel: { mode: "id", value: "C1234567890" },
        options: { emojiFilter: "thumbsup, eyes" },
      },
      [eventCallback({ type: "reaction_added", reaction: "+1" })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("passes reaction events matching the emoji filter", async () => {
    const out = await runNode(
      TYPE,
      {
        events: ["reaction_added"],
        watchWholeWorkspace: false,
        channel: { mode: "id", value: "C1234567890" },
        options: { emojiFilter: "thumbsup, eyes" },
      },
      [eventCallback({ type: "reaction_added", reaction: "thumbsup" })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const event = (out[0][0].json as Record<string, unknown>)?.event as Record<string, unknown>;
    expect(event.reaction).toBe("thumbsup");
  });

  it("drops non-event_callback payloads", async () => {
    const out = await runNode(
      TYPE,
      { events: ["message"] },
      [{ json: { type: "url_verification", challenge: "abc123" } }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });
});
