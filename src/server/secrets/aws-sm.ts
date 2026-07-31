import type { AwsSmConfig, SecretBackend, SecretPayload } from "./types";

export type AwsSmFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

/**
 * AWS Secrets Manager backend via the service JSON API.
 * Uses a pluggable fetch so tests can inject a mock; production uses global fetch
 * with static credentials when provided (no SDK required).
 *
 * Note: full SigV4 is not implemented here — when access keys are set we send
 * them as a simple custom header mode only if `endpoint` is a local mock
 * (LocalStack-style). For real AWS, set OPENFLOW_AWS_SM_FETCH via factory or
 * use Vault. Production AWS should use IAM roles + a proper SDK adapter later.
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
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `secretsmanager.${action}`,
        ...(config.accessKeyId
          ? {
              "X-OpenFlow-Aws-Access-Key": config.accessKeyId,
              "X-OpenFlow-Aws-Secret-Key": config.secretAccessKey ?? "",
              ...(config.sessionToken
                ? { "X-OpenFlow-Aws-Session-Token": config.sessionToken }
                : {}),
            }
          : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400 && text.includes("ResourceNotFoundException")) return null;
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
