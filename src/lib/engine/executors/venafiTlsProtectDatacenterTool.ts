import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function getBaseUrl(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("venafiTlsProtectDatacenterApi");
  const domain = cred ? String(cred.domain ?? "") : "";
  if (!domain) {
    throw new Error("Venafi Tool: venafiTlsProtectDatacenterApi credential is not configured");
  }
  const base = domain.replace(/\/+$/, "");
  return `${base}/vedsdk`;
}

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("venafiTlsProtectDatacenterApi");
  if (!cred) {
    throw new Error("Venafi Tool: venafiTlsProtectDatacenterApi credential is not configured");
  }
  const clientId = String(cred.clientId ?? "");
  const username = String(cred.username ?? "");
  const password = String(cred.password ?? "");
  const domain = String(cred.domain ?? "");
  const allowSelfSigned = cred.allowSelfSigned === true || cred.allowSelfSigned === "true";

  if (!clientId || !username || !password || !domain) {
    throw new Error("Venafi Tool: credential must include domain, clientId, username, and password");
  }

  const base = domain.replace(/\/+$/, "");
  const tokenUrl = `${base}/vedauth/authorize/oauth`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        username,
        password,
        grant_type: "password",
        scope: "certificate:manage,discover:manage",
      }).toString(),
      signal: controller.signal,
    };
    if (allowSelfSigned) (init as Record<string, unknown>).allowSelfSigned = true;
    const response = await fetch(tokenUrl, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      throw new Error(obj.error_description
        ? String(obj.error_description)
        : (obj.error ? String(obj.error) : `Token request failed (${response.status})`));
    }
    const data = asObj(parsed);
    return String(data.access_token ?? "");
  } finally {
    clearTimeout(timer);
  }
}

async function venafiRequest(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<unknown> {
  const fullPath = params ? `${path}?${new URLSearchParams(params).toString()}` : path;
  const url = `${baseUrl}${fullPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = obj.error_description
        ? String(obj.error_description)
        : (obj.message ? String(obj.message) : `Request failed with status code ${response.status}`);
      throw new Error(errMsg);
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Request failed")) throw err;
    if (err instanceof Error && !err.message.includes("Venafi Tool:")) {
      throw new Error(`Venafi Tool request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const venafiTlsProtectDatacenterToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "certificate");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  const baseUrl = await getBaseUrl(ctx);
  const token = await getToken(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(baseUrl, token, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, binary: r.binary, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, { data: string; mimeType: string; fileName?: string }>;
}

async function runOperation(
  baseUrl: string,
  token: string,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  if (resource === "certificate") {
    return runCertificateOperation(baseUrl, token, node, operation, itemJson);
  }
  if (resource === "policy") {
    return runPolicyOperation(baseUrl, token, node, operation, itemJson);
  }
  throw new Error(`Venafi Tool: unsupported resource "${resource}"`);
}

async function runCertificateOperation(
  baseUrl: string,
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  switch (operation) {
    case "create":
      return createCertificate(baseUrl, token, node, itemJson);
    case "delete":
      return deleteCertificate(baseUrl, token, node, itemJson);
    case "download":
      return downloadCertificate(baseUrl, token, node, itemJson);
    case "get":
      return getCertificate(baseUrl, token, node, itemJson);
    case "getMany":
      return getManyCertificates(baseUrl, token, node, itemJson);
    case "renew":
      return renewCertificate(baseUrl, token, node, itemJson);
    default:
      throw new Error(`Venafi Tool: unsupported certificate operation "${operation}"`);
  }
}

async function runPolicyOperation(
  baseUrl: string,
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  if (operation === "get") {
    return getPolicy(baseUrl, token, node, itemJson);
  }
  throw new Error(`Venafi Tool: unsupported policy operation "${operation}"`);
}

async function createCertificate(
  baseUrl: string,
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const policyDn = String(resolveValue(node.parameters.policyDn, itemJson) ?? "");
  if (!policyDn) throw new Error("Venafi Tool: policyDn is required for certificate create");

  const addFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const opts = (node.parameters.options ?? {}) as Record<string, unknown>;

  const body: Record<string, unknown> = {
    PolicyDN: policyDn,
  };

  const subj: Record<string, string> = {};
  if (addFields.commonName) subj.CN = String(addFields.commonName);
  if (addFields.organization) subj.O = String(addFields.organization);
  if (addFields.organizationalUnit) subj.OU = String(addFields.organizationalUnit);
  if (addFields.locality) subj.L = String(addFields.locality);
  if (addFields.state) subj.ST = String(addFields.state);
  if (addFields.country) subj.C = String(addFields.country);
  if (Object.keys(subj).length > 0) body.SubjectDN = subj;

  if (addFields.keyAlgorithm) body.KeyAlgorithm = String(addFields.keyAlgorithm);
  if (addFields.keySize) body.KeySize = Number(addFields.keySize);
  if (addFields.subjectAltNames) {
    const sans = String(addFields.subjectAltNames).split(",").map(s => s.trim()).filter(Boolean);
    if (sans.length > 0) body.SubjectAltNames = sans;
  }
  if (opts.validityPeriod) body.ValidityPeriod = String(opts.validityPeriod);

  const res = await venafiRequest(baseUrl, token, "POST", "/Certificates/Request", body);
  return { json: asObj(res) };
}

async function deleteCertificate(
  baseUrl: string,
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const certificateId = String(resolveValue(node.parameters.certificateId, itemJson) ?? "");
  if (!certificateId) throw new Error("Venafi Tool: certificateId is required for delete");
  const res = await venafiRequest(baseUrl, token, "DELETE", `/Certificates/${encodeURIComponent(certificateId)}`);
  return { json: asObj(res) };
}

async function downloadCertificate(
  baseUrl: string,
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const certificateId = String(resolveValue(node.parameters.certificateId, itemJson) ?? "");
  if (!certificateId) throw new Error("Venafi Tool: certificateId is required for download");

  const downloadItem = String(node.parameters.downloadItem ?? "certificate");
  const binaryProperty = String(node.parameters.binaryProperty ?? "data");

  if (downloadItem === "keystore") {
    const keystoreType = String(node.parameters.keystoreType ?? "PEM");
    const certificateLabel = String(resolveValue(node.parameters.certificateLabel, itemJson) ?? "");
    const privateKeyPassphrase = String(resolveValue(node.parameters.privateKeyPassphrase, itemJson) ?? "");
    if (!certificateLabel) throw new Error("Venafi Tool: certificateLabel is required for keystore download");
    if (!privateKeyPassphrase) throw new Error("Venafi Tool: privateKeyPassphrase is required for keystore download");

    const body: Record<string, unknown> = {
      CertificateDN: certificateId,
      Format: keystoreType,
      CertificateLabel: certificateLabel,
      PrivateKeyPassphrase: privateKeyPassphrase,
    };
    if (keystoreType === "JKS") {
      const ksPass = String(resolveValue(node.parameters.keystorePassphrase, itemJson) ?? "");
      if (!ksPass) throw new Error("Venafi Tool: keystorePassphrase is required for JKS download");
      body.KeystorePassphrase = ksPass;
    }

    const res = await venafiRequest(baseUrl, token, "POST", "/Certificates/Retrieve", body);
    const data = asObj(res);

    return {
      json: {
        certificateLabel,
        keystoreType,
        ...data,
      },
      binary: {
        [binaryProperty]: {
          data: String(data.KeystoreData ?? data.PKCS12Data ?? ""),
          mimeType: keystoreType === "JKS" ? "application/octet-stream" : "application/x-pem-file",
          fileName: `${certificateLabel}.${keystoreType.toLowerCase()}`,
        },
      },
    };
  }

  const res = await venafiRequest(baseUrl, token, "GET", `/Certificates/${encodeURIComponent(certificateId)}`);
  const data = asObj(res);
  const pemData = String(data.CertificateData ?? data.certificateData ?? JSON.stringify(data));

  return {
    json: data,
    binary: {
      [binaryProperty]: {
        data: pemData,
        mimeType: "application/x-pem-file",
        fileName: `${certificateId}.pem`,
      },
    },
  };
}

async function getCertificate(
  baseUrl: string,
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const certificateId = String(resolveValue(node.parameters.certificateId, itemJson) ?? "");
  if (!certificateId) throw new Error("Venafi Tool: certificateId is required for get");
  const res = await venafiRequest(baseUrl, token, "GET", `/Certificates/${encodeURIComponent(certificateId)}`);
  return { json: asObj(res) };
}

async function getManyCertificates(
  baseUrl: string,
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult[]> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;

  const params: Record<string, string> = {};
  if (!returnAll) params.limit = String(limit);
  const subjectFilter = String(resolveValue(filters.subject, itemJson) ?? "");
  if (subjectFilter) params.subject = subjectFilter;

  const res = await venafiRequest(baseUrl, token, "GET", "/Certificates", undefined, params);

  const out: OpResult[] = [];
  if (res && typeof res === "object") {
    const list = Array.isArray(res) ? res : (res as Record<string, unknown>).Certificates ?? [];
    if (Array.isArray(list)) {
      for (const cert of list) {
        out.push({ json: asObj(cert) });
      }
    }
  }
  return out;
}

async function renewCertificate(
  baseUrl: string,
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const certificateId = String(resolveValue(node.parameters.certificateId, itemJson) ?? "");
  if (!certificateId) throw new Error("Venafi Tool: certificateId is required for renew");

  const policyDn = String(resolveValue(node.parameters.policyDn, itemJson) ?? "");
  const addFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const opts = (node.parameters.options ?? {}) as Record<string, unknown>;
  const existingId = String(resolveValue(node.parameters.existingCertificateId, itemJson) ?? "");

  const body: Record<string, unknown> = {
    CertificateDN: certificateId,
  };
  if (policyDn) body.PolicyDN = policyDn;
  if (existingId) body.ExistingCertificateId = existingId;
  if (opts.validityPeriod) body.ValidityPeriod = String(opts.validityPeriod);

  const res = await venafiRequest(baseUrl, token, "POST", "/Certificates/Renew", body);
  return { json: asObj(res) };
}

async function getPolicy(
  baseUrl: string,
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const policyDn = String(resolveValue(node.parameters.policyDn, itemJson) ?? "");
  if (!policyDn) throw new Error("Venafi Tool: policyDn is required for policy get");

  const addFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;

  const body: Record<string, unknown> = {
    PolicyDN: policyDn,
  };
  if (addFields.PKCS10) body.PKCS10 = String(addFields.PKCS10);

  const res = await venafiRequest(baseUrl, token, "POST", "/Config/ReadPolicy", body);
  return { json: asObj(res) };
}
