import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function(
        "$json",
        `with (new Proxy($json, { has: () => true, get: (t, p) => t[p as string] })) { return ${raw.replace(/^=/, "")}; }`,
      );
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function getParam(
  params: Record<string, unknown>,
  name: string,
  itemJson: Record<string, unknown>,
  defaultVal: unknown = "",
): unknown {
  const raw = params[name];
  if (raw === undefined) return defaultVal;
  return resolveValue(raw, itemJson);
}

function resolveResourceLocator(
  params: Record<string, unknown>,
  name: string,
  itemJson: Record<string, unknown>,
): string {
  const raw = params[name];
  if (!raw) return "";
  if (typeof raw === "string") return String(raw);
  if (typeof raw === "object") {
    const loc = raw as Record<string, unknown>;
    return String(resolveValue(loc.value ?? "", itemJson));
  }
  return String(raw);
}

interface AwsCreds {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

async function getAwsCreds(ctx: ExecutionContext): Promise<AwsCreds> {
  let cred = await ctx.getCredential("aws");
  if (!cred) cred = await ctx.getCredential("awsAssumeRole");
  if (!cred) throw new Error('AWS IAM: credential "aws" or "awsAssumeRole" is not configured');
  const region = String(cred.region ?? "us-east-1");
  const accessKeyId = String(cred.accessKeyId ?? "");
  const secretAccessKey = String(cred.secretAccessKey ?? "");
  const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS IAM: accessKeyId and secretAccessKey are required");
  }
  return { region, accessKeyId, secretAccessKey, sessionToken };
}

function sha256(data: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(data))
    .then((h) =>
      Array.from(new Uint8Array(h))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
}

function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const buf = new Uint8Array(key);
  return (crypto.subtle as SubtleCrypto)
    .importKey("raw", buf.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((cryptoKey) =>
      (crypto.subtle as SubtleCrypto)
        .sign("HMAC", cryptoKey, new TextEncoder().encode(data))
        .then((h) => new Uint8Array(h)),
    );
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function hex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const headers: Record<string, string> = {
    host: opts.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": opts.bodyHash,
    ...(opts.sessionToken ? { "x-amz-security-token": opts.sessionToken } : {}),
    ...opts.headers,
  };

  const canonical = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), String(v).trim()] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaders = canonical.map(([k]) => k).join(";");

  const canonicalRequest = [
    opts.method,
    opts.path,
    opts.queryString,
    ...canonical.map(([k, v]) => `${k}:${v}`),
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

  return { ...headers, authorization };
}

async function iamRequest(
  creds: AwsCreds,
  action: string,
  bodyParams: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const service = "iam";
  const host = "iam.amazonaws.com";
  const body = new URLSearchParams({ Action: action, Version: "2010-05-08", ...bodyParams }).toString();
  const bodyHash = await sha256(body);

  const sigHeaders = await signRequest({
    method: "POST",
    region: creds.region,
    service,
    host,
    path: "/",
    queryString: "",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    bodyHash,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
  });

  const url = `https://${host}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { ...sigHeaders, "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, body: text };
  } finally {
    clearTimeout(timer);
  }
}

function parseXmlSimple(xml: string): Record<string, unknown> {
  const strip = xml.replace(/\s*<\?xml[^>]*>\s*/i, "");
  if (!strip.trim()) return {};
  const out: Record<string, unknown> = {};
  const tagRe = /<(\w+)[^>]*>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(strip)) !== null) {
    const child = match[2].trim();
    if (child.includes("<")) {
      const inner = parseXmlSimple(match[2]);
      if (out[match[1]]) {
        if (!Array.isArray(out[match[1]])) out[match[1]] = [out[match[1]]];
        (out[match[1]] as Record<string, unknown>[]).push(inner);
      } else {
        out[match[1]] = inner;
      }
    } else {
      if (out[match[1]]) {
        if (!Array.isArray(out[match[1]])) out[match[1]] = [out[match[1]]];
        (out[match[1]] as string[]).push(child);
      } else {
        out[match[1]] = child;
      }
    }
  }
  if (Object.keys(out).length === 0 && strip.trim()) return { value: strip.trim() };
  return out;
}

function unwrapXmlRoot(parsed: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(parsed);
  if (keys.length === 0) return parsed;
  const resultKey = keys.find((k) => k.endsWith("Result")) ?? keys[0];
  const only = parsed[resultKey];
  if (!only || typeof only !== "object" || Array.isArray(only)) return parsed;
  return only as Record<string, unknown>;
}

function parseErrorResponse(xml: string): string {
  try {
    const parsed = parseXmlSimple(xml);
    const error = parsed.Error as Record<string, unknown> | undefined;
    if (error) return `${String(error.Code ?? "UnknownError")}: ${String(error.Message ?? "")}`;
    return `IAM API error: ${xml.slice(0, 200)}`;
  } catch {
    return `IAM API error: ${xml.slice(0, 200)}`;
  }
}

export const awsIamExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = node.parameters as Record<string, unknown>;
  const resource = String(params.resource ?? "user");
  const operation = String(params.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  const creds = await getAwsCreds(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(creds, resource, operation, params, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }
  return [out];
};

type OpResult = Record<string, unknown>;
type OpResultList = OpResult | OpResult[];

async function runOperation(
  creds: AwsCreds,
  resource: string,
  operation: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (resource === "user") {
    return runUserOperation(creds, operation, params, itemJson);
  }
  if (resource === "group") {
    return runGroupOperation(creds, operation, params, itemJson);
  }
  throw new Error(`AWS IAM: unsupported resource "${resource}"`);
}

async function runUserOperation(
  creds: AwsCreds,
  operation: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  switch (operation) {
    case "create": {
      const userName = String(getParam(params, "userName", itemJson) ?? "");
      if (!userName) throw new Error("AWS IAM: userName is required for create");
      const res = await iamRequest(creds, "CreateUser", { UserName: userName });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(parseErrorResponse(res.body));
      }
      const parsed = unwrapXmlRoot(parseXmlSimple(res.body));
      return { User: parsed.User as Record<string, unknown> ?? parsed };
    }
    case "get": {
      const userName = resolveResourceLocator(params, "user", itemJson);
      if (!userName) throw new Error("AWS IAM: user is required for get");
      const res = await iamRequest(creds, "GetUser", { UserName: userName });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(parseErrorResponse(res.body));
      }
      const parsed = unwrapXmlRoot(parseXmlSimple(res.body));
      return { User: parsed.User as Record<string, unknown> ?? parsed };
    }
    case "getAll": {
      const returnAll = Boolean(params.returnAll);
      const limit = Number(params.limit ?? 50);
      const bodyParams: Record<string, string> = {};
      if (!returnAll) {
        bodyParams.MaxItems = String(Math.min(limit, 1000));
      }
      const users: Record<string, unknown>[] = [];
      let marker: string | undefined;
      do {
        if (marker) bodyParams.Marker = marker;
        const res = await iamRequest(creds, "ListUsers", bodyParams);
        if (res.status < 200 || res.status >= 300) {
          throw new Error(parseErrorResponse(res.body));
        }
        const parsed = unwrapXmlRoot(parseXmlSimple(res.body));
        const usersNode = parsed.Users as Record<string, unknown> | undefined;
        if (usersNode) {
          const member = usersNode.member;
          if (Array.isArray(member)) {
            users.push(...(member as Record<string, unknown>[]));
          } else if (member) {
            users.push(member as Record<string, unknown>);
          }
        }
        marker = parsed.IsTruncated === "true" ? (parsed.Marker as string) : undefined;
        if (!returnAll && users.length >= limit) {
          users.splice(limit);
          break;
        }
      } while (marker);
      return users;
    }
    case "delete": {
      const userName = resolveResourceLocator(params, "user", itemJson);
      if (!userName) throw new Error("AWS IAM: user is required for delete");
      const res = await iamRequest(creds, "DeleteUser", { UserName: userName });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(parseErrorResponse(res.body));
      }
      return { success: true };
    }
    case "update": {
      const userName = resolveResourceLocator(params, "user", itemJson);
      const newUserName = String(getParam(params, "userName", itemJson) ?? "");
      if (!userName || !newUserName) throw new Error("AWS IAM: user and userName are required for update");
      const res = await iamRequest(creds, "UpdateUser", { UserName: userName, NewUserName: newUserName });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(parseErrorResponse(res.body));
      }
      return { success: true };
    }
    case "addToGroup": {
      const userName = resolveResourceLocator(params, "user", itemJson);
      const groupName = resolveResourceLocator(params, "group", itemJson);
      if (!userName || !groupName) throw new Error("AWS IAM: user and group are required for addToGroup");
      const res = await iamRequest(creds, "AddUserToGroup", { UserName: userName, GroupName: groupName });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(parseErrorResponse(res.body));
      }
      return { success: true };
    }
    case "removeFromGroup": {
      const userName = resolveResourceLocator(params, "user", itemJson);
      const groupName = resolveResourceLocator(params, "group", itemJson);
      if (!userName || !groupName) throw new Error("AWS IAM: user and group are required for removeFromGroup");
      const res = await iamRequest(creds, "RemoveUserFromGroup", { UserName: userName, GroupName: groupName });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(parseErrorResponse(res.body));
      }
      return { success: true };
    }
    default:
      throw new Error(`AWS IAM: unsupported user operation "${operation}"`);
  }
}

async function runGroupOperation(
  creds: AwsCreds,
  operation: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  switch (operation) {
    case "create": {
      const groupName = String(getParam(params, "groupName", itemJson) ?? "");
      if (!groupName) throw new Error("AWS IAM: groupName is required for create");
      const res = await iamRequest(creds, "CreateGroup", { GroupName: groupName });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(parseErrorResponse(res.body));
      }
      const parsed = unwrapXmlRoot(parseXmlSimple(res.body));
      return { Group: parsed.Group as Record<string, unknown> ?? parsed };
    }
    case "get": {
      const groupName = resolveResourceLocator(params, "group", itemJson);
      if (!groupName) throw new Error("AWS IAM: group is required for get");
      const includeUsers = Boolean(params.includeUsers);
      const bodyParams: Record<string, string> = { GroupName: groupName };
      const res = await iamRequest(creds, "GetGroup", bodyParams);
      if (res.status < 200 || res.status >= 300) {
        throw new Error(parseErrorResponse(res.body));
      }
      const parsed = unwrapXmlRoot(parseXmlSimple(res.body));
      const group = (parsed.Group as Record<string, unknown>) ?? {};
      const users = parsed.Users as Record<string, unknown> | undefined;
      if (includeUsers && users) {
        const member = users.member;
        group.Users = Array.isArray(member) ? member : member ? [member] : [];
      }
      return { Group: group };
    }
    case "getAll": {
      const returnAll = Boolean(params.returnAll);
      const limit = Number(params.limit ?? 50);
      const includeUsers = Boolean(params.includeUsers);
      const bodyParams: Record<string, string> = {};
      if (!returnAll) {
        bodyParams.MaxItems = String(Math.min(limit, 1000));
      }
      const groups: Record<string, unknown>[] = [];
      let marker: string | undefined;
      do {
        if (marker) bodyParams.Marker = marker;
        const res = await iamRequest(creds, "ListGroups", bodyParams);
        if (res.status < 200 || res.status >= 300) {
          throw new Error(parseErrorResponse(res.body));
        }
        const parsed = unwrapXmlRoot(parseXmlSimple(res.body));
        const groupsNode = parsed.Groups as Record<string, unknown> | undefined;
        if (groupsNode) {
          const member = groupsNode.member;
          if (Array.isArray(member)) {
            groups.push(...(member as Record<string, unknown>[]));
          } else if (member) {
            groups.push(member as Record<string, unknown>);
          }
        }
        marker = parsed.IsTruncated === "true" ? (parsed.Marker as string) : undefined;
        if (!returnAll && groups.length >= limit) {
          groups.splice(limit);
          break;
        }
      } while (marker);

      if (includeUsers && groups.length > 0) {
        for (const group of groups) {
          try {
            const gRes = await iamRequest(creds, "GetGroup", { GroupName: String(group.GroupName ?? "") });
            if (gRes.status >= 200 && gRes.status < 300) {
              const gParsed = unwrapXmlRoot(parseXmlSimple(gRes.body));
              const gUsers = gParsed.Users as Record<string, unknown> | undefined;
              if (gUsers) {
                const member = gUsers.member;
                group.Users = Array.isArray(member) ? member : member ? [member] : [];
              }
            }
          } catch {
            // skip user fetch for this group on error
          }
        }
      }
      return groups;
    }
    case "delete": {
      const groupName = resolveResourceLocator(params, "group", itemJson);
      if (!groupName) throw new Error("AWS IAM: group is required for delete");
      const res = await iamRequest(creds, "DeleteGroup", { GroupName: groupName });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(parseErrorResponse(res.body));
      }
      return { success: true };
    }
    case "update": {
      const groupName = resolveResourceLocator(params, "group", itemJson);
      const newGroupName = String(getParam(params, "groupName", itemJson) ?? "");
      if (!groupName || !newGroupName) throw new Error("AWS IAM: group and groupName are required for update");
      const res = await iamRequest(creds, "UpdateGroup", { GroupName: groupName, NewGroupName: newGroupName });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(parseErrorResponse(res.body));
      }
      return { success: true };
    }
    default:
      throw new Error(`AWS IAM: unsupported group operation "${operation}"`);
  }
}
