import { runNode, assertExecutorRegistered } from "../helpers";

const TYPE = "n8n-nodes-base.venafiTlsProtectCloudTool";

beforeAll(() => {
  assertExecutorRegistered(TYPE);
});

const mockJsonResponse = (data: unknown, status = 200) =>
  Promise.resolve({
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: {
      forEach: (fn: (v: string, k: string) => void) => {
        fn("application/json", "content-type");
      },
    },
  }) as unknown as Promise<Response>;

const originalFetch = globalThis.fetch;

function mockVenafiFetch() {
  let callCount = 0;
  globalThis.fetch = vi.fn((url: string, _init?: RequestInit) => {
    callCount++;
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : String(url);
    if (urlStr.includes("/certificates/renew")) {
      return mockJsonResponse({
        certificateId: "cert-renewed-1",
        status: "ACTIVE",
        subject: "CN=example.com",
      });
    }
    if (urlStr.includes("/certificaterequests") && _init?.method !== "GET" && _init?.method !== "DELETE") {
      return mockJsonResponse({
        certificateRequestId: "cr-new-1",
        status: "PENDING",
        applicationId: "app-123",
        commonName: "example.com",
      });
    }
    if (urlStr.includes("/certificates/") && _init?.method === "DELETE") {
      return mockJsonResponse({ id: "cert-to-delete" });
    }
    if (urlStr.includes("/certificates/") && urlStr.includes("keystoreType")) {
      return mockJsonResponse({
        certificateId: "cert-abc-123",
        keystoreType: "PEM",
        certificateLabel: "my-cert",
        keystore: "base64encodedkeystoredata",
      });
    }
    if (urlStr.includes("/certificates/")) {
      return mockJsonResponse({
        certificateId: "cert-abc-123",
        subject: "CN=example.com",
        issuer: "CN=Venafi Test CA",
        validityStart: "2025-01-01T00:00:00Z",
        validityEnd: "2026-01-01T00:00:00Z",
        status: "ACTIVE",
      });
    }
    if (urlStr.includes("/certificates") || urlStr.includes("/certificaterequests")) {
      return mockJsonResponse([
        {
          certificateId: "cert-1",
          subject: "CN=example.com",
          issuer: "CN=Venafi Test CA",
          validityStart: "2025-01-01T00:00:00Z",
          validityEnd: "2026-01-01T00:00:00Z",
          status: "ACTIVE",
        },
      ]);
    }
    return mockJsonResponse({});
  }) as unknown as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const mockCreds = {
  venafiTlsProtectCloudApi: {
    region: "US",
    apiKey: "test-api-key",
  },
};

describe("venafiTlsProtectCloudTool", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = mockVenafiFetch();
  });

  afterEach(() => {
    restore();
  });

  it("should register executor", () => {
    assertExecutorRegistered(TYPE);
  });

  it("should return error for missing credential", async () => {
    await expect(
      runNode(TYPE, { resource: "certificate", operation: "get", certificateId: "cert-123" }, [{}]),
    ).rejects.toThrow(/apiKey/);
  });

  it("should return error for unsupported resource", async () => {
    await expect(
      runNode(TYPE, { resource: "invalidResource", operation: "get" }, [{}], { credentials: mockCreds }),
    ).rejects.toThrow(/unsupported resource/);
  });

  it("should return error for unsupported operation", async () => {
    await expect(
      runNode(TYPE, { resource: "certificate", operation: "invalidOp" }, [{}], { credentials: mockCreds }),
    ).rejects.toThrow(/unsupported certificate operation/);
  });

  it("should handle certificate getMany with limit and filter", async () => {
    const [out] = await runNode(
      TYPE,
      {
        resource: "certificate",
        operation: "getMany",
        returnAll: false,
        limit: 10,
        filters: { subject: "example.com" },
      },
      [{}],
      { credentials: mockCreds },
    );
    expect(out).toBeDefined();
    expect(out.length).toBeGreaterThan(0);
  });

  it("should handle certificate get with expression-resolved certificateId", async () => {
    const [out] = await runNode(
      TYPE,
      {
        resource: "certificate",
        operation: "get",
        certificateId: "={{ $json.certId }}",
      },
      [{ certId: "cert-abc-123" }],
      { credentials: mockCreds },
    );
    expect(out).toBeDefined();
    expect(out[0].json).toBeDefined();
  });

  it("should handle certificate delete", async () => {
    const [out] = await runNode(
      TYPE,
      {
        resource: "certificate",
        operation: "delete",
        certificateId: "cert-to-delete",
      },
      [{}],
      { credentials: mockCreds },
    );
    expect(out).toBeDefined();
    expect(out[0].json).toMatchObject({ id: "cert-to-delete" });
  });

  it("should handle certificate download as PEM", async () => {
    const [out] = await runNode(
      TYPE,
      {
        resource: "certificate",
        operation: "download",
        certificateId: "={{ $json.certId }}",
        downloadItem: "certificate",
        binaryProperty: "certData",
        options: { chainOrder: "ROOT_FIRST", format: "PEM" },
      },
      [{ certId: "cert-abc-123" }],
      { credentials: mockCreds },
    );
    expect(out).toBeDefined();
    expect(out[0].json).toMatchObject({ certificateId: "cert-abc-123" });
    expect(out[0].binary).toBeDefined();
    expect(out[0].binary!.certData).toBeDefined();
  });

  it("should handle certificate download as keystore", async () => {
    const [out] = await runNode(
      TYPE,
      {
        resource: "certificate",
        operation: "download",
        certificateId: "cert-abc-123",
        downloadItem: "keystore",
        binaryProperty: "keystoreData",
        keystoreType: "PEM",
        certificateLabel: "my-cert",
        privateKeyPassphrase: "pass",
        options: { chainOrder: "ROOT_FIRST", format: "PEM" },
      },
      [{}],
      { credentials: mockCreds },
    );
    expect(out).toBeDefined();
    expect(out[0].json).toMatchObject({ certificateId: "cert-abc-123", keystoreType: "PEM", certificateLabel: "my-cert" });
    expect(out[0].binary).toBeDefined();
    expect(out[0].binary!.keystoreData).toBeDefined();
  });

  it("should handle certificate renew", async () => {
    const [out] = await runNode(
      TYPE,
      {
        resource: "certificate",
        operation: "renew",
        applicationId: "app-123",
        existingCertificateId: "cert-existing",
        certificateIssuingTemplateId: "template-456",
        options: { validityPeriod: "P1Y" },
      },
      [{}],
      { credentials: mockCreds },
    );
    expect(out).toBeDefined();
    expect(out[0].json).toMatchObject({ certificateId: "cert-renewed-1" });
  });

  it("should handle certificateRequest create with generateCsr", async () => {
    const [out] = await runNode(
      TYPE,
      {
        resource: "certificateRequest",
        operation: "create",
        applicationId: "app-123",
        certificateIssuingTemplateId: "template-456",
        generateCsr: true,
        commonName: "={{ $json.cn }}",
        additionalFields: {
          organization: "={{ $json.org }}",
          keyType: "RSA",
          keyLength: 2048,
        },
        options: { validityPeriod: "P1Y" },
      },
      [{ cn: "example.com", org: "ACME Inc" }],
      { credentials: mockCreds },
    );
    expect(out).toBeDefined();
    expect(out[0].json).toMatchObject({
      certificateRequestId: "cr-new-1",
      status: "PENDING",
    });
  });

  it("should handle certificateRequest create with user-supplied CSR", async () => {
    const [out] = await runNode(
      TYPE,
      {
        resource: "certificateRequest",
        operation: "create",
        applicationId: "app-456",
        certificateIssuingTemplateId: "template-789",
        generateCsr: false,
        certificateSigningRequest: "-----BEGIN CERTIFICATE REQUEST-----\nMIIB\n-----END CERTIFICATE REQUEST-----",
        options: { validityPeriod: "P10D" },
      },
      [{}],
      { credentials: mockCreds },
    );
    expect(out).toBeDefined();
    expect(out[0].json).toMatchObject({ certificateRequestId: "cr-new-1" });
  });

  it("should handle certificateRequest getMany", async () => {
    const [out] = await runNode(
      TYPE,
      { resource: "certificateRequest", operation: "getMany", returnAll: true },
      [{}],
      { credentials: mockCreds },
    );
    expect(out).toBeDefined();
    expect(out.length).toBeGreaterThan(0);
  });

  it("should handle certificateRequest get", async () => {
    const [out] = await runNode(
      TYPE,
      {
        resource: "certificateRequest",
        operation: "get",
        certificateRequestId: "cr-456",
      },
      [{}],
      { credentials: mockCreds },
    );
    expect(out).toBeDefined();
    expect(out[0].json).toBeDefined();
  });

  it("should handle continueOnFail", async () => {
    restore();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network failure")) as unknown as typeof globalThis.fetch;
    const [out] = await runNode(
      TYPE,
      { resource: "certificate", operation: "get", certificateId: "fail-me" },
      [{}],
      { credentials: mockCreds, continueOnFail: true },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toHaveProperty("error");
  });
});
