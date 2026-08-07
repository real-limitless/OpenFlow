import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { makeNode, runNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.twilioTool";

let origFetch: typeof globalThis.fetch;

beforeEach(() => {
  origFetch = globalThis.fetch;
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

function mockTwilioResponse(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Map([["content-type", "application/json"]]),
  } as unknown as Response);
}

describe("batch-queue twilioTool — n8n-nodes-base.twilioTool", () => {
  it("registers the executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("sends an SMS message", async () => {
    const twilioBody = {
      sid: "SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      date_created: "Tue, 31 Aug 2025 12:00:00 +0000",
      date_updated: "Tue, 31 Aug 2025 12:00:01 +0000",
      date_sent: null,
      account_sid: "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      to: "+15558675310",
      from: "+15017122661",
      body: "Hello from OpenFlow workflow",
      status: "queued",
      num_segments: "1",
      num_media: "0",
      direction: "outbound-api",
      api_version: "2010-04-01",
      price: null,
      price_unit: "USD",
      error_code: null,
      error_message: null,
      uri: "/2010-04-01/Accounts/ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Messages/SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.json",
      subresource_uris: {
        media: "/2010-04-01/Accounts/ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Messages/SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Media.json",
        feedback: "/2010-04-01/Accounts/ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Messages/SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Feedback.json",
      },
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockTwilioResponse(201, twilioBody),
    );

    const [output] = await runNode(TYPE, {
      resource: "sms",
      operation: "send",
      from: "+15017122661",
      to: "+15558675310",
      body: "Hello from OpenFlow workflow",
    }, [{}], {
      credentials: {
        twilioApi: { accountSid: "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", authToken: "test-token" },
      },
    });

    expect(output).toHaveLength(1);
    expect(output[0].json.sid).toBe("SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    expect(output[0].json.status).toBe("queued");
    expect(output[0].json.body).toBe("Hello from OpenFlow workflow");
    expect(output[0].json.from).toBe("+15017122661");
    expect(output[0].json.to).toBe("+15558675310");
  });

  it("sends a WhatsApp message", async () => {
    const twilioBody = {
      sid: "SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      from: "whatsapp:+14155238886",
      to: "whatsapp:+15558675310",
      body: "Hello from WhatsApp via Twilio!",
      status: "queued",
      direction: "outbound-api",
      num_segments: "1",
      num_media: "0",
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockTwilioResponse(201, twilioBody),
    );

    const [output] = await runNode(TYPE, {
      resource: "sms",
      operation: "send",
      from: "whatsapp:+14155238886",
      to: "whatsapp:+15558675310",
      body: "Hello from WhatsApp via Twilio!",
    }, [{}], {
      credentials: {
        twilioApi: { accountSid: "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", authToken: "test-token" },
      },
    });

    expect(output).toHaveLength(1);
    expect(output[0].json.status).toBe("queued");
    expect(output[0].json.from).toBe("whatsapp:+14155238886");
    expect(output[0].json.body).toBe("Hello from WhatsApp via Twilio!");
  });

  it("makes a phone call with TwiML", async () => {
    const twilioBody = {
      sid: "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      date_created: "Tue, 31 Aug 2025 12:00:00 +0000",
      date_updated: "Tue, 31 Aug 2025 12:00:01 +0000",
      account_sid: "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      to: "+15558675310",
      from: "+15017122661",
      status: "queued",
      direction: "outbound-api",
      api_version: "2010-04-01",
      price: null,
      price_unit: "USD",
      queue_time: "1000",
      uri: "/2010-04-01/Accounts/ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Calls/CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.json",
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockTwilioResponse(201, twilioBody),
    );

    const [output] = await runNode(TYPE, {
      resource: "call",
      operation: "make",
      from: "+15017122661",
      to: "+15558675310",
      twiml: "<Response><Say>Hello, this is your automated workflow calling.</Say></Response>",
      record: true,
      timeout: 30,
    }, [{}], {
      credentials: {
        twilioApi: { accountSid: "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", authToken: "test-token" },
      },
    });

    expect(output).toHaveLength(1);
    expect(output[0].json.sid).toBe("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    expect(output[0].json.status).toBe("queued");
  });

  it("makes a phone call with URL-hosted TwiML", async () => {
    const twilioBody = {
      sid: "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      status: "queued",
      direction: "outbound-api",
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockTwilioResponse(201, twilioBody),
    );

    const [output] = await runNode(TYPE, {
      resource: "call",
      operation: "make",
      from: "+15017122661",
      to: "+15558675310",
      url: "http://demo.twilio.com/docs/voice.xml",
    }, [{}], {
      credentials: {
        twilioApi: { accountSid: "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", authToken: "test-token" },
      },
    });

    expect(output).toHaveLength(1);
    expect(output[0].json.sid).toBe("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    expect(output[0].json.status).toBe("queued");
  });

  it("throws when credential is missing", async () => {
    await expect(
      runNode(TYPE, { resource: "sms", operation: "send", from: "+1", to: "+2", body: "test" }, [{}]),
    ).rejects.toThrow(/credential/i);
  });

  it("throws when required params are missing", async () => {
    await expect(
      runNode(TYPE, { resource: "sms", operation: "send", from: "", to: "", body: "" }, [{}], {
        credentials: { twilioApi: { accountSid: "AC", authToken: "tk" } },
      }),
    ).rejects.toThrow(/required/);
  });
});
