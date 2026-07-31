import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import authRoute from "../routes/auth";
import secretProvidersRoute from "../routes/secret-providers";
import credentialsRoute from "../routes/credentials";
import { authMiddleware, type AppEnv } from "../middleware/auth";
import { ensurePersonalProject } from "../services/projects";
import { resolveCredential } from "../credentials";
import {
  clearBackendCache,
  setBackendForTests,
  type SecretBackend,
  type SecretPayload,
} from "../secrets";

const suffix = Date.now().toString(36);

describe("E5 Gate: external secrets", () => {
  let app: Hono<AppEnv>;
  let user: { id: string };
  let token: string;
  let projectId: string;
  let providerId: string;
  let credentialId: string;

  const store = new Map<string, SecretPayload>();
  const mockVault: SecretBackend = {
    type: "vault",
    async get(ref) {
      return store.get(ref) ?? null;
    },
    async set(ref, data) {
      store.set(ref, data);
      return ref;
    },
    async delete(ref) {
      store.delete(ref);
    },
  };

  beforeAll(async () => {
    delete process.env.AUTH_DISABLED;
    process.env.CREDENTIALS_KEY = process.env.CREDENTIALS_KEY || "test-key-for-secrets-e5";

    app = new Hono<AppEnv>();
    authRoute(app);
    app.use("*", authMiddleware);
    secretProvidersRoute(app);
    credentialsRoute(app);

    // Promote first user to owner for provider admin
    const reg = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `e5-user-${suffix}@test.local`,
        password: "password-e5-secrets",
      }),
    });
    expect(reg.status).toBe(201);
    user = await reg.json();
    token = reg.headers.get("set-cookie")?.match(/session=([^;]+)/)?.[1] ?? "";
    await prisma.user.update({ where: { id: user.id }, data: { role: "owner" } });
    projectId = await ensurePersonalProject(user.id);
  });

  beforeEach(() => {
    clearBackendCache();
  });

  afterAll(async () => {
    clearBackendCache();
    if (credentialId) await prisma.credential.deleteMany({ where: { id: credentialId } });
    if (providerId) await prisma.secretProvider.deleteMany({ where: { id: providerId } });
    await prisma.credential.deleteMany({ where: { projectId } });
    await prisma.secretProvider.deleteMany({ where: { name: { contains: suffix } } });
    if (user?.id) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.projectMember.deleteMany({ where: { userId: user.id } });
      await prisma.environment.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  it("creates vault provider and stores credential externally", async () => {
    store.clear();
    const createProvider = await app.request("/api/v1/secret-providers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${token}`,
      },
      body: JSON.stringify({
        name: `vault-${suffix}`,
        type: "vault",
        isDefault: true,
        config: {
          address: "http://vault.test:8200",
          token: "root-token",
          mount: "secret",
          kvVersion: 2,
        },
      }),
    });
    expect(createProvider.status).toBe(201);
    const provider = await createProvider.json();
    providerId = provider.id;
    expect(provider.config.token).toBe("••••••••");

    setBackendForTests(providerId, mockVault);

    const createCred = await app.request("/api/v1/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${token}`,
        "X-OpenFlow-Project": projectId,
      },
      body: JSON.stringify({
        name: `e5-cred-${suffix}`,
        type: "httpHeaderAuth",
        data: { name: "X-Key", value: "vault-secret-value" },
        secretProviderId: providerId,
        externalRef: `openflow/e5/${suffix}`,
        projectId,
      }),
    });
    expect(createCred.status).toBe(201);
    const cred = await createCred.json();
    credentialId = cred.id;
    expect(cred.external).toBe(true);
    expect(cred.externalRef).toBe(`openflow/e5/${suffix}`);
    expect(cred.data).toBeUndefined();

    expect(store.get(`openflow/e5/${suffix}`)).toEqual({
      name: "X-Key",
      value: "vault-secret-value",
    });

    // DB should not hold local ciphertext for external secrets
    const row = await prisma.credential.findUnique({ where: { id: credentialId } });
    expect(row?.dataEncrypted).toBe("");
    expect(row?.secretProviderId).toBe(providerId);
  });

  it("resolveCredential reads from vault backend", async () => {
    setBackendForTests(providerId, mockVault);
    // ensure mock still has payload if cache was cleared
    if (!store.has(`openflow/e5/${suffix}`)) {
      store.set(`openflow/e5/${suffix}`, { name: "X-Key", value: "vault-secret-value" });
    }
    const data = await resolveCredential(
      { id: credentialId, name: `e5-cred-${suffix}` },
      { projectId, userId: user.id },
    );
    expect(data).toEqual({ name: "X-Key", value: "vault-secret-value" });
  });

  it("local credentials still work without provider", async () => {
    const createCred = await app.request("/api/v1/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${token}`,
        "X-OpenFlow-Project": projectId,
      },
      body: JSON.stringify({
        name: `e5-local-${suffix}`,
        type: "httpHeaderAuth",
        data: { name: "X-Local", value: "local-only" },
        secretProviderId: null,
        projectId,
      }),
    });
    // default provider may be vault from previous test — force null
    // If create used default vault, force local by omitting after clearing default
    await prisma.secretProvider.updateMany({
      where: { id: providerId },
      data: { isDefault: false },
    });

    const createLocal = await app.request("/api/v1/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${token}`,
        "X-OpenFlow-Project": projectId,
      },
      body: JSON.stringify({
        name: `e5-local2-${suffix}`,
        type: "httpHeaderAuth",
        data: { name: "X-Local", value: "local-only" },
        secretProviderId: null,
        projectId,
      }),
    });
    expect(createLocal.status).toBe(201);
    const local = await createLocal.json();
    expect(local.external).toBe(false);

    const data = await resolveCredential(
      { id: local.id, name: local.name },
      { projectId, userId: user.id },
    );
    expect(data).toEqual({ name: "X-Local", value: "local-only" });

    await prisma.credential.delete({ where: { id: local.id } });
    if (createCred.status === 201) {
      const extra = await createCred.json();
      await prisma.credential.delete({ where: { id: extra.id } }).catch(() => undefined);
    }
  });
});
