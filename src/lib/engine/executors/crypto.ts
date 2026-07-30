import type { NodeExecutor, INodeExecutionData, CredentialData } from "@/sdk";
import { ensureItems } from "@/sdk";
import * as crypto from "crypto";
import { evaluateExpression } from "../../expressions/evaluate";

const HASH_ALGORITHMS: Record<string, string> = {
  MD5: "md5",
  SHA256: "sha256",
  "SHA3-256": "sha3-256",
  "SHA3-384": "sha3-384",
  "SHA3-512": "sha3-512",
  SHA384: "sha384",
  SHA512: "sha512",
};

const CIPHER_KEY_LENGTHS: Record<string, number> = {
  "AES-256-GCM": 32,
  "AES-192-GCM": 24,
  "AES-128-GCM": 16,
  "ChaCha20-Poly1305": 32,
};

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function needsCredential(action: string, isV1: boolean): boolean {
  if (action === "hmac" && !isV1) return true;
  if (action === "sign" && !isV1) return true;
  if (action === "encrypt" || action === "decrypt") return true;
  return false;
}

function getInputBytes(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  json: Record<string, unknown>,
): Buffer {
  const binaryData = ctx.getParam<boolean>("binaryData", false);
  if (binaryData) {
    const binaryPropertyName = String(
      resolveValue(ctx.getParam("binaryPropertyName", "data"), json),
    );
    const bin = item.binary?.[binaryPropertyName];
    if (!bin) {
      throw new Error(`Crypto: binary property "${binaryPropertyName}" not found on item`);
    }
    return Buffer.from(bin.data, "base64");
  }
  const value = String(resolveValue(ctx.getParam("value", ""), json));
  return Buffer.from(value, "utf8");
}

function getCredField(cred: CredentialData | null, field: string): string {
  if (!cred) return "";
  const val = cred[field];
  return val == null ? "" : String(val);
}

function applyHash(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  json: Record<string, unknown>,
  idx: number,
): INodeExecutionData {
  const type = String(resolveValue(ctx.getParam("type", "SHA256"), json));
  const dataPropertyName = String(
    resolveValue(ctx.getParam("dataPropertyName", "data"), json),
  );
  const encoding = String(resolveValue(ctx.getParam("encoding", "hex"), json));

  const algo = HASH_ALGORITHMS[type];
  if (!algo) throw new Error(`Crypto: unsupported hash algorithm "${type}"`);

  const data = getInputBytes(ctx, item, json);
  const digest = crypto.createHash(algo).update(data).digest();
  json[dataPropertyName] =
    encoding === "base64" ? digest.toString("base64") : digest.toString("hex");

  return {
    json,
    binary: item.binary,
    pairedItem: item.pairedItem ?? { item: idx, input: 0 },
  };
}

function applyHmac(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  json: Record<string, unknown>,
  idx: number,
  isV1: boolean,
  cred: CredentialData | null,
): INodeExecutionData {
  const type = String(resolveValue(ctx.getParam("type", "SHA256"), json));
  const dataPropertyName = String(
    resolveValue(ctx.getParam("dataPropertyName", "data"), json),
  );
  const encoding = String(resolveValue(ctx.getParam("encoding", "hex"), json));

  const algo = HASH_ALGORITHMS[type];
  if (!algo) throw new Error(`Crypto: unsupported hash algorithm "${type}"`);

  let secret: string;
  if (isV1) {
    secret = String(resolveValue(ctx.getParam("secret", ""), json));
  } else {
    secret = getCredField(cred, "hmacSecret");
  }
  if (!secret) {
    throw new Error(
      'Crypto: hmacSecret is required — configure the "crypto" credential',
    );
  }

  const data = getInputBytes(ctx, item, json);
  const digest = crypto
    .createHmac(algo, Buffer.from(secret, "utf8"))
    .update(data)
    .digest();
  json[dataPropertyName] =
    encoding === "base64" ? digest.toString("base64") : digest.toString("hex");

  return {
    json,
    binary: item.binary,
    pairedItem: item.pairedItem ?? { item: idx, input: 0 },
  };
}

function applySign(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  json: Record<string, unknown>,
  idx: number,
  isV1: boolean,
  cred: CredentialData | null,
): INodeExecutionData {
  const algorithm = String(resolveValue(ctx.getParam("algorithm", "sha256"), json));
  const dataPropertyName = String(
    resolveValue(ctx.getParam("dataPropertyName", "data"), json),
  );
  const encoding = String(resolveValue(ctx.getParam("encoding", "hex"), json));
  const value = String(resolveValue(ctx.getParam("value", ""), json));

  let privateKeyPem: string;
  if (isV1) {
    privateKeyPem = String(resolveValue(ctx.getParam("privateKey", ""), json));
  } else {
    privateKeyPem = getCredField(cred, "privateKey");
  }
  if (!privateKeyPem) {
    throw new Error(
      'Crypto: privateKey is required — configure the "crypto" credential',
    );
  }

  const data = Buffer.from(value, "utf8");
  const keyObj = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(algorithm, data, keyObj);
  json[dataPropertyName] =
    encoding === "base64" ? signature.toString("base64") : signature.toString("hex");

  return {
    json,
    binary: item.binary,
    pairedItem: item.pairedItem ?? { item: idx, input: 0 },
  };
}

function applyGenerate(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  json: Record<string, unknown>,
  idx: number,
): INodeExecutionData {
  const encodingType = String(
    resolveValue(ctx.getParam("encodingType", "uuid"), json),
  );
  const dataPropertyName = String(
    resolveValue(ctx.getParam("dataPropertyName", "data"), json),
  );

  let result: string;
  if (encodingType === "uuid") {
    result = crypto.randomUUID();
  } else {
    const stringLength = Number(
      resolveValue(ctx.getParam("stringLength", 32), json),
    );
    if (!Number.isFinite(stringLength) || stringLength < 0) {
      throw new Error(
        `Crypto: stringLength must be a non-negative number, got "${stringLength}"`,
      );
    }
    if (encodingType === "ascii") {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const bytes = crypto.randomBytes(stringLength);
      result = Array.from(bytes, (b) => chars[b % chars.length]).join("");
    } else if (encodingType === "base64") {
      result = crypto.randomBytes(stringLength).toString("base64");
    } else if (encodingType === "hex") {
      result = crypto.randomBytes(stringLength).toString("hex");
    } else {
      throw new Error(`Crypto: unsupported encodingType "${encodingType}"`);
    }
  }

  json[dataPropertyName] = result;
  return {
    json,
    binary: item.binary,
    pairedItem: item.pairedItem ?? { item: idx, input: 0 },
  };
}

function applyEncrypt(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  json: Record<string, unknown>,
  idx: number,
  cred: CredentialData | null,
): INodeExecutionData {
  const mode = String(resolveValue(ctx.getParam("mode", "symmetric"), json));
  const value = String(resolveValue(ctx.getParam("value", ""), json));
  const dataPropertyName = String(
    resolveValue(ctx.getParam("dataPropertyName", "data"), json),
  );

  if (mode === "symmetric") {
    const cipher = String(
      resolveValue(ctx.getParam("cipher", "AES-256-GCM"), json),
    );
    const keyLen = CIPHER_KEY_LENGTHS[cipher];
    if (!keyLen) throw new Error(`Crypto: unsupported cipher "${cipher}"`);

    const passphrase = getCredField(cred, "encryptionPassphrase");
    if (!passphrase) {
      throw new Error(
        'Crypto: encryptionPassphrase is required for symmetric encryption',
      );
    }

    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, keyLen, "sha256");
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipherIv = crypto.createCipheriv(cipher, key, iv) as crypto.CipherGCM;
    const encrypted = Buffer.concat([
      cipherIv.update(value, "utf8"),
      cipherIv.final(),
    ]);
    const tag = cipherIv.getAuthTag();
    const payload = Buffer.concat([salt, iv, encrypted, tag]);
    json[dataPropertyName] = payload.toString("base64");
  } else {
    const publicKey = getCredField(cred, "encryptionPublicKey");
    if (!publicKey) {
      throw new Error(
        'Crypto: encryptionPublicKey is required for asymmetric encryption',
      );
    }
    const encrypted = crypto.publicEncrypt(
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      Buffer.from(value, "utf8"),
    );
    json[dataPropertyName] = encrypted.toString("base64");
  }

  return {
    json,
    binary: item.binary,
    pairedItem: item.pairedItem ?? { item: idx, input: 0 },
  };
}

function applyDecrypt(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  json: Record<string, unknown>,
  idx: number,
  cred: CredentialData | null,
): INodeExecutionData {
  const mode = String(resolveValue(ctx.getParam("mode", "symmetric"), json));
  const value = String(resolveValue(ctx.getParam("value", ""), json));
  const dataPropertyName = String(
    resolveValue(ctx.getParam("dataPropertyName", "data"), json),
  );

  if (mode === "symmetric") {
    const cipher = String(
      resolveValue(ctx.getParam("cipher", "AES-256-GCM"), json),
    );
    const keyLen = CIPHER_KEY_LENGTHS[cipher];
    if (!keyLen) throw new Error(`Crypto: unsupported cipher "${cipher}"`);

    const passphrase = getCredField(cred, "encryptionPassphrase");
    if (!passphrase) {
      throw new Error(
        'Crypto: encryptionPassphrase is required for symmetric decryption',
      );
    }

    const payload = Buffer.from(value, "base64");
    const salt = payload.subarray(0, SALT_LENGTH);
    const iv = payload.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = payload.subarray(payload.length - AUTH_TAG_LENGTH);
    const encrypted = payload.subarray(
      SALT_LENGTH + IV_LENGTH,
      payload.length - AUTH_TAG_LENGTH,
    );

    const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, keyLen, "sha256");
    const decipher = crypto.createDecipheriv(cipher, key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    json[dataPropertyName] = decrypted.toString("utf8");
  } else {
    const privateKey = getCredField(cred, "encryptionPrivateKey");
    if (!privateKey) {
      throw new Error(
        'Crypto: encryptionPrivateKey is required for asymmetric decryption',
      );
    }
    const decrypted = crypto.privateDecrypt(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      Buffer.from(value, "base64"),
    );
    json[dataPropertyName] = decrypted.toString("utf8");
  }

  return {
    json,
    binary: item.binary,
    pairedItem: item.pairedItem ?? { item: idx, input: 0 },
  };
}

export const cryptoExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const action = ctx.getParam<string>("action", "hash");
  const node = ctx.getNode();
  const isV1 = node.typeVersion < 2;

  let cred: CredentialData | null = null;
  if (needsCredential(action, isV1)) {
    cred = await ctx.getCredential("crypto");
  }

  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json = { ...item.json };

    switch (action) {
      case "hash":
        out.push(applyHash(ctx, item, json, i));
        break;
      case "hmac":
        out.push(applyHmac(ctx, item, json, i, isV1, cred));
        break;
      case "sign":
        out.push(applySign(ctx, item, json, i, isV1, cred));
        break;
      case "generate":
        out.push(applyGenerate(ctx, item, json, i));
        break;
      case "encrypt":
        out.push(applyEncrypt(ctx, item, json, i, cred));
        break;
      case "decrypt":
        out.push(applyDecrypt(ctx, item, json, i, cred));
        break;
      default:
        throw new Error(`Crypto: unknown action "${action}"`);
    }
  }

  return [out];
};