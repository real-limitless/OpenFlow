import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookAuth } from "../webhook-auth";

const secret = "whsec_test_secret";

describe("verifyWebhookAuth", () => {
  it("accepts the header secret", () => {
    expect(
      verifyWebhookAuth({
        headers: { "x-openflow-webhook-secret": secret },
        body: "{}",
        secret,
        mode: "header",
      }),
    ).toBe(true);
    expect(
      verifyWebhookAuth({
        headers: {},
        body: "{}",
        secret,
        mode: "header",
      }),
    ).toBe(false);
  });

  it("accepts HTTP basic password", () => {
    const token = Buffer.from(`hook:${secret}`).toString("base64");
    expect(
      verifyWebhookAuth({
        headers: { authorization: `Basic ${token}` },
        body: "{}",
        secret,
        mode: "basic",
      }),
    ).toBe(true);
  });

  it("accepts HMAC SHA-256 signatures", () => {
    const body = JSON.stringify({ a: 1 });
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(
      verifyWebhookAuth({
        headers: { "x-openflow-signature": sig },
        body,
        secret,
        mode: "signed",
      }),
    ).toBe(true);
  });
});

