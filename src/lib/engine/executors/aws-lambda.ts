import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function(
        "$json",
        "return (" + raw.slice(1) + ")",
      );
      return fn(itemJson);
    } catch { return raw; }
  }
  return raw;
}

function getParam(params: Record<string, unknown>, name: string, defaultVal: unknown = ""): unknown {
  const raw = params[name];
  return raw !== undefined ? raw : defaultVal;
}

function sha256(data: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)).then((h) =>
    Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join(""),
  );
}

function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  return crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  ).then((cryptoKey) =>
    crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)).then((h) => new Uint8Array(h)),
  );
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function hex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signRequest(opts: {
  method: string;
  region: string;
  service: string;
  host: string;
  path: string;
  queryString: string;
  headers: Record<string, string>;
  bodyHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}): Promise<Record<string, string>> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const signedHeaders = Object.keys(opts.headers).sort().map((k) => k.toLowerCase()).join(";");
  const canonicalRequest = [
    opts.method,
    opts.path,
    opts.queryString,
    ...Object.entries(opts.headers).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k.toLowerCase()}:${v}`),
    "",
    signedHeaders,
    opts.bodyHash,
  ].join("\n");
  const canonicalHash = await sha256(canonicalRequest);
  const credentialScope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, canonicalHash].join("\n");
  const signingKey = await getSignatureKey(opts.secretAccessKey, dateStamp, opts.region, opts.service);
  const signature = hex(await hmacSha256(signingKey, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const outHeaders: Record<string, string> = { "x-amz-date": amzDate, "x-amz-content-sha256": opts.bodyHash, authorization };
  if (opts.sessionToken) outHeaders["x-amz-security-token"] = opts.sessionToken;
  return outHeaders;
}

async function lambdaRequest(
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  functionName: string,
  invocationType: string,
  payload: string,
  qualifier?: string,
  clientContext?: string,
  logType?: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const service = "lambda";
  const host = `lambda.${creds.region}.amazonaws.com`;
  let path = `/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`;
  let queryString = "";
  if (qualifier) queryString = `Qualifier=${encodeURIComponent(qualifier)}`;
  const bodyHash = await sha256(payload);
  const headers: Record<string, string> = {
    host,
    "content-type": "application/json",
    "x-amz-invocation-type": invocationType,
  };
  if (logType && logType !== "None") headers["x-amz-log-type"] = logType;
  if (clientContext) headers["x-amz-client-context"] = clientContext;
  const sigHeaders = await signRequest({
    method: "POST",
    region: creds.region,
    service,
    host,
    path,
    queryString,
    headers,
    bodyHash,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
  });
  const allHeaders: Record<string, string> = { ...headers, ...sigHeaders };
  const url = `https://${host}${path}${queryString ? "?" + queryString : ""}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: allHeaders,
      body: payload,
      signal: controller.signal,
    });
    const text = await response.text();
    const respHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { respHeaders[k] = v; });
    return { status: response.status, body: text, headers: respHeaders };
  } finally {
    clearTimeout(timer);
  }
}

export const awsLambdaExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const params = ctx.getParams();

  const cred = await ctx.getCredential("aws");
  if (!cred) throw new Error('AWS Lambda: credential "aws" is not configured');
  const region = String(cred.region ?? "us-east-1");
  const accessKeyId = String(cred.accessKeyId ?? "");
  const secretAccessKey = String(cred.secretAccessKey ?? "");
  const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS Lambda: accessKeyId and secretAccessKey are required");
  }
  const creds = { region, accessKeyId, secretAccessKey, sessionToken };

  const results: INodeExecutionData[] = [];

  for (const item of items) {
    try {
      const itemJson = item.json ?? {};
      const functionName = String(getParam(params, "functionName", "") ?? "");
      const invocationType = String(getParam(params, "invocationType", "RequestResponse"));
      const rawPayload = getParam(params, "payload", "{}");
      const qualifier = getParam(params, "qualifier", undefined) as string | undefined;
      const clientContext = getParam(params, "clientContext", undefined) as string | undefined;
      const logType = String(getParam(params, "logType", "None") ?? "None");

      const additionalFields = getParam(params, "additionalFields", {}) as Record<string, unknown>;
      const simplifyOutput = additionalFields.simplifyOutput === true;

      let payloadStr: string;
      if (typeof rawPayload === "string" && (rawPayload.startsWith("=") || rawPayload.startsWith("{{"))) {
        const resolved = resolveValue(rawPayload, itemJson);
        payloadStr = typeof resolved === "string" ? resolved : JSON.stringify(resolved);
      } else if (typeof rawPayload === "string") {
        payloadStr = rawPayload;
      } else {
        payloadStr = JSON.stringify(rawPayload);
      }

      const resolvedFunctionName = typeof functionName === "string" && functionName.startsWith("=")
        ? String(resolveValue(functionName, itemJson))
        : functionName;

      const resolvedClientContext = clientContext && typeof clientContext === "string" && clientContext.startsWith("=")
        ? String(resolveValue(clientContext, itemJson))
        : clientContext;

      const resolvedQualifier = qualifier && typeof qualifier === "string" && qualifier.startsWith("=")
        ? String(resolveValue(qualifier, itemJson))
        : qualifier;

      const response = await lambdaRequest(
        creds,
        resolvedFunctionName,
        invocationType,
        payloadStr,
        resolvedQualifier,
        resolvedClientContext,
        logType,
      );

      let outputJson: Record<string, unknown>;
      const isEvent = invocationType === "Event";
      const isDryRun = invocationType === "DryRun";

      if (isEvent) {
        outputJson = { StatusCode: 202 };
      } else if (isDryRun) {
        outputJson = { StatusCode: 204 };
      } else {
        const responseBody = response.body ? tryParseJson(response.body) : {};
        if (response.headers["x-amz-function-error"] && !ctx.continueOnFail()) {
          throw new Error(`Lambda function error: ${response.headers["x-amz-function-error"]}`);
        }
        if (simplifyOutput) {
          outputJson = responseBody as Record<string, unknown>;
        } else {
          outputJson = {
            StatusCode: response.status,
            Payload: responseBody,
            ExecutedVersion: response.headers["x-amz-executed-version"] ?? "$LATEST",
            ...(response.headers["x-amz-function-error"]
              ? { FunctionError: response.headers["x-amz-function-error"] }
              : {}),
            ...(logType === "Tail" && response.headers["x-amz-log-result"]
              ? { LogResult: response.headers["x-amz-log-result"] }
              : {}),
          };
        }
      }
      results.push({ json: outputJson, pairedItem: { item: results.length, input: 0 } });
    } catch (e) {
      if (ctx.continueOnFail()) {
        results.push({ json: { error: String(e) }, pairedItem: { item: results.length, input: 0 } });
      } else {
        throw e;
      }
    }
  }
  return [results];
};

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return { raw: s }; }
}
