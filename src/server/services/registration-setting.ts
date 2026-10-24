import { canPublicRegister, isRegistrationDisabled } from "../../lib/auth/registration-policy";
import { prisma } from "../db";

export const REGISTRATION_KEY = "auth.registration";

export type RegistrationSetting = {
  /** null when the instance has no stored override and env policy applies. */
  open: boolean | null;
};

export function registrationAllowsPublic(opts: {
  hasUsers: boolean;
  storedOpen: boolean | null;
}): boolean {
  if (isRegistrationDisabled()) return false;
  if (!opts.hasUsers) return true;
  if (opts.storedOpen === null) return canPublicRegister(opts.hasUsers);
  return opts.storedOpen;
}

export async function getRegistrationOpen(): Promise<boolean | null> {
  try {
    const row = await prisma.instanceSetting.findUnique({ where: { key: REGISTRATION_KEY } });
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const open = (parsed as { open?: unknown }).open;
    return typeof open === "boolean" ? open : null;
  } catch {
    return null;
  }
}

export async function setRegistrationOpen(open: boolean): Promise<void> {
  await prisma.instanceSetting.upsert({
    where: { key: REGISTRATION_KEY },
    create: { key: REGISTRATION_KEY, value: JSON.stringify({ open }) },
    update: { value: JSON.stringify({ open }) },
  });
}
