import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../config";

const TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function secret(): string {
  return config.credentials.key || "openflow-form-dev-secret";
}

export function signFormCsrf(path: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${path}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${exp}.${sig}`;
}

export function verifyFormCsrf(path: string, token: string | undefined): boolean {
  if (!token || !token.includes(".")) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const payload = `${path}.${exp}`;
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
