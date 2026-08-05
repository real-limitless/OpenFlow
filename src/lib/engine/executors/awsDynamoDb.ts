import type { NodeExecutor, ExecutionContext } from "@/sdk";
import { ensureItems, withPairedItem } from "@/sdk";

function getParam(node: { parameters: Record<string, unknown> }, name: string, defaultVal: unknown = ""): unknown {
  const raw = node.parameters[name];
  return raw !== undefined && raw !== null ? raw : defaultVal;
}

function str(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") return String((val as Record<string, unknown>).value ?? val);
  return String(val ?? "");
}

function typedValue(val: unknown): Record<string, unknown> {
  if (typeof val === "number") return { N: String(val) };
  if (typeof val === "boolean") return { BOOL: val };
  if (val === null || val === undefined) return { NULL: true };
  if (typeof val === "string") {
    if (/^-?\d+\.?\d*$/.test(val)) return { N: val };
    return { S: val };
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return { SS: [] };
    const type = typeof val[0];
    if (type === "string") return { SS: val };
    if (type === "number") return { NS: val.map(String) };
    return { L: val.map(typedValue) };
  }
  if (typeof val === "object") {
    const keys = Object.keys(val as Record<string, unknown>);
    if (keys.length === 1 && ["S", "N", "B", "SS", "NS", "BS", "BOOL", "NULL", "L", "M"].includes(keys[0])) {
      return val as Record<string, unknown>;
    }
    return { M: Object.fromEntries(keys.map((k) => [k, typedValue((val as Record<string, unknown>)[k])])) };
  }
  return { S: String(val) };
}

function unwrapValue(attr: Record<string, unknown>): unknown {
  if (attr.S !== undefined) return attr.S;
  if (attr.N !== undefined) {
    const n = Number(attr.N);
    return Number.isFinite(n) ? n : attr.N;
  }
  if (attr.BOOL !== undefined) return attr.BOOL;
  if (attr.NULL === true) return null;
  if (attr.SS !== undefined) return attr.SS;
  if (attr.NS !== undefined) return attr.NS?.map(Number);
  if (attr.L !== undefined) return attr.L.map((a: unknown) => unwrapValue(a as Record<string, unknown>));
  if (attr.M !== undefined) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(attr.M as Record<string, unknown>)) {
      out[k] = unwrapValue(v as Record<string, unknown>);
    }
    return out;
  }
  return null;
}

function unwrapItem(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    out[k] = unwrapValue(v as Record<string, unknown>);
  }
  return out;
}

async function getAwsCreds(ctx: ExecutionContext): Promise<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}> {
  const cred = await ctx.getCredential("aws");
  if (!cred) throw new Error('AWS DynamoDB: credential "aws" is not configured');
  const region = String(cred.region ?? "us-east-1");
  const accessKeyId = String(cred.accessKeyId ?? "");
  const secretAccessKey = String(cred.secretAccessKey ?? "");
  const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS DynamoDB: accessKeyId and secretAccessKey are required");
  }
  return { region, accessKeyId, secretAccessKey, sessionToken };
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

async function dynamoDbRequest(opts: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  target: string;
  body: string;
}): Promise<Record<string, unknown>> {
  const host = `dynamodb.${opts.region}.amazonaws.com`;
  const bodyHash = await sha256(opts.body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host,
    "x-amz-date": amzDate,
    "x-amz-target": opts.target,
    "content-type": "application/x-amz-json-1.0",
  };
  if (opts.sessionToken) headers["x-amz-security-token"] = opts.sessionToken;
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    ...Object.keys(headers).sort().map((k) => `${k.toLowerCase()}:${headers[k]}`),
    "",
    signedHeaders,
    bodyHash,
  ].join("\n");
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${opts.region}/dynamodb/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, await sha256(canonicalRequest)].join("\n");
  const signingKey = await getSignatureKey(opts.secretAccessKey, dateStamp, opts.region, "dynamodb");
  const signature = hex(await hmacSha256(signingKey, stringToSign));
  headers.authorization = `${algorithm} Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `https://${host}/`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: opts.body,
  });
  const text = await res.text();
  if (!res.ok) {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch {}
    const code = (parsed.__type as string)?.split("#")?.pop() ?? "Unknown";
    throw Object.assign(new Error(text), { code, message: text, statusCode: res.status });
  }
  return JSON.parse(text);
}

function buildKeyObject(keysUi: unknown): Record<string, Record<string, unknown>> {
  const key: Record<string, Record<string, unknown>> = {};
  const ui = keysUi as { keyValues?: Array<Record<string, unknown>> } | undefined;
  if (!ui?.keyValues) return key;
  for (const kv of ui.keyValues) {
    const k = str(kv.key);
    const t = str(kv.type || "S");
    const v = str(kv.value);
    key[k] = { [t]: v };
  }
  return key;
}

function buildExpressionAttributes(
  eanUi: unknown,
  eavUi: unknown,
): { expressionAttributeNames?: Record<string, string>; expressionAttributeValues?: Record<string, Record<string, unknown>> } {
  const out: { expressionAttributeNames?: Record<string, string>; expressionAttributeValues?: Record<string, Record<string, unknown>> } = {};
  const ean = eanUi as { ean?: Array<Record<string, unknown>> } | undefined;
  if (ean?.ean) {
    out.expressionAttributeNames = {};
    for (const entry of ean.ean) {
      out.expressionAttributeNames[str(entry.name)] = str(entry.value);
    }
  }
  const eav = eavUi as { eavValues?: Array<Record<string, unknown>> } | undefined;
  if (eav?.eavValues) {
    out.expressionAttributeValues = {};
    for (const entry of eav.eavValues) {
      const attr = str(entry.attribute);
      const t = str(entry.type || "S");
      out.expressionAttributeValues[attr] = { [t]: str(entry.value) };
    }
  }
  return out;
}

export const awsDynamoDbExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const creds = await getAwsCreds(ctx);
  const resource = str(getParam(node, "resource"));
  const operation = str(getParam(node, "operation"));
  const tableName = str(getParam(node, "tableName"));

  if (!tableName) throw new Error("AWS DynamoDB: tableName is required");

  const output: Array<Record<string, unknown>> = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json;

    try {
      let result: Record<string, unknown> = {};

      if (resource !== "item") throw new Error(`AWS DynamoDB: unknown resource "${resource}"`);

      if (operation === "upsert") {
        let dynamoItem: Record<string, Record<string, unknown>> = {};
        const dataToSend = str(getParam(node, "dataToSend"));
        if (dataToSend === "autoMapInputData") {
          const inputsToIgnore = str(getParam(node, "inputsToIgnore"));
          const ignoreFields = inputsToIgnore ? inputsToIgnore.split(",").map((f) => f.trim()) : [];
          for (const [k, v] of Object.entries(itemJson)) {
            if (!ignoreFields.includes(k)) {
              dynamoItem[k] = typedValue(v);
            }
          }
        } else {
          const fieldsUi = getParam(node, "fieldsUi") as { fieldValues?: Array<Record<string, unknown>> } | undefined;
          if (fieldsUi?.fieldValues) {
            for (const fv of fieldsUi.fieldValues) {
              const fieldId = str(fv.fieldId);
              const fieldValue = fv.fieldValue;
              dynamoItem[fieldId] = typedValue(fieldValue);
            }
          }
        }
        const additionalFields = getParam(node, "additionalFields") as Record<string, unknown> | undefined;
        const body: Record<string, unknown> = {
          TableName: tableName,
          Item: dynamoItem,
        };
        if (additionalFields?.conditionExpression) {
          body.ConditionExpression = str(additionalFields.conditionExpression);
        }
        const ea = buildExpressionAttributes(additionalFields?.eanUi, undefined);
        if (ea.expressionAttributeNames) body.ExpressionAttributeNames = ea.expressionAttributeNames;

        result = await dynamoDbRequest({
          region: creds.region,
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
          target: "DynamoDB_20120810.PutItem",
          body: JSON.stringify(body),
        });
        result = { success: true, ...result };
      } else if (operation === "get") {
        const keysUi = getParam(node, "keysUi");
        const key = buildKeyObject(keysUi);
        const additionalFields = getParam(node, "additionalFields") as Record<string, unknown> | undefined;
        const body: Record<string, unknown> = { TableName: tableName, Key: key };
        const select = str(getParam(node, "select"));
        if (select && select !== "ALL_ATTRIBUTES") {
          if (select === "SPECIFIC_ATTRIBUTES" && additionalFields?.projectionExpression) {
            body.ProjectionExpression = str(additionalFields.projectionExpression);
          }
        }
        if (additionalFields?.readType === "stronglyConsistentRead") {
          body.ConsistentRead = true;
        }
        const ea = buildExpressionAttributes(additionalFields?.eanUi, undefined);
        if (ea.expressionAttributeNames) body.ExpressionAttributeNames = ea.expressionAttributeNames;

        const resp = await dynamoDbRequest({
          region: creds.region,
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
          target: "DynamoDB_20120810.GetItem",
          body: JSON.stringify(body),
        });
        if (resp.Item) {
          result = { data: unwrapItem(resp.Item as Record<string, unknown>) };
        } else {
          continue;
        }
      } else if (operation === "getAll") {
        const scan = getParam(node, "scan") === true || str(getParam(node, "scan")) === "true";
        const select = str(getParam(node, "select"));
        const returnAll = getParam(node, "returnAll") === true || str(getParam(node, "returnAll")) === "true";
        const limit = !returnAll ? Number(getParam(node, "limit")) || 0 : 0;
        const options = getParam(node, "options") as Record<string, unknown> | undefined;

        const body: Record<string, unknown> = { TableName: tableName };
        if (select && select !== "ALL_ATTRIBUTES") {
          body.Select = select;
          if (select === "SPECIFIC_ATTRIBUTES" && options?.projectionExpression) {
            body.ProjectionExpression = str(options.projectionExpression);
          }
        }
        if (options?.projectionExpression && !body.ProjectionExpression) {
          body.ProjectionExpression = str(options.projectionExpression);
        }
        if (limit > 0) body.Limit = limit;
        if (options?.indexName) body.IndexName = str(options.indexName);
        if (scan) {
          const filterExpr = str(getParam(node, "filterExpression")) || str(options?.filterExpression || "");
          if (filterExpr) body.FilterExpression = filterExpr;
        } else {
          const keyCondition = str(getParam(node, "keyConditionExpression"));
          if (keyCondition) body.KeyConditionExpression = keyCondition;
          const filterExpr = str(options?.filterExpression || "");
          if (filterExpr) body.FilterExpression = filterExpr;
        }
        if (options?.eanUi) {
          const ea = buildExpressionAttributes(options.eanUi, undefined);
          if (ea.expressionAttributeNames) body.ExpressionAttributeNames = ea.expressionAttributeNames;
        }
        const eavUi = getParam(node, "eavUi");
        const ea = buildExpressionAttributes(undefined, eavUi);
        if (ea.expressionAttributeValues) body.ExpressionAttributeValues = ea.expressionAttributeValues;

        const target = scan ? "DynamoDB_20120810.Scan" : "DynamoDB_20120810.Query";
        const resp = await dynamoDbRequest({
          region: creds.region,
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
          target,
          body: JSON.stringify(body),
        });
        const rawItems = (resp.Items as Array<Record<string, unknown>>) ?? [];
        const data = rawItems.map(unwrapItem);
        result = { data };
      } else if (operation === "delete") {
        const keysUi = getParam(node, "keysUi");
        const key = buildKeyObject(keysUi);
        const returnValues = str(getParam(node, "returnValues"));
        const additionalFields = getParam(node, "additionalFields") as Record<string, unknown> | undefined;
        const body: Record<string, unknown> = { TableName: tableName, Key: key };
        if (returnValues && returnValues !== "NONE") {
          body.ReturnValues = returnValues;
        }
        if (additionalFields?.conditionExpression) {
          body.ConditionExpression = str(additionalFields.conditionExpression);
        }
        const ea = buildExpressionAttributes(additionalFields?.eanUi, additionalFields?.expressionAttributeUi);
        if (ea.expressionAttributeNames) body.ExpressionAttributeNames = ea.expressionAttributeNames;
        if (ea.expressionAttributeValues) body.ExpressionAttributeValues = ea.expressionAttributeValues;

        const resp = await dynamoDbRequest({
          region: creds.region,
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
          target: "DynamoDB_20120810.DeleteItem",
          body: JSON.stringify(body),
        });
        if (returnValues === "ALL_OLD" && resp.Attributes) {
          result = { success: true, data: unwrapItem(resp.Attributes as Record<string, unknown>) };
        } else {
          result = { success: true };
        }
      } else {
        throw new Error(`AWS DynamoDB: unknown operation "${operation}"`);
      }

      output.push({ ...itemJson, ...result });
    } catch (err: unknown) {
      if (ctx.continueOnFail()) {
        const e = err as { code?: string; message?: string };
        output.push({ ...itemJson, error: { message: e.message ?? "Unknown error", code: e.code ?? "Unknown" } });
      } else {
        throw err;
      }
    }
  }

  return [output.map((json, i) => withPairedItem({ json }, i))];
};
