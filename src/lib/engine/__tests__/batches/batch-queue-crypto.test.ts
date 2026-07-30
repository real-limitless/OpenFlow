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

const TYPE = "n8n-nodes-base.crypto";

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

async function runCrypto(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = {},
  typeVersion = 2,
) {
  const node = makeNode({ name: "N", type: TYPE, typeVersion, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue crypto — n8n-nodes-base.crypto", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Crypto");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.crypto")).toBe(canonical);
  });

  it("hashes a string with SHA256 hex", async () => {
    const out = await runCrypto(
      {
        action: "hash",
        type: "SHA256",
        value: "hello",
        dataPropertyName: "hash",
        encoding: "hex",
      },
      [{ message: "hello" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      message: "hello",
      hash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    });
  });

  it("hashes a string with SHA256 base64", async () => {
    const out = await runCrypto(
      {
        action: "hash",
        type: "SHA256",
        value: "hello",
        dataPropertyName: "hash",
        encoding: "base64",
      },
      [{}],
    );

    const expected = crypto
      .createHash("sha256")
      .update("hello")
      .digest("base64");
    expect(out[0][0].json.hash).toBe(expected);
  });

  it("generates a UUID (ignores stringLength)", async () => {
    const out = await runCrypto(
      {
        action: "generate",
        encodingType: "uuid",
        dataPropertyName: "token",
        stringLength: 999,
      },
      [{}],
    );

    expect(out[0][0].json.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect((out[0][0].json.token as string).length).toBe(36);
  });

  it("generates an ascii string of the requested length", async () => {
    const out = await runCrypto(
      {
        action: "generate",
        encodingType: "ascii",
        dataPropertyName: "token",
        stringLength: 16,
      },
      [{}],
    );

    expect((out[0][0].json.token as string).length).toBe(16);
  });

  it("generates a hex string", async () => {
    const out = await runCrypto(
      {
        action: "generate",
        encodingType: "hex",
        dataPropertyName: "token",
        stringLength: 8,
      },
      [{}],
    );

    expect((out[0][0].json.token as string).length).toBe(16);
    expect(out[0][0].json.token).toMatch(/^[0-9a-f]+$/);
  });

  it("HMACs a string with credential secret (SHA256 hex)", async () => {
    const out = await runCrypto(
      {
        action: "hmac",
        type: "SHA256",
        value: "hello",
        dataPropertyName: "hmac",
        encoding: "hex",
      },
      [{ message: "hello" }],
      { crypto: { hmacSecret: "mysecret" } },
    );

    expect(out[0][0].json).toEqual({
      message: "hello",
      hmac: "f09399f0c446d84b31a080e57ec483392d41e6f512f3e7ada5027abbcd358c2a",
    });
  });

  it("throws when hmac credential is missing (v2)", async () => {
    await expect(
      runCrypto(
        {
          action: "hmac",
          type: "SHA256",
          value: "hello",
          dataPropertyName: "hmac",
          encoding: "hex",
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/hmacSecret/);
  });

  it("hashes a binary property", async () => {
    const out = await runCrypto(
      {
        action: "hash",
        type: "SHA256",
        binaryData: true,
        binaryPropertyName: "data",
        dataPropertyName: "hash",
        encoding: "hex",
      },
      [
        {
          json: {},
          binary: {
            data: {
              data: Buffer.from("hello").toString("base64"),
              mimeType: "application/octet-stream",
            },
          },
        },
      ],
    );

    expect(out[0][0].json.hash).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("encrypts then decrypts round-trip (symmetric AES-256-GCM)", async () => {
    const cred = { crypto: { encryptionPassphrase: "strong-passphrase-1234" } };

    const encOut = await runCrypto(
      {
        action: "encrypt",
        mode: "symmetric",
        cipher: "AES-256-GCM",
        value: "top secret",
        dataPropertyName: "cipher",
      },
      [{ secret: "top secret" }],
      cred,
    );

    const cipherText = encOut[0][0].json.cipher as string;
    expect(cipherText).toBeTruthy();
    expect(cipherText).not.toBe("top secret");

    const decOut = await runCrypto(
      {
        action: "decrypt",
        mode: "symmetric",
        cipher: "AES-256-GCM",
        value: cipherText,
        dataPropertyName: "plain",
      },
      [{}],
      cred,
    );

    expect(decOut[0][0].json.plain).toBe("top secret");
  });

  it("encrypt/decrypt round-trip with ChaCha20-Poly1305", async () => {
    const cred = { crypto: { encryptionPassphrase: "another-strong-pass" } };

    const encOut = await runCrypto(
      {
        action: "encrypt",
        mode: "symmetric",
        cipher: "ChaCha20-Poly1305",
        value: "chacha data",
        dataPropertyName: "cipher",
      },
      [{}],
      cred,
    );

    const decOut = await runCrypto(
      {
        action: "decrypt",
        mode: "symmetric",
        cipher: "ChaCha20-Poly1305",
        value: encOut[0][0].json.cipher as string,
        dataPropertyName: "plain",
      },
      [{}],
      cred,
    );

    expect(decOut[0][0].json.plain).toBe("chacha data");
  });

  it("decrypt with wrong passphrase fails", async () => {
    const encOut = await runCrypto(
      {
        action: "encrypt",
        mode: "symmetric",
        cipher: "AES-256-GCM",
        value: "secret data",
        dataPropertyName: "cipher",
      },
      [{}],
      { crypto: { encryptionPassphrase: "correct-passphrase-1" } },
    );

    await expect(
      runCrypto(
        {
          action: "decrypt",
          mode: "symmetric",
          cipher: "AES-256-GCM",
          value: encOut[0][0].json.cipher as string,
          dataPropertyName: "plain",
        },
        [{}],
        { crypto: { encryptionPassphrase: "wrong-passphrase!!!" } },
      ),
    ).rejects.toThrow();
  });

  it("encrypts then decrypts round-trip (asymmetric RSA)", async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const privPem = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();

    const cred = {
      crypto: {
        encryptionPublicKey: pubPem,
        encryptionPrivateKey: privPem,
      },
    };

    const encOut = await runCrypto(
      {
        action: "encrypt",
        mode: "asymmetric",
        value: "rsa secret",
        dataPropertyName: "cipher",
      },
      [{}],
      cred,
    );

    expect(encOut[0][0].json.cipher).toBeTruthy();

    const decOut = await runCrypto(
      {
        action: "decrypt",
        mode: "asymmetric",
        value: encOut[0][0].json.cipher as string,
        dataPropertyName: "plain",
      },
      [{}],
      cred,
    );

    expect(decOut[0][0].json.plain).toBe("rsa secret");
  });

  it("signs and verifies (RSA-SHA256)", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privPem = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();
    const pubPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const out = await runCrypto(
      {
        action: "sign",
        algorithm: "RSA-SHA256",
        value: "sign this",
        dataPropertyName: "signature",
        encoding: "hex",
      },
      [{}],
      { crypto: { privateKey: privPem } },
    );

    const signature = out[0][0].json.signature as string;
    expect(signature).toBeTruthy();

    const valid = crypto.verify(
      "RSA-SHA256",
      Buffer.from("sign this", "utf8"),
      publicKey,
      Buffer.from(signature, "hex"),
    );
    expect(valid).toBe(true);
  });

  it("throws when sign credential is missing (v2)", async () => {
    await expect(
      runCrypto(
        {
          action: "sign",
          algorithm: "sha256",
          value: "data",
          dataPropertyName: "sig",
          encoding: "hex",
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/privateKey/);
  });

  it("v1 hmac reads secret from inline parameter", async () => {
    const out = await runCrypto(
      {
        action: "hmac",
        type: "SHA256",
        value: "hello",
        secret: "mysecret",
        dataPropertyName: "hmac",
        encoding: "hex",
      },
      [{}],
      {},
      1,
    );

    expect(out[0][0].json.hmac).toBe(
      "f09399f0c446d84b31a080e57ec483392d41e6f512f3e7ada5027abbcd358c2a",
    );
  });

  it("processes multiple items", async () => {
    const out = await runCrypto(
      {
        action: "hash",
        type: "SHA256",
        value: "={{ $json.msg }}",
        dataPropertyName: "hash",
        encoding: "hex",
      },
      [{ msg: "hello" }, { msg: "world" }],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.hash).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(out[0][1].json.hash).toBe(
      "486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7",
    );
  });

  it("throws on unknown action", async () => {
    await expect(
      runCrypto({ action: "bogus" }, [{}]),
    ).rejects.toThrow(/unknown action/);
  });
});