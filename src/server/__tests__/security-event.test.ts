import { describe, expect, it } from "vitest";
import { securityEventForAction } from "../lib/security-event";
import { loginBodySchema, registerBodySchema } from "../validation/auth";
import { createApiKeyBodySchema } from "../validation/api-keys";
import { hashEmail } from "../lib/email-hash";

describe("security event categories", () => {
  it("maps login, keys, admin, and rate limits", () => {
    expect(securityEventForAction("auth.login_success").event).toBe("auth_success");
    expect(securityEventForAction("auth.login_failure").event).toBe("auth_failure");
    expect(securityEventForAction("auth.register_denied").event).toBe("denial");
    expect(securityEventForAction("api_key.create").event).toBe("key_change");
    expect(securityEventForAction("api_key.revoke").event).toBe("key_change");
    expect(securityEventForAction("api_key.expired").event).toBe("denial");
    expect(securityEventForAction("api_key.use_denied").event).toBe("denial");
    expect(securityEventForAction("settings.mcp").event).toBe("config_change");
    expect(securityEventForAction("admin.registration").event).toBe("admin_action");
    expect(securityEventForAction("user.role_change").event).toBe("admin_action");
    expect(securityEventForAction("user.invite_create").event).toBe("admin_action");
    expect(securityEventForAction("rate_limit")).toEqual({
      event: "rate_limit",
      outcome: "denied",
    });
  });
});

describe("auth and api key validation", () => {
  it("rejects login bodies without echoing the password", () => {
    const password = "not-a-real-secret-value";
    const parsed = loginBodySchema.safeParse({ email: "not-an-email", password });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(JSON.stringify(parsed.error.issues)).not.toContain(password);
  });

  it("requires a register password of at least 8 characters", () => {
    expect(
      registerBodySchema.safeParse({ email: "owner@example.com", password: "short" }).success,
    ).toBe(false);
    expect(
      registerBodySchema.safeParse({ email: "owner@example.com", password: "long-enough" }).success,
    ).toBe(true);
  });

  it("hashes an attempted email without keeping the address", () => {
    const email = "person@example.com";
    const hashed = hashEmail(email);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toContain("person");
    expect(hashEmail(" Person@Example.com ")).toBe(hashed);
  });

  it("accepts an api key body without expiresAt and rejects a bad owner email", () => {
    expect(createApiKeyBodySchema.safeParse({ name: "automation" }).success).toBe(true);
    const bad = createApiKeyBodySchema.safeParse({ name: "automation", ownerEmail: "nope" });
    expect(bad.success).toBe(false);
  });
});
