export interface CredentialData {
  [key: string]: unknown;
}

export type CredentialResolver = (credentialRef: {
  id?: string | null;
  name: string;
  /** Credential slot on the node (e.g. "httpHeaderAuth"). */
  type?: string;
}) => Promise<CredentialData | null>;
