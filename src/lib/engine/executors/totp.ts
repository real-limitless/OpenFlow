import { createHmac } from "node:crypto";
import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";

const BASE32_LOOKUP: Record<string, number> = {};
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
for (let i = 0; i < BASE32_CHARS.length; i++) {
  BASE32_LOOKUP[BASE32_CHARS[i]] = i;
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/[^A-Za-z2-7]/g, "").toUpperCase();
  const bits: number[] = [];
  for (const ch of cleaned) {
    const val = BASE32_LOOKUP[ch];
    if (val === undefined) continue;
    bits.push(val);
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const val of bits) {
    buffer = (buffer << 5) | val;
    bitsInBuffer += 5;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes.push((buffer >> bitsInBuffer) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number, algorithm: string, digits: number): string {
  const counterBuf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    counterBuf[i] = counter & 0xff;
    counter >>>= 8;
  }
  const hmac = createHmac(algorithm, secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const mod = code % 10 ** digits;
  return mod.toString().padStart(digits, "0");
}

function totpCode(secret: Buffer, period: number, algorithm: string, digits: number): string {
  const counter = Math.floor(Date.now() / 1000 / period);
  return hotp(secret, counter, algorithm, digits);
}

export const totpExecutor: NodeExecutor = async (ctx) => {
  const credential = await ctx.getCredential("totpApi");
  if (!credential || !credential.secret) {
    throw new Error("TOTP credential is required with a valid Base32 secret");
  }
  const rawAlgorithm = ctx.getParam<string>("algorithm", "SHA1");
  const algorithm = rawAlgorithm.toLowerCase();
  const validAlgorithms = ["sha1", "sha256", "sha512"];
  if (!validAlgorithms.includes(algorithm)) {
    throw new Error(`Invalid algorithm "${rawAlgorithm}". Accepted: SHA1, SHA256, SHA512`);
  }
  const digits = ctx.getParam<number>("digits", 6);
  if (typeof digits !== "number" || !Number.isFinite(digits) || digits < 1) {
    throw new Error("Digits must be a positive number");
  }
  const period = ctx.getParam<number>("period", 30);
  if (typeof period !== "number" || !Number.isFinite(period) || period < 1) {
    throw new Error("Period must be a positive number");
  }
  const secret = base32Decode(String(credential.secret));
  const code = totpCode(secret, period, algorithm, Math.floor(digits));
  const inputItems = ctx.getInputItems(0);
  if (inputItems.length === 0) {
    return [[{ json: { totpCode: code } }]];
  }
  return [
    inputItems.map((item, idx) => {
      const json = { ...item.json, totpCode: code };
      return withPairedItem({ json }, idx);
    }),
  ];
};