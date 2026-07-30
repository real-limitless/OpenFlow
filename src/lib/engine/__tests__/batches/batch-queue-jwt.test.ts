import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import * as crypto from "crypto";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.jwt";

const HS256_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const HS256_SECRET = "your-256-bit-secret";

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runJwt(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = {},
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function base64urlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

describe("batch-queue jwt — n8n-nodes-base.jwt", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("JWT");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.jwt")).toBe(canonical);
  });

  it("decodes a token (payload only)", async () => {
    const out = await runJwt({ operation: "decode", token: HS256_TOKEN }, [{}], {
      jwtAuth: { keyType: "passphrase", secret: "", algorithm: "HS256" },
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      sub: "1234567890",
      name: "John Doe",
      iat: 1516239022,
    });
  });

  it("decodes a token (complete)", async () => {
    const out = await runJwt(
      { operation: "decode", token: HS256_TOKEN, options: { complete: true } },
      [{}],
      { jwtAuth: { keyType: "passphrase", secret: "", algorithm: "HS256" } },
    );

    expect(out[0][0].json).toEqual({
      header: { alg: "HS256", typ: "JWT" },
      payload: { sub: "1234567890", name: "John Doe", iat: 1516239022 },
      signature: "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    });
  });

  it("verifies a valid token (HS256, correct secret)", async () => {
    const out = await runJwt({ operation: "verify", token: HS256_TOKEN }, [{}], {
      jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" },
    });

    expect(out[0][0].json).toEqual({
      sub: "1234567890",
      name: "John Doe",
      iat: 1516239022,
    });
  });

  it("verifies a valid token (complete)", async () => {
    const out = await runJwt(
      { operation: "verify", token: HS256_TOKEN, options: { complete: true } },
      [{}],
      { jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" } },
    );

    expect(out[0][0].json.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(out[0][0].json.payload).toEqual({
      sub: "1234567890",
      name: "John Doe",
      iat: 1516239022,
    });
    expect(out[0][0].json.signature).toBe("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
  });

  it("rejects a bad signature (wrong secret)", async () => {
    await expect(
      runJwt({ operation: "verify", token: HS256_TOKEN }, [{}], {
        jwtAuth: { keyType: "passphrase", secret: "wrong-secret", algorithm: "HS256" },
      }),
    ).rejects.toThrow(/invalid signature/i);
  });

  it("signs a token (HS256, JSON payload) and verifies it", async () => {
    const cred = {
      jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" },
    };

    const signOut = await runJwt(
      {
        operation: "sign",
        useJson: true,
        claimsJson: { sub: "1234567890", name: "John Doe" },
      },
      [{}],
      cred,
    );

    const token = signOut[0][0].json.token as string;
    expect(token).toBeTruthy();
    expect(token.split(".")).toHaveLength(3);

    const header = JSON.parse(base64urlDecode(token.split(".")[0]).toString("utf8"));
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });

    const payload = JSON.parse(base64urlDecode(token.split(".")[1]).toString("utf8"));
    expect(payload.sub).toBe("1234567890");
    expect(payload.name).toBe("John Doe");

    const verifyOut = await runJwt({ operation: "verify", token }, [{}], cred);
    expect(verifyOut[0][0].json.sub).toBe("1234567890");
    expect(verifyOut[0][0].json.name).toBe("John Doe");
  });

  it("signs a token using the claims collection (registered claims)", async () => {
    const cred = {
      jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" },
    };

    const signOut = await runJwt(
      {
        operation: "sign",
        useJson: false,
        claims: {
          audience: "my-audience",
          expiresIn: 3600,
          issuer: "my-issuer",
          jwtid: "my-jti",
          notBefore: 10,
          subject: "my-subject",
        },
      },
      [{}],
      cred,
    );

    const token = signOut[0][0].json.token as string;
    const payload = JSON.parse(base64urlDecode(token.split(".")[1]).toString("utf8"));

    expect(payload.aud).toBe("my-audience");
    expect(payload.iss).toBe("my-issuer");
    expect(payload.jti).toBe("my-jti");
    expect(payload.sub).toBe("my-subject");
    expect(typeof payload.exp).toBe("number");
    expect(typeof payload.nbf).toBe("number");
    expect(payload.exp).toBeGreaterThan(payload.nbf);
  });

  it("omits claims left at empty/zero defaults", async () => {
    const cred = {
      jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" },
    };

    const signOut = await runJwt(
      {
        operation: "sign",
        useJson: false,
        claims: {},
      },
      [{}],
      cred,
    );

    const token = signOut[0][0].json.token as string;
    const payload = JSON.parse(base64urlDecode(token.split(".")[1]).toString("utf8"));

    expect(payload.aud).toBeUndefined();
    expect(payload.iss).toBeUndefined();
    expect(payload.jti).toBeUndefined();
    expect(payload.sub).toBeUndefined();
    expect(payload.exp).toBeUndefined();
    expect(payload.nbf).toBeUndefined();
  });

  it("emits kid header when options.kid is set", async () => {
    const cred = {
      jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" },
    };

    const signOut = await runJwt(
      {
        operation: "sign",
        useJson: true,
        claimsJson: { sub: "test" },
        options: { kid: "my-key-id" },
      },
      [{}],
      cred,
    );

    const token = signOut[0][0].json.token as string;
    const header = JSON.parse(base64urlDecode(token.split(".")[0]).toString("utf8"));
    expect(header.kid).toBe("my-key-id");
  });

  it("overrides algorithm via options.algorithm", async () => {
    const cred = {
      jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" },
    };

    const signOut = await runJwt(
      {
        operation: "sign",
        useJson: true,
        claimsJson: { sub: "test" },
        options: { algorithm: "HS512" },
      },
      [{}],
      cred,
    );

    const token = signOut[0][0].json.token as string;
    const header = JSON.parse(base64urlDecode(token.split(".")[0]).toString("utf8"));
    expect(header.alg).toBe("HS512");

    const verifyOut = await runJwt(
      { operation: "verify", token, options: { algorithm: "HS512" } },
      [{}],
      cred,
    );
    expect(verifyOut[0][0].json.sub).toBe("test");
  });

  it("fails on algorithm mismatch during verify", async () => {
    await expect(
      runJwt({ operation: "verify", token: HS256_TOKEN, options: { algorithm: "HS512" } }, [{}], {
        jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" },
      }),
    ).rejects.toThrow(/algorithm mismatch/i);
  });

  it("fails on key-type / algorithm mismatch (pemKey + HS256)", async () => {
    await expect(
      runJwt({ operation: "sign", useJson: true, claimsJson: { sub: "x" } }, [{}], {
        jwtAuth: { keyType: "pemKey", privateKey: "not-a-key", algorithm: "HS256" },
      }),
    ).rejects.toThrow(/pemKey key type requires an RSA\/ECDSA\/PSS algorithm/i);
  });

  it("fails on missing token for verify", async () => {
    await expect(
      runJwt({ operation: "verify", token: "" }, [{}], {
        jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" },
      }),
    ).rejects.toThrow(/token is required/i);
  });

  it("fails on missing token for decode", async () => {
    await expect(
      runJwt({ operation: "decode", token: "" }, [{}], {
        jwtAuth: { keyType: "passphrase", secret: "", algorithm: "HS256" },
      }),
    ).rejects.toThrow(/token is required/i);
  });

  it("fails on malformed token (wrong segment count)", async () => {
    await expect(
      runJwt({ operation: "decode", token: "not.a.valid.jwt.token" }, [{}], {
        jwtAuth: { keyType: "passphrase", secret: "", algorithm: "HS256" },
      }),
    ).rejects.toThrow(/malformed token/i);
  });

  it("fails when credential is missing", async () => {
    await expect(runJwt({ operation: "decode", token: HS256_TOKEN }, [{}], {})).rejects.toThrow(
      /jwtAuth/,
    );
  });

  it("continueOnFail yields error on bad signature", async () => {
    const out = await runJwt(
      { operation: "verify", token: HS256_TOKEN },
      [{}],
      { jwtAuth: { keyType: "passphrase", secret: "wrong-secret", algorithm: "HS256" } },
      true,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
    expect(String(out[0][0].json.error)).toMatch(/invalid signature/i);
  });

  it("verifies exp claim and rejects expired tokens", async () => {
    const cred = {
      jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" },
    };

    const header = { alg: "HS256", typ: "JWT" };
    const payload = { sub: "expired", exp: Math.floor(Date.now() / 1000) - 100 };
    const headerB64 = Buffer.from(JSON.stringify(header))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const payloadB64 = Buffer.from(JSON.stringify(payload))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = crypto.createHmac("sha256", HS256_SECRET).update(signingInput).digest();
    const sigB64 = sig.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const expiredToken = `${signingInput}.${sigB64}`;

    await expect(runJwt({ operation: "verify", token: expiredToken }, [{}], cred)).rejects.toThrow(
      /expired/i,
    );

    const out = await runJwt(
      { operation: "verify", token: expiredToken, options: { ignoreExpiration: true } },
      [{}],
      cred,
    );
    expect(out[0][0].json.sub).toBe("expired");
  });

  it("verifies nbf claim and rejects not-yet-valid tokens", async () => {
    const cred = {
      jwtAuth: { keyType: "passphrase", secret: HS256_SECRET, algorithm: "HS256" },
    };

    const header = { alg: "HS256", typ: "JWT" };
    const payload = { sub: "future", nbf: Math.floor(Date.now() / 1000) + 100 };
    const headerB64 = Buffer.from(JSON.stringify(header))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const payloadB64 = Buffer.from(JSON.stringify(payload))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = crypto.createHmac("sha256", HS256_SECRET).update(signingInput).digest();
    const sigB64 = sig.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const futureToken = `${signingInput}.${sigB64}`;

    await expect(runJwt({ operation: "verify", token: futureToken }, [{}], cred)).rejects.toThrow(
      /not yet valid/i,
    );

    const out = await runJwt(
      { operation: "verify", token: futureToken, options: { ignoreNotBefore: true } },
      [{}],
      cred,
    );
    expect(out[0][0].json.sub).toBe("future");
  });

  it("signs and verifies with RS256", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    const cred = {
      jwtAuth: { keyType: "pemKey", privateKey: privPem, publicKey: pubPem, algorithm: "RS256" },
    };

    const signOut = await runJwt(
      {
        operation: "sign",
        useJson: true,
        claimsJson: { sub: "rsa-test" },
      },
      [{}],
      cred,
    );

    const token = signOut[0][0].json.token as string;
    const header = JSON.parse(base64urlDecode(token.split(".")[0]).toString("utf8"));
    expect(header.alg).toBe("RS256");

    const verifyOut = await runJwt({ operation: "verify", token }, [{}], cred);
    expect(verifyOut[0][0].json.sub).toBe("rsa-test");
  });

  it("signs and verifies with PS256", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    const cred = {
      jwtAuth: { keyType: "pemKey", privateKey: privPem, publicKey: pubPem, algorithm: "PS256" },
    };

    const signOut = await runJwt(
      {
        operation: "sign",
        useJson: true,
        claimsJson: { sub: "pss-test" },
        options: { algorithm: "PS256" },
      },
      [{}],
      cred,
    );

    const token = signOut[0][0].json.token as string;
    const header = JSON.parse(base64urlDecode(token.split(".")[0]).toString("utf8"));
    expect(header.alg).toBe("PS256");

    const verifyOut = await runJwt(
      { operation: "verify", token, options: { algorithm: "PS256" } },
      [{}],
      cred,
    );
    expect(verifyOut[0][0].json.sub).toBe("pss-test");
  });

  it("signs and verifies with ES256", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    const cred = {
      jwtAuth: { keyType: "pemKey", privateKey: privPem, publicKey: pubPem, algorithm: "ES256" },
    };

    const signOut = await runJwt(
      {
        operation: "sign",
        useJson: true,
        claimsJson: { sub: "ec-test" },
        options: { algorithm: "ES256" },
      },
      [{}],
      cred,
    );

    const token = signOut[0][0].json.token as string;
    const header = JSON.parse(base64urlDecode(token.split(".")[0]).toString("utf8"));
    expect(header.alg).toBe("ES256");

    const sigB64 = token.split(".")[2];
    const sigBuf = base64urlDecode(sigB64);
    expect(sigBuf.length).toBe(64);

    const verifyOut = await runJwt(
      { operation: "verify", token, options: { algorithm: "ES256" } },
      [{}],
      cred,
    );
    expect(verifyOut[0][0].json.sub).toBe("ec-test");
  });

  it("throws on unknown operation", async () => {
    await expect(
      runJwt({ operation: "bogus" }, [{}], {
        jwtAuth: { keyType: "passphrase", secret: "", algorithm: "HS256" },
      }),
    ).rejects.toThrow(/unknown operation/i);
  });
});
