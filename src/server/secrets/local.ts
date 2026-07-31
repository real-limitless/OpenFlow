import type { SecretBackend, SecretPayload } from "./types";

/**
 * Local backend does not use external refs for storage — credential rows hold
 * AES ciphertext. This backend is a no-op placeholder for interface symmetry;
 * local load/store is handled by encrypt/decrypt on the credential row.
 */
export function createLocalBackend(): SecretBackend {
  return {
    type: "local",
    async get() {
      return null;
    },
    async set(ref: string, _data: SecretPayload) {
      return ref;
    },
  };
}
