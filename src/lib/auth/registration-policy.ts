function envOn(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Password login and SSO sign-in. Incident kill switch.
 * Does not change AUTH_DISABLED (that bypasses login entirely).
 */
export function isLoginDisabled(): boolean {
  return envOn("OPENFLOW_LOGIN_DISABLED");
}

/**
 * Blocks every signup, including first-run owner setup and SSO account creation.
 * OPENFLOW_ALLOW_FIRST_OWNER does not bypass this kill switch.
 */
export function isRegistrationDisabled(): boolean {
  return envOn("OPENFLOW_REGISTRATION_DISABLED");
}

/**
 * Public signup is closed unless OPENFLOW_OPEN_REGISTER is explicitly true
 * or 1, or OPENFLOW_INVITE_ONLY is explicitly false or 0. The default is
 * closed. This env decision applies with zero users and after an owner exists.
 */
export function isInviteOnlyAfterOwner(): boolean {
  const open = process.env.OPENFLOW_OPEN_REGISTER?.trim().toLowerCase();
  if (open === "true" || open === "1") return false;
  if (open === "false" || open === "0") return true;
  const invite = process.env.OPENFLOW_INVITE_ONLY?.trim().toLowerCase();
  if (invite === "true" || invite === "1") return true;
  if (invite === "false" || invite === "0") return false;
  return true;
}

/**
 * Unauthenticated POST /api/v1/auth/register without an invite token.
 * Zero users is not a bypass: OPENFLOW_OPEN_REGISTER=false/0 (and the default
 * invite-only policy) rejects that request. First owner on a closed instance
 * requires OPENFLOW_ALLOW_FIRST_OWNER=true, OPENFLOW_OPEN_REGISTER=true, or a
 * valid invite token. AUTH_DISABLED is not read here.
 */
export function canPublicRegister(hasUsers: boolean): boolean {
  if (isRegistrationDisabled()) return false;
  if (!hasUsers && envOn("OPENFLOW_ALLOW_FIRST_OWNER")) return true;
  return !isInviteOnlyAfterOwner();
}

export function sessionCookieSecure(opts: {
  url: string;
  forwardedProto?: string | null;
}): boolean {
  if (process.env.OPENFLOW_COOKIE_SECURE === "true" || process.env.OPENFLOW_COOKIE_SECURE === "1") {
    return true;
  }
  const xf = (opts.forwardedProto ?? "").split(",")[0]?.trim().toLowerCase();
  if (xf === "https") return true;
  try {
    return new URL(opts.url).protocol === "https:";
  } catch {
    return false;
  }
}
