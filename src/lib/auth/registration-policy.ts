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
 * OPENFLOW_OPEN_REGISTER=false does not do this: the first owner can still register.
 */
export function isRegistrationDisabled(): boolean {
  return envOn("OPENFLOW_REGISTRATION_DISABLED");
}

/**
 * After an owner exists, public POST /register is closed unless
 * OPENFLOW_OPEN_REGISTER is explicitly true (or OPENFLOW_INVITE_ONLY is
 * explicitly false). First-run setup (zero real users) stays open.
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

export function canPublicRegister(hasUsers: boolean): boolean {
  if (isRegistrationDisabled()) return false;
  if (!hasUsers) return true;
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
