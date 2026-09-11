import { describe, expect, it } from "vitest";
import {
  canPublicRegister,
  isInviteOnlyAfterOwner,
  sessionCookieSecure,
} from "../registration-policy";

describe("registration policy", () => {
  it("always allows the first owner", () => {
    expect(canPublicRegister(false)).toBe(true);
  });

  it("closes public register after an owner when invite-only", () => {
    const prev = process.env.OPENFLOW_INVITE_ONLY;
    process.env.OPENFLOW_INVITE_ONLY = "true";
    delete process.env.OPENFLOW_OPEN_REGISTER;
    expect(isInviteOnlyAfterOwner()).toBe(true);
    expect(canPublicRegister(true)).toBe(false);
    if (prev === undefined) delete process.env.OPENFLOW_INVITE_ONLY;
    else process.env.OPENFLOW_INVITE_ONLY = prev;
  });

  it("keeps open register when OPENFLOW_OPEN_REGISTER is true", () => {
    const prev = process.env.OPENFLOW_OPEN_REGISTER;
    process.env.OPENFLOW_OPEN_REGISTER = "true";
    process.env.OPENFLOW_INVITE_ONLY = "true";
    expect(canPublicRegister(true)).toBe(true);
    if (prev === undefined) delete process.env.OPENFLOW_OPEN_REGISTER;
    else process.env.OPENFLOW_OPEN_REGISTER = prev;
    delete process.env.OPENFLOW_INVITE_ONLY;
  });
});

describe("sessionCookieSecure", () => {
  it("is true for HTTPS and x-forwarded-proto", () => {
    expect(sessionCookieSecure({ url: "https://app.example/login" })).toBe(true);
    expect(
      sessionCookieSecure({ url: "http://app.example/login", forwardedProto: "https" }),
    ).toBe(true);
    expect(sessionCookieSecure({ url: "http://localhost:8080/login" })).toBe(false);
  });
});
