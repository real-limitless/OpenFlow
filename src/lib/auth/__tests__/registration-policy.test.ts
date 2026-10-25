import { describe, expect, it } from "vitest";
import {
  canPublicRegister,
  isInviteOnlyAfterOwner,
  isLoginDisabled,
  isRegistrationDisabled,
  sessionCookieSecure,
} from "../registration-policy";

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

const closedEnv = {
  OPENFLOW_OPEN_REGISTER: "false",
  OPENFLOW_ALLOW_FIRST_OWNER: undefined,
  OPENFLOW_REGISTRATION_DISABLED: undefined,
  OPENFLOW_INVITE_ONLY: undefined,
  AUTH_DISABLED: undefined,
} as const;

describe("registration policy", () => {
  it("rejects the first owner when open register is false", () => {
    withEnv(closedEnv, () => {
      expect(canPublicRegister(false)).toBe(false);
      expect(canPublicRegister(true)).toBe(false);
    });
  });

  it("treats OPENFLOW_OPEN_REGISTER=0 as closed, including zero users", () => {
    withEnv({ ...closedEnv, OPENFLOW_OPEN_REGISTER: "0" }, () => {
      expect(isInviteOnlyAfterOwner()).toBe(true);
      expect(canPublicRegister(false)).toBe(false);
    });
  });

  it("defaults to closed registration before and after an owner", () => {
    withEnv(
      {
        OPENFLOW_OPEN_REGISTER: undefined,
        OPENFLOW_INVITE_ONLY: undefined,
        OPENFLOW_ALLOW_FIRST_OWNER: undefined,
        OPENFLOW_REGISTRATION_DISABLED: undefined,
        NODE_ENV: "development",
      },
      () => {
        expect(isInviteOnlyAfterOwner()).toBe(true);
        expect(canPublicRegister(false)).toBe(false);
        expect(canPublicRegister(true)).toBe(false);
      },
    );
  });

  it("allows the first owner only when OPENFLOW_ALLOW_FIRST_OWNER is set", () => {
    withEnv({ ...closedEnv, OPENFLOW_ALLOW_FIRST_OWNER: "true" }, () => {
      expect(canPublicRegister(false)).toBe(true);
      expect(canPublicRegister(true)).toBe(false);
    });
    withEnv({ ...closedEnv, OPENFLOW_ALLOW_FIRST_OWNER: "1" }, () => {
      expect(canPublicRegister(false)).toBe(true);
    });
  });

  it("does not let AUTH_DISABLED open public registration", () => {
    withEnv({ ...closedEnv, AUTH_DISABLED: "true" }, () => {
      expect(canPublicRegister(false)).toBe(false);
      expect(canPublicRegister(true)).toBe(false);
    });
  });

  it("blocks every signup and login when the kill switches are on", () => {
    withEnv(
      {
        OPENFLOW_REGISTRATION_DISABLED: "true",
        OPENFLOW_LOGIN_DISABLED: "1",
        OPENFLOW_ALLOW_FIRST_OWNER: "true",
        OPENFLOW_OPEN_REGISTER: "true",
      },
      () => {
        expect(isRegistrationDisabled()).toBe(true);
        expect(canPublicRegister(false)).toBe(false);
        expect(isLoginDisabled()).toBe(true);
      },
    );
    withEnv(
      { OPENFLOW_REGISTRATION_DISABLED: undefined, OPENFLOW_LOGIN_DISABLED: undefined },
      () => {
        expect(isRegistrationDisabled()).toBe(false);
        expect(isLoginDisabled()).toBe(false);
      },
    );
  });

  it("closes public register when invite-only, including zero users", () => {
    withEnv(
      {
        OPENFLOW_INVITE_ONLY: "true",
        OPENFLOW_OPEN_REGISTER: undefined,
        OPENFLOW_ALLOW_FIRST_OWNER: undefined,
        OPENFLOW_REGISTRATION_DISABLED: undefined,
      },
      () => {
        expect(isInviteOnlyAfterOwner()).toBe(true);
        expect(canPublicRegister(false)).toBe(false);
        expect(canPublicRegister(true)).toBe(false);
      },
    );
  });

  it("keeps open register when OPENFLOW_OPEN_REGISTER is true", () => {
    withEnv(
      {
        OPENFLOW_OPEN_REGISTER: "true",
        OPENFLOW_INVITE_ONLY: "true",
        OPENFLOW_ALLOW_FIRST_OWNER: undefined,
        OPENFLOW_REGISTRATION_DISABLED: undefined,
      },
      () => {
        expect(canPublicRegister(false)).toBe(true);
        expect(canPublicRegister(true)).toBe(true);
      },
    );
  });

  it("treats explicit invite-only false as open, including the first owner", () => {
    withEnv(
      {
        OPENFLOW_OPEN_REGISTER: undefined,
        OPENFLOW_INVITE_ONLY: "false",
        OPENFLOW_ALLOW_FIRST_OWNER: undefined,
        OPENFLOW_REGISTRATION_DISABLED: undefined,
      },
      () => {
        expect(isInviteOnlyAfterOwner()).toBe(false);
        expect(canPublicRegister(false)).toBe(true);
      },
    );
  });
});

describe("sessionCookieSecure", () => {
  it("is true for HTTPS and x-forwarded-proto", () => {
    expect(sessionCookieSecure({ url: "https://app.example/login" })).toBe(true);
    expect(sessionCookieSecure({ url: "http://app.example/login", forwardedProto: "https" })).toBe(
      true,
    );
    expect(sessionCookieSecure({ url: "http://localhost:8080/login" })).toBe(false);
  });
});
