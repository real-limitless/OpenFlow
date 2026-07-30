import type { NodeExecutor, INodeExecutionData, CredentialData } from "@/sdk";
import { ensureItems, requireCredential } from "@/sdk";
import * as crypto from "crypto";

const HMAC_ALGS: Record<string, string> = {
  HS256: "sha256",
  HS384: "sha384",
  HS512: "sha512",
};

const RSA_ALGS: Record<string, string> = {
  RS256: "RSA-SHA256",
  RS384: "RSA-SHA384",
  RS512: "RSA-SHA512",
};

const PSS_ALGS: Record<string, string> = {
  PS256: "RSA-SHA256",
  PS384: "RSA-SHA384",
  PS512: "RSA-SHA512",
};

const ECDSA_ALGS: Record<string, { hash: string; keyBytes: number }> = {
  ES256: { hash: "SHA256", keyBytes: 32 },
  ES384: { hash: "SHA384", keyBytes: 48 },
  ES512: { hash: "SHA512", keyBytes: 66 },
};

const ALL_NODE_ALGS = [
  "HS256",
  "HS384",
  "HS512",
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
  "PS256",
  "PS384",
  "PS512",
];

function base64urlEncode(buf: Buffer | string): string {
  const data = typeof buf === "string" ? Buffer.from(buf) : buf;
  return data.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64urlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function isHmac(alg: string): boolean {
  return alg in HMAC_ALGS;
}
function isRsa(alg: string): boolean {
  return alg in RSA_ALGS;
}
function isPss(alg: string): boolean {
  return alg in PSS_ALGS;
}
function isEcdsa(alg: string): boolean {
  return alg in ECDSA_ALGS;
}

function derToRaw(der: Buffer, keyBytes: number): Buffer {
  const parts: Buffer[] = [];
  let pos = 2;
  while (pos < der.length) {
    if (der[pos] !== 0x02) break;
    pos++;
    let len = der[pos++];
    if (len & 0x80) {
      const numBytes = len & 0x7f;
      len = 0;
      for (let i = 0; i < numBytes; i++) {
        len = (len << 8) | der[pos++];
      }
    }
    const raw = der.subarray(pos, pos + len);
    pos += len;
    const padded = Buffer.alloc(keyBytes);
    const offset = keyBytes - raw.length;
    if (offset >= 0) {
      raw.copy(padded, offset);
    } else {
      padded.set(raw.subarray(-offset));
    }
    parts.push(padded);
  }
  return Buffer.concat(parts);
}

function rawToDer(raw: Buffer, keyBytes: number): Buffer {
  const r = raw.subarray(0, keyBytes);
  const s = raw.subarray(keyBytes);

  function encodeInt(buf: Buffer): Buffer {
    let start = 0;
    while (start < buf.length - 1 && buf[start] === 0) start++;
    let val = buf.subarray(start);
    if (val[0] & 0x80) {
      val = Buffer.concat([Buffer.from([0]), val]);
    }
    return Buffer.concat([Buffer.from([0x02, val.length]), val]);
  }

  const rEnc = encodeInt(r);
  const sEnc = encodeInt(s);
  const body = Buffer.concat([rEnc, sEnc]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

function signHmac(alg: string, data: Buffer, secret: string): Buffer {
  return crypto.createHmac(HMAC_ALGS[alg], secret).update(data).digest();
}

function signRsa(alg: string, data: Buffer, privateKeyPem: string): Buffer {
  const keyObj = crypto.createPrivateKey(privateKeyPem);
  return crypto.sign(RSA_ALGS[alg], data, keyObj);
}

function signPss(alg: string, data: Buffer, privateKeyPem: string): Buffer {
  const hash = PSS_ALGS[alg];
  const signer = crypto.createSign(hash);
  signer.update(data);
  return signer.sign({
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
}

function signEcdsa(alg: string, data: Buffer, privateKeyPem: string): Buffer {
  const keyObj = crypto.createPrivateKey(privateKeyPem);
  const { hash } = ECDSA_ALGS[alg];
  const der = crypto.sign(hash, data, keyObj);
  return derToRaw(der, ECDSA_ALGS[alg].keyBytes);
}

function verifyHmac(alg: string, data: Buffer, signature: Buffer, secret: string): boolean {
  const expected = signHmac(alg, data, secret);
  return crypto.timingSafeEqual(expected, signature);
}

function verifyRsa(alg: string, data: Buffer, signature: Buffer, publicKeyPem: string): boolean {
  const keyObj = crypto.createPublicKey(publicKeyPem);
  return crypto.verify(RSA_ALGS[alg], data, keyObj, signature);
}

function verifyPss(alg: string, data: Buffer, signature: Buffer, publicKeyPem: string): boolean {
  const hash = PSS_ALGS[alg];
  const verifier = crypto.createVerify(hash);
  verifier.update(data);
  return verifier.verify(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    },
    signature,
  );
}

function verifyEcdsa(alg: string, data: Buffer, signature: Buffer, publicKeyPem: string): boolean {
  const keyObj = crypto.createPublicKey(publicKeyPem);
  const { hash, keyBytes } = ECDSA_ALGS[alg];
  const der = rawToDer(signature, keyBytes);
  return crypto.verify(hash, data, keyObj, der);
}

function getCredField(cred: CredentialData, field: string): string {
  const val = cred[field];
  return val == null ? "" : String(val);
}

function resolveAlgorithm(cred: CredentialData, options: Record<string, unknown>): string {
  const override = options.algorithm as string | undefined;
  if (override && ALL_NODE_ALGS.includes(override)) return override;
  const credAlg = getCredField(cred, "algorithm") || "HS256";
  return credAlg;
}

function getKeyType(cred: CredentialData): string {
  return getCredField(cred, "keyType") || "passphrase";
}

function validateKeyAlgPair(keyType: string, alg: string): void {
  if (alg === "none") return;
  if (keyType === "passphrase") {
    if (!isHmac(alg)) {
      throw new Error(
        `JWT: passphrase key type requires an HMAC algorithm (HS256/HS384/HS512), got "${alg}"`,
      );
    }
  } else if (keyType === "pemKey") {
    if (!isRsa(alg) && !isPss(alg) && !isEcdsa(alg)) {
      throw new Error(`JWT: pemKey key type requires an RSA/ECDSA/PSS algorithm, got "${alg}"`);
    }
  }
}

function buildClaims(
  ctx: Parameters<NodeExecutor>[0],
  json: Record<string, unknown>,
): Record<string, unknown> {
  const useJson = ctx.getParam<boolean>("useJson", false);
  if (useJson) {
    const raw = ctx.getParam<unknown>("claimsJson");
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error("JWT: claimsJson is not valid JSON");
      }
    }
    if (raw && typeof raw === "object") return { ...(raw as Record<string, unknown>) };
    return {};
  }

  const claims = ctx.getParam<Record<string, unknown>>("claims", {}) ?? {};
  const payload: Record<string, unknown> = {};
  const now = Math.floor(Date.now() / 1000);

  const audience = String(claims.audience ?? "");
  if (audience) payload.aud = audience;

  const expiresIn = Number(claims.expiresIn ?? 0);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    payload.exp = now + expiresIn;
  }

  const issuer = String(claims.issuer ?? "");
  if (issuer) payload.iss = issuer;

  const jwtid = String(claims.jwtid ?? "");
  if (jwtid) payload.jti = jwtid;

  const notBefore = Number(claims.notBefore ?? 0);
  if (Number.isFinite(notBefore) && notBefore > 0) {
    payload.nbf = now + notBefore;
  }

  const subject = String(claims.subject ?? "");
  if (subject) payload.sub = subject;

  return payload;
}

export function signJwtWithCredential(
  cred: CredentialData,
  payload: Record<string, unknown>,
  options: { algorithm?: string; kid?: string } = {},
): string {
  const alg =
    options.algorithm && ALL_NODE_ALGS.includes(options.algorithm)
      ? options.algorithm
      : getCredField(cred, "algorithm") || "HS256";
  const keyType = getKeyType(cred);
  validateKeyAlgPair(keyType, alg);

  const header: Record<string, unknown> = { alg, typ: "JWT" };
  if (options.kid) header.kid = options.kid;

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);

  let signature: Buffer;
  if (alg === "none") {
    signature = Buffer.alloc(0);
  } else if (isHmac(alg)) {
    const secret = getCredField(cred, "secret");
    if (!secret) throw new Error("JWT: secret is required for HMAC algorithms");
    signature = signHmac(alg, signingInput, secret);
  } else if (isRsa(alg)) {
    const privateKey = getCredField(cred, "privateKey");
    if (!privateKey) throw new Error("JWT: privateKey is required for RSA signing");
    signature = signRsa(alg, signingInput, privateKey);
  } else if (isPss(alg)) {
    const privateKey = getCredField(cred, "privateKey");
    if (!privateKey) throw new Error("JWT: privateKey is required for RSASSA-PSS signing");
    signature = signPss(alg, signingInput, privateKey);
  } else if (isEcdsa(alg)) {
    const privateKey = getCredField(cred, "privateKey");
    if (!privateKey) throw new Error("JWT: privateKey is required for ECDSA signing");
    signature = signEcdsa(alg, signingInput, privateKey);
  } else {
    throw new Error(`JWT: unsupported algorithm "${alg}"`);
  }

  const sigB64 = base64urlEncode(signature);
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

function signToken(
  ctx: Parameters<NodeExecutor>[0],
  cred: CredentialData,
  json: Record<string, unknown>,
): string {
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const payload = buildClaims(ctx, json);
  return signJwtWithCredential(cred, payload, {
    algorithm: options.algorithm as string | undefined,
    kid: options.kid as string | undefined,
  });
}

function decodeToken(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  signingInput: Buffer;
} {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("JWT: malformed token — expected 3 segments");
  }
  const [headerB64, payloadB64, sigB64] = parts;
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString("utf8"));
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch {
    throw new Error("JWT: malformed token — invalid base64url or JSON");
  }
  return {
    header,
    payload,
    signature: sigB64,
    signingInput: Buffer.from(`${headerB64}.${payloadB64}`),
  };
}

function verifyToken(
  ctx: Parameters<NodeExecutor>[0],
  cred: CredentialData,
): { header: Record<string, unknown>; payload: Record<string, unknown>; signature: string } {
  const token = ctx.getParam<string>("token", "");
  if (!token) throw new Error("JWT: token is required for verify");

  const decoded = decodeToken(token);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const alg = resolveAlgorithm(cred, options);
  const keyType = getKeyType(cred);
  validateKeyAlgPair(keyType, alg);

  const tokenAlg = String(decoded.header.alg ?? "");
  if (tokenAlg !== alg) {
    throw new Error(`JWT: algorithm mismatch — token uses "${tokenAlg}", expected "${alg}"`);
  }

  const signature = base64urlDecode(decoded.signature);
  let valid: boolean;
  if (alg === "none") {
    valid = signature.length === 0;
  } else if (isHmac(alg)) {
    const secret = getCredField(cred, "secret");
    if (!secret) throw new Error("JWT: secret is required for HMAC verification");
    valid = verifyHmac(alg, decoded.signingInput, signature, secret);
  } else if (isRsa(alg)) {
    const publicKey = getCredField(cred, "publicKey");
    if (!publicKey) throw new Error("JWT: publicKey is required for RSA verification");
    valid = verifyRsa(alg, decoded.signingInput, signature, publicKey);
  } else if (isPss(alg)) {
    const publicKey = getCredField(cred, "publicKey");
    if (!publicKey) throw new Error("JWT: publicKey is required for RSASSA-PSS verification");
    valid = verifyPss(alg, decoded.signingInput, signature, publicKey);
  } else if (isEcdsa(alg)) {
    const publicKey = getCredField(cred, "publicKey");
    if (!publicKey) throw new Error("JWT: publicKey is required for ECDSA verification");
    valid = verifyEcdsa(alg, decoded.signingInput, signature, publicKey);
  } else {
    throw new Error(`JWT: unsupported algorithm "${alg}"`);
  }

  if (!valid) {
    throw new Error("JWT: invalid signature");
  }

  const now = Math.floor(Date.now() / 1000);
  const clockTolerance = Number(options.clockTolerance ?? 0);

  if (options.ignoreExpiration !== true) {
    const exp = decoded.payload.exp;
    if (exp != null) {
      const expNum = Number(exp);
      if (Number.isFinite(expNum) && now > expNum + clockTolerance) {
        throw new Error("JWT: token expired");
      }
    }
  }

  if (options.ignoreNotBefore !== true) {
    const nbf = decoded.payload.nbf;
    if (nbf != null) {
      const nbfNum = Number(nbf);
      if (Number.isFinite(nbfNum) && now + clockTolerance < nbfNum) {
        throw new Error("JWT: token not yet valid");
      }
    }
  }

  return decoded;
}

function decodeOnly(ctx: Parameters<NodeExecutor>[0]): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
} {
  const token = ctx.getParam<string>("token", "");
  if (!token) throw new Error("JWT: token is required for decode");
  return decodeToken(token);
}

export const jwtExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "sign");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const complete = options.complete === true;
  const continueOnFail = ctx.continueOnFail();

  const cred = await requireCredential(ctx, "jwtAuth");

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json = { ...item.json };

    try {
      if (operation === "sign") {
        json.token = signToken(ctx, cred, json);
        out.push({
          json,
          binary: item.binary,
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
      } else if (operation === "verify") {
        const decoded = verifyToken(ctx, cred);
        if (complete) {
          json.header = decoded.header;
          json.payload = decoded.payload;
          json.signature = decoded.signature;
        } else {
          Object.assign(json, decoded.payload);
        }
        out.push({
          json,
          binary: item.binary,
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
      } else if (operation === "decode") {
        const decoded = decodeOnly(ctx);
        if (complete) {
          json.header = decoded.header;
          json.payload = decoded.payload;
          json.signature = decoded.signature;
        } else {
          Object.assign(json, decoded.payload);
        }
        out.push({
          json,
          binary: item.binary,
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
      } else {
        throw new Error(`JWT: unknown operation "${operation}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      out.push({
        json: {
          ...json,
          error: err instanceof Error ? err.message : String(err),
        },
        binary: item.binary,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    }
  }

  return [out];
};
