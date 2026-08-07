import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.venafiTlsProtectDatacenterTool";

const CREDS: Record<string, Record<string, unknown>> = {
  venafiTlsProtectDatacenterApi: {
    domain: "https://venafi.example.com",
    clientId: "test-client",
    username: "test-user",
    password: "test-pass",
  },
};

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get() { return "application/json"; },
      entries() { return new Map([["content-type", "application/json"]]).entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return responseQueue.shift() ?? mockResponse({});
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: {
    continueOnFail?: boolean;
    credentials?: Record<string, Record<string, unknown>>;
  },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  const out = await executor(ctx, node);
  return { out, ctx };
}

describe("Venafi TLS Protect Datacenter Tool", () => {
  beforeEach(() => {
    installFetch([
      mockResponse({ access_token: "test-token" }),
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has a node description", () => {
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.displayName).toBe("Venafi TLS Protect Datacenter (AI Tool)");
    expect(desc.category).toBe("AI Tool");
  });

  it("delete a certificate", async () => {
    installFetch([
      mockResponse({ access_token: "test-token" }),
      mockResponse({ Success: true }),
    ]);
    const { out } = await run({
      resource: "certificate",
      operation: "delete",
      certificateId: "\\VED\\Policy\\MyFolder\\abc123",
    });
    expect(calls.length).toBe(2);
    expect(calls[1].method).toBe("DELETE");
    expect(calls[1].url).toContain("/vedsdk/Certificates/%5CVED%5CPolicy%5CMyFolder%5Cabc123");
    expect(out[0][0].json).toEqual({ Success: true });
  });

  it("download a certificate as PEM", async () => {
    installFetch([
      mockResponse({ access_token: "test-token" }),
      mockResponse({
        CertificateData: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
      }),
    ]);
    const { out } = await run({
      resource: "certificate",
      operation: "download",
      certificateId: "abc123",
      downloadItem: "certificate",
    });
    expect(calls.length).toBe(2);
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toContain("/vedsdk/Certificates/abc123");
    expect(out[0][0].json.CertificateData).toContain("BEGIN CERTIFICATE");
    expect(out[0][0].binary?.data?.mimeType).toBe("application/x-pem-file");
  });

  it("provision a new certificate (create)", async () => {
    installFetch([
      mockResponse({ access_token: "test-token" }),
      mockResponse({
        CertificateDN: "\\VED\\Policy\\MyFolder\\new-cert",
        KeySize: 2048,
        KeyAlgorithm: "RSA",
      }),
    ]);
    const { out } = await run({
      resource: "certificate",
      operation: "create",
      policyDn: "\\VED\\Policy\\MyFolder",
      additionalFields: {
        commonName: "example.com",
        organization: "Example Corp",
        keyAlgorithm: "RSA",
        keySize: 2048,
      },
    });
    expect(calls.length).toBe(2);
    expect(calls[1].method).toBe("POST");
    expect(calls[1].url).toContain("/vedsdk/Certificates/Request");
    const body = JSON.parse(calls[1].body ?? "{}");
    expect(body.PolicyDN).toBe("\\VED\\Policy\\MyFolder");
    expect(body.SubjectDN.CN).toBe("example.com");
    expect(body.SubjectDN.O).toBe("Example Corp");
    expect(body.KeyAlgorithm).toBe("RSA");
    expect(body.KeySize).toBe(2048);
    expect(out[0][0].json.CertificateDN).toBe("\\VED\\Policy\\MyFolder\\new-cert");
  });

  it("get a policy", async () => {
    installFetch([
      mockResponse({ access_token: "test-token" }),
      mockResponse({
        PolicyDN: "\\VED\\Policy\\MyFolder",
        CertificateAuthorityDN: "\\VED\\Policy\\MyCA",
        ServiceGeneratedCertificate: true,
      }),
    ]);
    const { out } = await run({
      resource: "policy",
      operation: "get",
      policyDn: "\\VED\\Policy\\MyFolder",
    });
    expect(calls.length).toBe(2);
    expect(calls[1].method).toBe("POST");
    expect(calls[1].url).toContain("/vedsdk/Config/ReadPolicy");
    const body = JSON.parse(calls[1].body ?? "{}");
    expect(body.PolicyDN).toBe("\\VED\\Policy\\MyFolder");
    expect(out[0][0].json.PolicyDN).toBe("\\VED\\Policy\\MyFolder");
  });

  it("get many certificates", async () => {
    installFetch([
      mockResponse({ access_token: "test-token" }),
      mockResponse({
        Certificates: [
          { DN: "\\VED\\Policy\\Folder\\cert1" },
          { DN: "\\VED\\Policy\\Folder\\cert2" },
        ],
      }),
    ]);
    const { out } = await run({
      resource: "certificate",
      operation: "getMany",
      returnAll: true,
    });
    expect(calls.length).toBe(2);
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toContain("/vedsdk/Certificates");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.DN).toBe("\\VED\\Policy\\Folder\\cert1");
  });

  it("throws when credential is missing", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { resource: "certificate", operation: "get", certificateId: "x" },
    });
    const ctx = makeCtx([{ json: {} }], node, false, {});
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error(`No executor for ${TYPE}`);
    await expect(executor(ctx, node)).rejects.toThrow("credential");
  });

  it("handles continueOnFail", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { resource: "certificate", operation: "get", certificateId: "{{ $json.id }}" },
    });
    const ctx = makeCtx([{ json: { id: "x" } }], node, true, CREDS);
    installFetch([
      mockResponse({ access_token: "test-token" }),
      mockResponse({ error: "Not found" }, 404),
    ]);
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error(`No executor for ${TYPE}`);
    const out = await executor(ctx, node);
    expect(out[0][0].json.error).toBeDefined();
  });
});
