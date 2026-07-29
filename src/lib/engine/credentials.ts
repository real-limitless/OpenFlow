export interface CredentialData {
  [key: string]: unknown;
}

export type CredentialResolver = (credentialRef: {
  id?: string | null;
  name: string;
}) => Promise<CredentialData | null>;
