import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import * as crypto from "crypto";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.cryptoTool";

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
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
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runCryptoTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = {},
) {
  const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue cryptoTool — n8n-nodes-base.cryptoTool", () => {
  it("is registered as executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("resolves under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.cryptoTool")).toBe(canonical);
  });

  it("generate: creates a random hex string", async () => {
    const out = await runCryptoTool(
      {
        action: "generate",
        outputPropertyName: "randomValue",
        generate: { type: "hex", length: 16 },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    const val = out[0][0].json.randomValue as string;
    expect(val).toHaveLength(32);
    expect(val).toMatch(/^[0-9a-f]+$/);
  });

  it("generate: creates a UUID", async () => {
    const out = await runCryptoTool(
      {
        action: "generate",
        outputPropertyName: "uuid",
        generate: { type: "uuid" },
      },
      [{}],
    );

    expect(out[0][0].json.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("hash: SHA256 hex digest of a string", async () => {
    const out = await runCryptoTool(
      {
        action: "hash",
        outputPropertyName: "hashResult",
        hash: { type: "sha256", encoding: "hex", binaryMode: false, value: "hello world" },
      },
      [{}],
    );

    expect(out[0][0].json.hashResult).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
  });

  it("hash: SHA256 base64 digest", async () => {
    const out = await runCryptoTool(
      {
        action: "hash",
        outputPropertyName: "hashResult",
        hash: { type: "sha256", encoding: "base64", binaryMode: false, value: "hello world" },
      },
      [{}],
    );

    const expected = crypto.createHash("sha256").update("hello world").digest("base64");
    expect(out[0][0].json.hashResult).toBe(expected);
  });

  it("hmac: SHA256 hex", async () => {
    const out = await runCryptoTool(
      {
        action: "hmac",
        outputPropertyName: "hmacResult",
        hmac: { type: "sha256", encoding: "hex", binaryMode: false, value: "message" },
      },
      [{}],
      { crypto: { hmacSecret: "mysecret" } },
    );

    const val = out[0][0].json.hmacResult as string;
    expect(val).toHaveLength(64);
    expect(val).toMatch(/^[0-9a-f]+$/);
  });

  it("hmac: throws when credential missing", async () => {
    await expect(
      runCryptoTool(
        {
          action: "hmac",
          outputPropertyName: "hmacResult",
          hmac: { type: "sha256", encoding: "hex", binaryMode: false, value: "message" },
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/hmacSecret/);
  });

  it("encrypt/decrypt round-trip (symmetric AES-256-GCM)", async () => {
    const cred = { crypto: { encryptionPassphrase: "test-passphrase-1234" } };

    const encOut = await runCryptoTool(
      {
        action: "encrypt",
        outputPropertyName: "encrypted",
        encrypt: { mode: "symmetricPassphrase", cipher: "aes-256-gcm", value: "secret data" },
      },
      [{}],
      cred,
    );

    const cipherText = encOut[0][0].json.encrypted as string;
    expect(cipherText).toBeTruthy();
    expect(cipherText).not.toBe("secret data");

    const decOut = await runCryptoTool(
      {
        action: "decrypt",
        outputPropertyName: "decrypted",
        decrypt: { mode: "symmetricPassphrase", cipher: "aes-256-gcm", value: cipherText },
      },
      [{}],
      cred,
    );

    expect(decOut[0][0].json.decrypted).toBe("secret data");
  });

  it("encrypt/decrypt round-trip asymmetric RSA", async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    const cred = {
      crypto: { encryptionPublicKey: pubPem, encryptionPrivateKey: privPem },
    };

    const encOut = await runCryptoTool(
      {
        action: "encrypt",
        outputPropertyName: "encrypted",
        encrypt: { mode: "asymmetricRsa", value: "rsa secret data" },
      },
      [{}],
      cred,
    );

    const cipherText = encOut[0][0].json.encrypted as string;
    expect(cipherText).toBeTruthy();

    const decOut = await runCryptoTool(
      {
        action: "decrypt",
        outputPropertyName: "decrypted",
        decrypt: { mode: "asymmetricRsa", value: cipherText },
      },
      [{}],
      cred,
    );

    expect(decOut[0][0].json.decrypted).toBe("rsa secret data");
  });

  it("sign: RSA-SHA256 and verify", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    const out = await runCryptoTool(
      {
        action: "sign",
        outputPropertyName: "signature",
        sign: { value: "data to sign", algorithm: "sha256", encoding: "hex" },
      },
      [{}],
      { crypto: { privateKey: privPem } },
    );

    const signature = out[0][0].json.signature as string;
    expect(signature).toBeTruthy();

    const valid = crypto.verify(
      "sha256",
      Buffer.from("data to sign", "utf8"),
      publicKey,
      Buffer.from(signature, "hex"),
    );
    expect(valid).toBe(true);
  });

  it("sign: throws when credential missing", async () => {
    await expect(
      runCryptoTool(
        {
          action: "sign",
          outputPropertyName: "signature",
          sign: { value: "data", algorithm: "sha256", encoding: "hex" },
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/privateKey/);
  });

  it("throws on unknown action", async () => {
    await expect(
      runCryptoTool({ action: "bogus" }, [{}]),
    ).rejects.toThrow(/unknown action/);
  });
});
