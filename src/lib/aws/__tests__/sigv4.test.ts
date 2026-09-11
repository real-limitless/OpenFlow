import { describe, expect, it } from "vitest";
import { emptyPayloadHash, signAwsV4 } from "../sigv4";
import { clearAwsCredentialCache, resolveAwsCredentials } from "../credentials";
import { createAwsSmBackend } from "../../../server/secrets/aws-sm";

const EXAMPLE = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  source: "static" as const,
};

describe("signAwsV4", () => {
  it("hashes an empty payload with SHA-256", () => {
    expect(emptyPayloadHash()).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches an independently computed IAM ListUsers signature", () => {
    const signed = signAwsV4({
      method: "GET",
      url: "https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      region: "us-east-1",
      service: "iam",
      credentials: EXAMPLE,
      amzDate: "20150830T123600Z",
    });
    expect(signed.signature).toBe(
      "dd479fa8a80364edf2119ec24bebde66712ee9c9cb2b0d92eb3ab9ccdc0c3947",
    );
    expect(signed.headers.authorization).toContain("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/");
    expect(signed.headers["x-amz-date"]).toBe("20150830T123600Z");
  });
});

describe("resolveAwsCredentials", () => {
  it("prefers static provider keys over the environment", async () => {
    const creds = await resolveAwsCredentials(
      { accessKeyId: "AKISTATIC", secretAccessKey: "static-secret" },
      { AWS_ACCESS_KEY_ID: "AKIENV", AWS_SECRET_ACCESS_KEY: "env-secret" },
    );
    expect(creds).toEqual({
      accessKeyId: "AKISTATIC",
      secretAccessKey: "static-secret",
      sessionToken: undefined,
      source: "static",
    });
  });

  it("falls back to AWS_* environment keys", async () => {
    clearAwsCredentialCache();
    const creds = await resolveAwsCredentials(
      { region: "us-east-1" },
      {
        AWS_ACCESS_KEY_ID: "AKIENV",
        AWS_SECRET_ACCESS_KEY: "env-secret",
        AWS_SESSION_TOKEN: "sess",
      },
    );
    expect(creds.source).toBe("env");
    expect(creds.sessionToken).toBe("sess");
  });
});

describe("createAwsSmBackend SigV4", () => {
  it("signs GetSecretValue and never sends custom OpenFlow AWS headers", async () => {
    const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
    const backend = createAwsSmBackend(
      {
        region: "us-west-2",
        accessKeyId: "AKIATEST",
        secretAccessKey: "secret-test-key",
      },
      async (url, init) => {
        const headers = Object.fromEntries(
          Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [
            k.toLowerCase(),
            v,
          ]),
        );
        seen.push({ url, headers, body: String(init?.body ?? "") });
        return new Response(
          JSON.stringify({ SecretString: JSON.stringify({ token: "from-sm" }) }),
          { status: 200, headers: { "content-type": "application/x-amz-json-1.1" } },
        );
      },
    );

    await expect(backend.get("openflow/demo")).resolves.toEqual({ token: "from-sm" });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://secretsmanager.us-west-2.amazonaws.com");
    expect(seen[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIATEST\//);
    expect(seen[0]!.headers["x-amz-target"]).toBe("secretsmanager.GetSecretValue");
    expect(seen[0]!.headers["x-openflow-aws-access-key"]).toBeUndefined();
    expect(seen[0]!.headers["x-openflow-aws-secret-key"]).toBeUndefined();
    expect(seen[0]!.body).toBe(JSON.stringify({ SecretId: "openflow/demo" }));
  });
});
