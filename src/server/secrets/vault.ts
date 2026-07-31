import type { SecretBackend, SecretPayload, VaultConfig } from "./types";

/**
 * HashiCorp Vault KV backend (HTTP API).
 * KV v2: GET/POST {address}/v1/{mount}/data/{path}
 * KV v1: GET/POST {address}/v1/{mount}/{path}
 */
export function createVaultBackend(config: VaultConfig): SecretBackend {
  const address = config.address.replace(/\/$/, "");
  const mount = (config.mount ?? "secret").replace(/^\/|\/$/g, "");
  const kvVersion = config.kvVersion ?? 2;
  const token = config.token;

  function urlFor(path: string, write = false): string {
    const p = path.replace(/^\//, "");
    if (kvVersion === 2) {
      return `${address}/v1/${mount}/data/${p}`;
    }
    return `${address}/v1/${mount}/${p}`;
  }

  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(urlFor(path, method !== "GET"), {
      method,
      headers: {
        "X-Vault-Token": token,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  return {
    type: "vault",
    async get(ref: string): Promise<SecretPayload | null> {
      const res = await request("GET", ref);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Vault get failed: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as {
        data?: { data?: SecretPayload } | SecretPayload;
      };
      if (kvVersion === 2) {
        const inner = json.data as { data?: SecretPayload } | undefined;
        return (inner?.data as SecretPayload) ?? null;
      }
      return (json.data as SecretPayload) ?? null;
    },
    async set(ref: string, data: SecretPayload): Promise<string> {
      const body = kvVersion === 2 ? { data } : data;
      const res = await request("POST", ref, body);
      if (!res.ok) {
        throw new Error(`Vault set failed: ${res.status} ${await res.text()}`);
      }
      return ref;
    },
    async delete(ref: string): Promise<void> {
      const p = ref.replace(/^\//, "");
      const delUrl =
        kvVersion === 2
          ? `${address}/v1/${mount}/metadata/${p}`
          : `${address}/v1/${mount}/${p}`;
      const res = await fetch(delUrl, {
        method: "DELETE",
        headers: { "X-Vault-Token": token },
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Vault delete failed: ${res.status}`);
      }
    },
  };
}
