import { describe, expect, it } from "vitest";
import {
  canPublicRegister,
  isInviteOnlyAfterOwner,
  isLoginDisabled,
  isRegistrationDisabled,
  sessionCookieSecure,
} from "../registration-policy";

describe("registration policy", () => {
  it("always allows the first owner when open register is false", () => {
    const prevOpen = process.env.OPENFLOW_OPEN_REGISTER;
    const prevReg = process.env.OPENFLOW_REGISTRATION_DISABLED;
    process.env.OPENFLOW_OPEN_REGISTER = "false";
    delete process.env.OPENFLOW_REGISTRATION_DISABLED;
    expect(canPublicRegister(false)).toBe(true);
    expect(canPublicRegister(true)).toBe(false);
    if (prevOpen === undefined) delete process.env.OPENFLOW_OPEN_REGISTER;
    else process.env.OPENFLOW_OPEN_REGISTER = prevOpen;
    if (prevReg === undefined) delete process.env.OPENFLOW_REGISTRATION_DISABLED;
    else process.env.OPENFLOW_REGISTRATION_DISABLED = prevReg;
  });

  it("defaults to closed registration after an owner", () => {
    const prevOpen = process.env.OPENFLOW_OPEN_REGISTER;
    const prevInvite = process.env.OPENFLOW_INVITE_ONLY;
    const prevNode = process.env.NODE_ENV;
    delete process.env.OPENFLOW_OPEN_REGISTER;
    delete process.env.OPENFLOW_INVITE_ONLY;
    process.env.NODE_ENV = "development";
    expect(isInviteOnlyAfterOwner()).toBe(true);
    expect(canPublicRegister(false)).toBe(true);
    expect(canPublicRegister(true)).toBe(false);
    if (prevOpen === undefined) delete process.env.OPENFLOW_OPEN_REGISTER;
    else process.env.OPENFLOW_OPEN_REGISTER = prevOpen;
    if (prevInvite === undefined) delete process.env.OPENFLOW_INVITE_ONLY;
    else process.env.OPENFLOW_INVITE_ONLY = prevInvite;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  });

  it("blocks every signup and login when the kill switches are on", () => {
    const prevReg = process.env.OPENFLOW_REGISTRATION_DISABLED;
    const prevLogin = process.env.OPENFLOW_LOGIN_DISABLED;
    process.env.OPENFLOW_REGISTRATION_DISABLED = "true";
    process.env.OPENFLOW_LOGIN_DISABLED = "1";
    expect(isRegistrationDisabled()).toBe(true);
    expect(canPublicRegister(false)).toBe(false);
    expect(isLoginDisabled()).toBe(true);
    if (prevReg === undefined) delete process.env.OPENFLOW_REGISTRATION_DISABLED;
    else process.env.OPENFLOW_REGISTRATION_DISABLED = prevReg;
    if (prevLogin === undefined) delete process.env.OPENFLOW_LOGIN_DISABLED;
    else process.env.OPENFLOW_LOGIN_DISABLED = prevLogin;
    expect(isRegistrationDisabled()).toBe(false);
    expect(isLoginDisabled()).toBe(false);
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
    expect(sessionCookieSecure({ url: "http://app.example/login", forwardedProto: "https" })).toBe(
      true,
    );
    expect(sessionCookieSecure({ url: "http://localhost:8080/login" })).toBe(false);
  });
});
