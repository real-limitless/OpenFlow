import { describe, expect, it } from "vitest";
import { registrationAllowsPublic } from "../services/registration-setting";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const next = vars[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

describe("registration setting", () => {
  it("does not keep the first account open when public register is closed", () => {
    withEnv(
      {
        OPENFLOW_REGISTRATION_DISABLED: undefined,
        OPENFLOW_OPEN_REGISTER: "false",
        OPENFLOW_ALLOW_FIRST_OWNER: undefined,
        OPENFLOW_INVITE_ONLY: undefined,
      },
      () => {
        expect(registrationAllowsPublic({ hasUsers: false, storedOpen: false })).toBe(false);
        expect(registrationAllowsPublic({ hasUsers: false, storedOpen: true })).toBe(false);
        expect(registrationAllowsPublic({ hasUsers: false, storedOpen: null })).toBe(false);
      },
    );
  });

  it("allows the first account when open register is true", () => {
    withEnv(
      {
        OPENFLOW_REGISTRATION_DISABLED: undefined,
        OPENFLOW_OPEN_REGISTER: "true",
        OPENFLOW_ALLOW_FIRST_OWNER: undefined,
      },
      () => {
        expect(registrationAllowsPublic({ hasUsers: false, storedOpen: false })).toBe(true);
      },
    );
  });

  it("allows the first account when OPENFLOW_ALLOW_FIRST_OWNER is set", () => {
    withEnv(
      {
        OPENFLOW_REGISTRATION_DISABLED: undefined,
        OPENFLOW_OPEN_REGISTER: "false",
        OPENFLOW_ALLOW_FIRST_OWNER: "true",
      },
      () => {
        expect(registrationAllowsPublic({ hasUsers: false, storedOpen: false })).toBe(true);
        expect(registrationAllowsPublic({ hasUsers: true, storedOpen: null })).toBe(false);
      },
    );
  });

  it("blocks every signup when registration is disabled", () => {
    withEnv(
      {
        OPENFLOW_REGISTRATION_DISABLED: "true",
        OPENFLOW_OPEN_REGISTER: "true",
        OPENFLOW_ALLOW_FIRST_OWNER: "true",
      },
      () => {
        expect(registrationAllowsPublic({ hasUsers: false, storedOpen: true })).toBe(false);
      },
    );
  });

  it("uses a stored admin override after the owner exists", () => {
    withEnv({ OPENFLOW_OPEN_REGISTER: "false", OPENFLOW_REGISTRATION_DISABLED: undefined }, () => {
      expect(registrationAllowsPublic({ hasUsers: true, storedOpen: false })).toBe(false);
      expect(registrationAllowsPublic({ hasUsers: true, storedOpen: true })).toBe(true);
    });
  });

  it("falls back to env policy when no setting is stored", () => {
    withEnv(
      {
        OPENFLOW_INVITE_ONLY: "true",
        OPENFLOW_OPEN_REGISTER: undefined,
        OPENFLOW_REGISTRATION_DISABLED: undefined,
        OPENFLOW_ALLOW_FIRST_OWNER: undefined,
      },
      () => {
        expect(registrationAllowsPublic({ hasUsers: true, storedOpen: null })).toBe(false);
      },
    );
  });
});
