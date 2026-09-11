/**
 * When an owner already exists, production closes public POST /register.
 * First-run setup (zero real users) stays open. Try-out (AUTH_DISABLED) does
 * not use this path. Tests keep open register unless OPENFLOW_OPEN_REGISTER=false
 * or OPENFLOW_INVITE_ONLY=true.
 */
export function isInviteOnlyAfterOwner(): boolean {
  const open = process.env.OPENFLOW_OPEN_REGISTER?.trim().toLowerCase();
  if (open === "true" || open === "1") return false;
  if (open === "false" || open === "0") return true;
  const invite = process.env.OPENFLOW_INVITE_ONLY?.trim().toLowerCase();
  if (invite === "true" || invite === "1") return true;
  return process.env.NODE_ENV === "production";
}

export function canPublicRegister(hasUsers: boolean): boolean {
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
