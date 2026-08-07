import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";

function resolveParam(
  ctx: ExecutionContext,
  name: string,
  itemJson: Record<string, unknown>,
): unknown {
  const raw = ctx.getParam(name);
  if (typeof raw === "string" && raw.startsWith("={{") && raw.endsWith("}}")) {
    return ctx.evaluate(raw, itemJson);
  }
  return raw;
}

function getBaseUrl(region: string): string {
  if (region === "EU") return "https://api.eu.venafi.cloud/v1";
  return "https://api.venafi.cloud/v1";
}

async function authHeaders(
  ctx: ExecutionContext,
): Promise<{ baseUrl: string; headers: Record<string, string> }> {
  const cred = await ctx.getCredential("venafiTlsProtectCloudApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  const region = cred ? String(cred.region ?? "US") : "US";
  if (!apiKey) throw new Error("Venafi TLS Protect Cloud: venafiTlsProtectCloudApi credential is missing apiKey");
  return {
    baseUrl: getBaseUrl(region),
    headers: {
      "tppl-api-key": apiKey,
      "Content-Type": "application/json",
    },
  };
}

async function venafiRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  baseUrl: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Venafi request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

function processVenafiError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const msg = typeof obj.error === "string" ? obj.error : typeof obj.message === "string" ? obj.message : `HTTP ${status}`;
  return new Error(`Venafi: ${msg}`);
}

async function requestOk(
  method: string,
  path: string,
  headers: Record<string, string>,
  baseUrl: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await venafiRequest(method, path, headers, baseUrl, body);
  if (res.status < 200 || res.status >= 300) throw processVenafiError(res.body, res.status);
  const obj = asObj(res.body);
  return obj;
}

export const venafiTlsProtectCloudToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "certificateRequest");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  const { baseUrl, headers } = await authHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = (item.json ?? {}) as Record<string, unknown>;
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: Record<string, unknown>;

      if (resource === "certificate") {
        switch (operation) {
          case "delete": {
            const certificateId = String(resolveParam(ctx, "certificateId", itemJson) ?? "");
            if (!certificateId) throw new Error("Venafi: certificateId is required for delete");
            await requestOk("DELETE", `/certificates/${encodeURIComponent(certificateId)}`, headers, baseUrl);
            result = { id: certificateId };
            break;
          }
          case "download": {
            const certificateId = String(resolveParam(ctx, "certificateId", itemJson) ?? "");
            const downloadItem = String(resolveParam(ctx, "downloadItem", itemJson) ?? "certificate");
            const binaryProperty = String(resolveParam(ctx, "binaryProperty", itemJson) ?? "data");
            const opts = (node.parameters.options ?? {}) as Record<string, unknown>;
            const chainOrder = String(opts.chainOrder ?? "ROOT_FIRST");
            const format = String(opts.format ?? "PEM");
            if (!certificateId) throw new Error("Venafi: certificateId is required for download");
            if (downloadItem === "keystore") {
              const keystoreType = String(resolveParam(ctx, "keystoreType", itemJson) ?? "PEM");
              const certificateLabel = String(resolveParam(ctx, "certificateLabel", itemJson) ?? "");
              if (!certificateLabel) throw new Error("Venafi: certificateLabel is required for keystore download");
              const qs = new URLSearchParams({ keystoreType, certificateLabel, chainOrder, format }).toString();
              const resp = await requestOk("GET", `/certificates/${encodeURIComponent(certificateId)}?${qs}`, headers, baseUrl);
              const binaryData = typeof resp.keystore === "string" ? resp.keystore : JSON.stringify(resp);
              out.push({
                json: { certificateId, keystoreType, certificateLabel },
                binary: { [binaryProperty]: binaryData },
                pairedItem,
              });
            } else {
              const qs = new URLSearchParams({ chainOrder, format }).toString();
              const resp = await requestOk("GET", `/certificates/${encodeURIComponent(certificateId)}?${qs}`, headers, baseUrl);
              const certData = typeof resp.certificate === "string" ? resp.certificate : JSON.stringify(resp);
              out.push({
                json: { certificateId },
                binary: { [binaryProperty]: certData },
                pairedItem,
              });
            }
            continue;
          }
          case "get": {
            const certificateId = String(resolveParam(ctx, "certificateId", itemJson) ?? "");
            if (!certificateId) throw new Error("Venafi: certificateId is required for get");
            result = await requestOk("GET", `/certificates/${encodeURIComponent(certificateId)}`, headers, baseUrl);
            break;
          }
          case "getMany": {
            const returnAll = Boolean(node.parameters.returnAll ?? false);
            const limit = Number(node.parameters.limit ?? 50);
            const filters = node.parameters.filters as Record<string, unknown> | undefined;
            const params = new URLSearchParams();
            if (!returnAll) params.set("limit", String(Math.min(Math.max(limit, 1), 500)));
            if (filters?.subject) params.set("subject", String(filters.subject));
            const qs = params.toString();
            result = await requestOk("GET", `/certificates${qs ? `?${qs}` : ""}`, headers, baseUrl);
            break;
          }
          case "renew": {
            const applicationId = String(resolveParam(ctx, "applicationId", itemJson) ?? "");
            const existingCertificateId = String(resolveParam(ctx, "existingCertificateId", itemJson) ?? "");
            const certificateIssuingTemplateId = String(resolveParam(ctx, "certificateIssuingTemplateId", itemJson) ?? "");
            const csr = String(resolveParam(ctx, "certificateSigningRequest", itemJson) ?? "");
            const opts = (node.parameters.options ?? {}) as Record<string, unknown>;
            const validityPeriod = String(opts.validityPeriod ?? "P1Y");
            const body: Record<string, unknown> = { validityPeriod };
            if (applicationId) body.applicationId = applicationId;
            if (existingCertificateId) body.existingCertificateId = existingCertificateId;
            if (certificateIssuingTemplateId) body.certificateIssuingTemplateId = certificateIssuingTemplateId;
            if (csr) body.certificateSigningRequest = csr;
            result = await requestOk("POST", "/certificates/renew", headers, baseUrl, body);
            break;
          }
          default:
            throw new Error(`Venafi: unsupported certificate operation "${operation}"`);
        }
      } else if (resource === "certificateRequest") {
        switch (operation) {
          case "create": {
            const applicationId = String(resolveParam(ctx, "applicationId", itemJson) ?? "");
            const certificateIssuingTemplateId = String(resolveParam(ctx, "certificateIssuingTemplateId", itemJson) ?? "");
            const generateCsr = Boolean(resolveParam(ctx, "generateCsr", itemJson) ?? false);
            const opts = (node.parameters.options ?? {}) as Record<string, unknown>;
            const validityPeriod = String(opts.validityPeriod ?? "P1Y");
            const body: Record<string, unknown> = { validityPeriod };
            if (applicationId) body.applicationId = applicationId;
            if (certificateIssuingTemplateId) body.certificateIssuingTemplateId = certificateIssuingTemplateId;
            if (generateCsr) {
              const commonName = String(resolveParam(ctx, "commonName", itemJson) ?? "");
              if (!commonName) throw new Error("Venafi: commonName is required when generateCsr is true");
              body.commonName = commonName;
              body.generateCsr = true;
              const additional = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
              if (additional.keyType) body.keyType = additional.keyType;
              if (additional.keyLength) body.keyLength = additional.keyLength;
              if (additional.keyCurve) body.keyCurve = additional.keyCurve;
              if (additional.organization) body.organization = additional.organization;
              if (additional.organizationalUnits) body.organizationalUnits = additional.organizationalUnits;
              if (additional.locality) body.locality = additional.locality;
              if (additional.state) body.state = additional.state;
              if (additional.country) body.country = additional.country;
              if (additional.SubjectAltNamesUi) {
                const sanUi = additional.SubjectAltNamesUi as Record<string, unknown>;
                const values = sanUi.SubjectAltNamesValues as Array<Record<string, unknown>> | undefined;
                if (values && values.length > 0) {
                  body.subjectAltNames = values.map((v) => ({
                    type: String(v.Typename ?? "dnsNames"),
                    name: String(v.name ?? ""),
                  }));
                }
              }
            } else {
              const csr = String(resolveParam(ctx, "certificateSigningRequest", itemJson) ?? "");
              if (!csr) throw new Error("Venafi: certificateSigningRequest is required when generateCsr is false");
              body.certificateSigningRequest = csr;
            }
            result = await requestOk("POST", "/certificaterequests", headers, baseUrl, body);
            break;
          }
          case "get": {
            const certificateRequestId = String(resolveParam(ctx, "certificateRequestId", itemJson) ?? "");
            if (!certificateRequestId) throw new Error("Venafi: certificateRequestId is required for get");
            result = await requestOk("GET", `/certificaterequests/${encodeURIComponent(certificateRequestId)}`, headers, baseUrl);
            break;
          }
          case "getMany": {
            const returnAll = Boolean(node.parameters.returnAll ?? false);
            const limit = Number(node.parameters.limit ?? 50);
            const params = new URLSearchParams();
            if (!returnAll) params.set("limit", String(Math.min(Math.max(limit, 1), 500)));
            const qs = params.toString();
            result = await requestOk("GET", `/certificaterequests${qs ? `?${qs}` : ""}`, headers, baseUrl);
            break;
          }
          default:
            throw new Error(`Venafi: unsupported certificate request operation "${operation}"`);
        }
      } else {
        throw new Error(`Venafi: unsupported resource "${resource}"`);
      }

      out.push({ json: result, pairedItem });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem,
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};
