import type { NodeExecutor, INodeExecutionData, CredentialData } from "@/sdk";
import { ensureItems } from "@/sdk";
import * as crypto from "crypto";

const HASH_ALGORITHMS: Record<string, string> = {
  md5: "md5",
  sha256: "sha256",
  sha384: "sha384",
  sha512: "sha512",
  "sha3-256": "sha3-256",
  "sha3-384": "sha3-384",
  "sha3-512": "sha3-512",
};

const CIPHER_KEY_LENGTHS: Record<string, number> = {
  "aes-256-gcm": 32,
  "aes-192-gcm": 24,
  "aes-128-gcm": 16,
  "chacha20-poly1305": 32,
};

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getCredField(cred: CredentialData | null, field: string): string {
  if (!cred) return "";
  const val = cred[field];
  return val == null ? "" : String(val);
}

function applyGenerate(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  json: Record<string, unknown>,
  idx: number,
): INodeExecutionData {
  const genParams = ctx.getParam<Record<string, unknown>>("generate", {});
  const encodingType = String(genParams.type ?? "hex");
  const outputPropertyName = String(ctx.getParam("outputPropertyName", "data"));

  let result: string;
  if (encodingType === "uuid") {
    result = crypto.randomUUID();
  } else {
    const stringLength = Number(genParams.length ?? 32);
    if (!Number.isFinite(stringLength) || stringLength < 0) {
      throw new Error(`CryptoTool: length must be a non-negative number, got "${stringLength}"`);
    }
    if (encodingType === "ascii") {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const bytes = crypto.randomBytes(stringLength);
      result = Array.from(bytes, (b) => chars[b % chars.length]).join("");
    } else if (encodingType === "base64") {
      result = crypto.randomBytes(stringLength).toString("base64");
    } else if (encodingType === "hex") {
      result = crypto.randomBytes(stringLength).toString("hex");
    } else {
      throw new Error(`CryptoTool: unsupported generate type "${encodingType}"`);
    }
  }

  json[outputPropertyName] = result;
  return {
    json,
    binary: item.binary,
    pairedItem: item.pairedItem ?? { item: idx, input: 0 },
  };
}

function applyHash(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  json: Record<string, unknown>,
  idx: number,
): INodeExecutionData {
  const hashParams = ctx.getParam<Record<string, unknown>>("hash", {});
  const type = String(hashParams.type ?? "sha256");
  const encoding = String(hashParams.encoding ?? "hex");
  const binaryMode = Boolean(hashParams.binaryMode);
  const outputPropertyName = String(ctx.getParam("outputPropertyName", "data"));

  const algo = HASH_ALGORITHMS[type];
  if (!algo) throw new Error(`CryptoTool: unsupported hash algorithm "${type}"`);

  let data: Buffer;
  if (binaryMode) {
    const binaryPropertyName = String(hashParams.binaryPropertyName ?? "data");
    const bin = item.binary?.[binaryPropertyName];
    if (!bin) {
      throw new Error(`CryptoTool: binary property "${binaryPropertyName}" not found on item`);
    }
    data = Buffer.from(bin.data, "base64");
  } else {
    const value = String(hashParams.value ?? "");
    data = Buffer.from(value, "utf8");
  }

  const digest = crypto.createHash(algo).update(data).digest();
  json[outputPropertyName] =
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
  cred: CredentialData | null,
): INodeExecutionData {
  const hmacParams = ctx.getParam<Record<string, unknown>>("hmac", {});
  const type = String(hmacParams.type ?? "sha256");
  const encoding = String(hmacParams.encoding ?? "hex");
  const binaryMode = Boolean(hmacParams.binaryMode);
  const outputPropertyName = String(ctx.getParam("outputPropertyName", "data"));

  const algo = HASH_ALGORITHMS[type];
  if (!algo) throw new Error(`CryptoTool: unsupported hash algorithm "${type}"`);

  const secret = getCredField(cred, "hmacSecret");
  if (!secret) {
    throw new Error('CryptoTool: hmacSecret is required — configure the "crypto" credential');
  }

  let data: Buffer;
  if (binaryMode) {
    const binaryPropertyName = String(hmacParams.binaryPropertyName ?? "data");
    const bin = item.binary?.[binaryPropertyName];
    if (!bin) {
      throw new Error(`CryptoTool: binary property "${binaryPropertyName}" not found on item`);
    }
    data = Buffer.from(bin.data, "base64");
  } else {
    const value = String(hmacParams.value ?? "");
    data = Buffer.from(value, "utf8");
  }

  const digest = crypto
    .createHmac(algo, Buffer.from(secret, "utf8"))
    .update(data)
    .digest();
  json[outputPropertyName] =
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
  cred: CredentialData | null,
): INodeExecutionData {
  const signParams = ctx.getParam<Record<string, unknown>>("sign", {});
  const algorithm = String(signParams.algorithm ?? "sha256");
  const encoding = String(signParams.encoding ?? "hex");
  const value = String(signParams.value ?? "");
  const outputPropertyName = String(ctx.getParam("outputPropertyName", "data"));

  const privateKeyPem = getCredField(cred, "privateKey");
  if (!privateKeyPem) {
    throw new Error('CryptoTool: privateKey is required — configure the "crypto" credential');
  }

  const data = Buffer.from(value, "utf8");
  const keyObj = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(algorithm, data, keyObj);
  json[outputPropertyName] =
    encoding === "base64" ? signature.toString("base64") : signature.toString("hex");

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
  const encParams = ctx.getParam<Record<string, unknown>>("encrypt", {});
  const mode = String(encParams.mode ?? "symmetricPassphrase");
  const value = String(encParams.value ?? "");
  const outputPropertyName = String(ctx.getParam("outputPropertyName", "data"));

  if (mode === "symmetricPassphrase") {
    const cipher = String(encParams.cipher ?? "aes-256-gcm");
    const keyLen = CIPHER_KEY_LENGTHS[cipher];
    if (!keyLen) throw new Error(`CryptoTool: unsupported cipher "${cipher}"`);

    const passphrase = getCredField(cred, "encryptionPassphrase");
    if (!passphrase) {
      throw new Error("CryptoTool: encryptionPassphrase is required for symmetric encryption");
    }

    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, keyLen, "sha256");
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipherIv = crypto.createCipheriv(cipher, key, iv) as crypto.CipherGCM;
    const encrypted = Buffer.concat([cipherIv.update(value, "utf8"), cipherIv.final()]);
    const tag = cipherIv.getAuthTag();
    const payload = Buffer.concat([salt, iv, encrypted, tag]);
    json[outputPropertyName] = payload.toString("base64");
  } else if (mode === "asymmetricRsa") {
    const publicKey = getCredField(cred, "encryptionPublicKey");
    if (!publicKey) {
      throw new Error("CryptoTool: encryptionPublicKey is required for asymmetric encryption");
    }
    const encrypted = crypto.publicEncrypt(
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      Buffer.from(value, "utf8"),
    );
    json[outputPropertyName] = encrypted.toString("base64");
  } else {
    throw new Error(`CryptoTool: unsupported encrypt mode "${mode}"`);
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
  const decParams = ctx.getParam<Record<string, unknown>>("decrypt", {});
  const mode = String(decParams.mode ?? "symmetricPassphrase");
  const value = String(decParams.value ?? "");
  const outputPropertyName = String(ctx.getParam("outputPropertyName", "data"));

  if (mode === "symmetricPassphrase") {
    const cipher = String(decParams.cipher ?? "aes-256-gcm");
    const keyLen = CIPHER_KEY_LENGTHS[cipher];
    if (!keyLen) throw new Error(`CryptoTool: unsupported cipher "${cipher}"`);

    const passphrase = getCredField(cred, "encryptionPassphrase");
    if (!passphrase) {
      throw new Error("CryptoTool: encryptionPassphrase is required for symmetric decryption");
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
    json[outputPropertyName] = decrypted.toString("utf8");
  } else if (mode === "asymmetricRsa") {
    const privateKey = getCredField(cred, "encryptionPrivateKey");
    if (!privateKey) {
      throw new Error("CryptoTool: encryptionPrivateKey is required for asymmetric decryption");
    }
    const decrypted = crypto.privateDecrypt(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      Buffer.from(value, "base64"),
    );
    json[outputPropertyName] = decrypted.toString("utf8");
  } else {
    throw new Error(`CryptoTool: unsupported decrypt mode "${mode}"`);
  }

  return {
    json,
    binary: item.binary,
    pairedItem: item.pairedItem ?? { item: idx, input: 0 },
  };
}

export const cryptoToolExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const action = ctx.getParam<string>("action", "");

  let cred: CredentialData | null = null;
  if (action === "hmac" || action === "sign" || action === "encrypt" || action === "decrypt") {
    cred = await ctx.getCredential("crypto");
  }

  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json = { ...item.json };

    switch (action) {
      case "generate":
        out.push(applyGenerate(ctx, item, json, i));
        break;
      case "hash":
        out.push(applyHash(ctx, item, json, i));
        break;
      case "hmac":
        out.push(applyHmac(ctx, item, json, i, cred));
        break;
      case "sign":
        out.push(applySign(ctx, item, json, i, cred));
        break;
      case "encrypt":
        out.push(applyEncrypt(ctx, item, json, i, cred));
        break;
      case "decrypt":
        out.push(applyDecrypt(ctx, item, json, i, cred));
        break;
      default:
        throw new Error(`CryptoTool: unknown action "${action}"`);
    }
  }

  return [out];
};
