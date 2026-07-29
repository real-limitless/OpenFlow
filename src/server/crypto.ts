import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { config } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = "openflow-static-salt";

function getKey(): Buffer {
  if (!config.credentials.key) {
    throw new Error("CREDENTIALS_KEY environment variable is not set");
  }
  return scryptSync(config.credentials.key, SALT, 32);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all base64)
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const encrypted = Buffer.from(parts[2], "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString("utf8");
}

// Generate a random CREDENTIALS_KEY for .env.example
export function generateKey(): string {
  return randomBytes(32).toString("hex");
}
