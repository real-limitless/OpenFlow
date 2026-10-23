import { createHash } from "node:crypto";

/** Stable identifier for a login attempt. Not reversible to the address. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
