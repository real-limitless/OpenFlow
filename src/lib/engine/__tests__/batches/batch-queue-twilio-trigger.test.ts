import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, assertExecutorRegistered } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.twilioTrigger";

describe("batch-queue twilioTrigger — n8n-nodes-base.twilioTrigger", () => {
  it("is registered as executor + description", () => {
    assertExecutorRegistered(TYPE);
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Twilio Trigger");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.twilioTrigger")).toBe(canonical);
  });

  it("On New SMS — emits item with parsed webhook fields", async () => {
    const out = await runNode(
      TYPE,
      { event: "On New SMS" },
      [
        {
          MessageSid: "SM123",
          From: "+15551234567",
          To: "+15557654321",
          Body: "Hello world",
          NumMedia: "0",
          SmsStatus: "received",
          AccountSid: "ACxxx",
          ApiVersion: "2010-04-01",
        },
      ],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      MessageSid: "SM123",
      From: "+15551234567",
      To: "+15557654321",
      Body: "Hello world",
      NumMedia: "0",
      SmsStatus: "received",
      AccountSid: "ACxxx",
      ApiVersion: "2010-04-01",
    });
  });

  it("On New Call — emits item with call webhook fields", async () => {
    const out = await runNode(
      TYPE,
      { event: "On New Call" },
      [
        {
          CallSid: "CA456",
          From: "+15551234567",
          To: "+15557654321",
          CallStatus: "ringing",
          AccountSid: "ACxxx",
          ApiVersion: "2010-04-01",
        },
      ],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      CallSid: "CA456",
      From: "+15551234567",
      To: "+15557654321",
      CallStatus: "ringing",
      AccountSid: "ACxxx",
      ApiVersion: "2010-04-01",
    });
  });

  it("On New Call (completed) — emits item with CallDuration", async () => {
    const out = await runNode(
      TYPE,
      { event: "On New Call" },
      [
        {
          CallSid: "CA789",
          From: "+15551234567",
          To: "+15557654321",
          CallStatus: "completed",
          CallDuration: "42",
          AccountSid: "ACxxx",
          ApiVersion: "2010-04-01",
        },
      ],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      CallSid: "CA789",
      From: "+15551234567",
      To: "+15557654321",
      CallStatus: "completed",
      CallDuration: "42",
      AccountSid: "ACxxx",
      ApiVersion: "2010-04-01",
    });
  });

  it("empty input emits a single empty item (manual execution fallback)", async () => {
    const out = await runNode(TYPE, { event: "On New SMS" }, []);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });
});
