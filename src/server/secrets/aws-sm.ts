import { resolveAwsCredentials } from "../../lib/aws/credentials";
import { signAwsV4 } from "../../lib/aws/sigv4";
import type { AwsSmConfig, SecretBackend, SecretPayload } from "./types";

export type AwsSmFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

/**
 * AWS Secrets Manager JSON API with SigV4.
 * Static keys on the provider, env keys, ECS task role, or IRSA web identity.
 */
export function createAwsSmBackend(
  config: AwsSmConfig,
  fetchImpl: AwsSmFetch = fetch,
): SecretBackend {
  const region = config.region || "us-east-1";
  const endpoint =
    config.endpoint?.replace(/\/$/, "") ||
    `https://secretsmanager.${region}.amazonaws.com`;

  async function call(action: string, body: Record<string, unknown>): Promise<unknown> {
    const payload = JSON.stringify(body);
    const credentials = await resolveAwsCredentials(config);
    const signed = signAwsV4({
      method: "POST",
      url: endpoint,
      headers: {
        "content-type": "application/x-amz-json-1.1",
        "x-amz-target": `secretsmanager.${action}`,
      },
      body: payload,
      region,
      service: "secretsmanager",
      credentials,
    });
    const res = await fetchImpl(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: payload,
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400 && /ResourceNotFoundException/i.test(text)) return null;
      throw new Error(`AWS SM ${action} failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  return {
    type: "aws-sm",
    async get(ref: string): Promise<SecretPayload | null> {
      const result = (await call("GetSecretValue", { SecretId: ref })) as {
        SecretString?: string;
      } | null;
      if (!result?.SecretString) return null;
      try {
        return JSON.parse(result.SecretString) as SecretPayload;
      } catch {
        return { value: result.SecretString };
      }
    },
    async set(ref: string, data: SecretPayload): Promise<string> {
      const secretString = JSON.stringify(data);
      try {
        await call("PutSecretValue", { SecretId: ref, SecretString: secretString });
      } catch {
        await call("CreateSecret", {
          Name: ref,
          SecretString: secretString,
        });
      }
      return ref;
    },
    async delete(ref: string): Promise<void> {
      await call("DeleteSecret", {
        SecretId: ref,
        ForceDeleteWithoutRecovery: true,
      });
    },
  };
}

export async function probeAwsSm(
  config: AwsSmConfig,
  fetchImpl: AwsSmFetch = fetch,
): Promise<{ ok: boolean; source: string; signing: "sigv4"; error?: string }> {
  try {
    const credentials = await resolveAwsCredentials(config);
    const region = config.region || "us-east-1";
    const endpoint =
      config.endpoint?.replace(/\/$/, "") ||
      `https://secretsmanager.${region}.amazonaws.com`;
    const payload = JSON.stringify({ MaxResults: 1 });
    const signed = signAwsV4({
      method: "POST",
      url: endpoint,
      headers: {
        "content-type": "application/x-amz-json-1.1",
        "x-amz-target": "secretsmanager.ListSecrets",
      },
      body: payload,
      region,
      service: "secretsmanager",
      credentials,
    });
    const res = await fetchImpl(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: payload,
    });
    if (!res.ok) {
      return {
        ok: false,
        source: credentials.source,
        signing: "sigv4",
        error: `${res.status} ${await res.text()}`.slice(0, 500),
      };
    }
    return { ok: true, source: credentials.source, signing: "sigv4" };
  } catch (err) {
    return {
      ok: false,
      source: "none",
      signing: "sigv4",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
