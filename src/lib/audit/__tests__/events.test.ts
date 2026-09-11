import { describe, expect, it } from "vitest";
import { buildAuditEvent } from "../events";

describe("audit events", () => {
  it("drops secret-like keys from detail", () => {
    const ev = buildAuditEvent("settings.webhooks", "settings", "webhooks", {
      required: true,
      secret: "shh",
      inviteToken: "abc",
      mode: "header",
    });
    expect(ev.detail).toEqual({ required: true, mode: "header" });
    expect(ev.resourceId).toBe("webhooks");
  });
});
