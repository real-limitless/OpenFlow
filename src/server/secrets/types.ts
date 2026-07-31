/** Decrypted secret payload stored for a credential. */
export type SecretPayload = Record<string, unknown>;

export type SecretBackendType = "local" | "vault" | "aws-sm";

export interface SecretBackend {
  readonly type: SecretBackendType;
  /** Read secret by external reference (path/ARN). */
  get(ref: string): Promise<SecretPayload | null>;
  /** Write secret; returns the canonical ref to store. */
  set(ref: string, data: SecretPayload): Promise<string>;
  /** Delete secret if supported; no-op when unsupported. */
  delete?(ref: string): Promise<void>;
}

export type VaultConfig = {
  address: string;
  token: string;
  /** KV mount path, default "secret" */
  mount?: string;
  /** KV engine version 1 | 2, default 2 */
  kvVersion?: 1 | 2;
};

export type AwsSmConfig = {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  /** Optional custom endpoint (LocalStack) */
  endpoint?: string;
};

export type SecretProviderConfig = VaultConfig | AwsSmConfig | Record<string, unknown>;
