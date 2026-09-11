import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookAuthMode = "header" | "basic" | "signed";

export function normalizeWebhookAuthMode(value: unknown): WebhookAuthMode {
  if (value === "basic" || value === "signed" || value === "header") return value;
  return "header";
}

function headerMap(
  headers: Headers | Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return out;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === "string") out[k.toLowerCase()] = v;
  }
  return out;
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyWebhookAuth(opts: {
  headers: Headers | Record<string, string | undefined>;
  body: string;
  secret: string;
  mode: WebhookAuthMode;
}): boolean {
  if (!opts.secret) return false;
  const h = headerMap(opts.headers);
  if (opts.mode === "header") {
    const got = h["x-openflow-webhook-secret"] ?? h["x-webhook-secret"] ?? "";
    return timingSafeEqualStr(got, opts.secret);
  }
  if (opts.mode === "basic") {
    const auth = h["authorization"] ?? "";
    if (!auth.toLowerCase().startsWith("basic ")) return false;
    const decoded = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
    const pass = decoded.includes(":") ? decoded.slice(decoded.indexOf(":") + 1) : decoded;
    return timingSafeEqualStr(pass, opts.secret);
  }
  const sig = h["x-openflow-signature"] ?? h["x-hub-signature-256"] ?? "";
  const expected = `sha256=${createHmac("sha256", opts.secret).update(opts.body).digest("hex")}`;
  return timingSafeEqualStr(sig, expected);
}
