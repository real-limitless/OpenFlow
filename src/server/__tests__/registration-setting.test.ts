import { describe, expect, it } from "vitest";
import { registrationAllowsPublic } from "../services/registration-setting";

describe("registration setting", () => {
  it("keeps the first account open", () => {
    delete process.env.OPENFLOW_REGISTRATION_DISABLED;
    expect(registrationAllowsPublic({ hasUsers: false, storedOpen: false })).toBe(true);
  });

  it("blocks every signup when registration is disabled", () => {
    const prev = process.env.OPENFLOW_REGISTRATION_DISABLED;
    process.env.OPENFLOW_REGISTRATION_DISABLED = "true";
    try {
      expect(registrationAllowsPublic({ hasUsers: false, storedOpen: true })).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.OPENFLOW_REGISTRATION_DISABLED;
      else process.env.OPENFLOW_REGISTRATION_DISABLED = prev;
    }
  });

  it("uses a stored admin override after the owner exists", () => {
    expect(registrationAllowsPublic({ hasUsers: true, storedOpen: false })).toBe(false);
    expect(registrationAllowsPublic({ hasUsers: true, storedOpen: true })).toBe(true);
  });

  it("falls back to env policy when no setting is stored", () => {
    const prev = process.env.OPENFLOW_INVITE_ONLY;
    process.env.OPENFLOW_INVITE_ONLY = "true";
    try {
      expect(registrationAllowsPublic({ hasUsers: true, storedOpen: null })).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.OPENFLOW_INVITE_ONLY;
      else process.env.OPENFLOW_INVITE_ONLY = prev;
    }
  });
});
