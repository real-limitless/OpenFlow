import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.uplead.com/v2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

export const upleadExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "Company");
  const operation = String(node.parameters.operation ?? "Enrich");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runLookup(ctx, node, resource, operation, itemJson);
      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("upleadApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("UpLead: upleadApi credential is not configured");
  }
  return apiKey;
}

async function runLookup(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (resource === "Company" && operation === "Enrich") {
    return companyEnrich(ctx, node, itemJson);
  }
  if (resource === "Person" && operation === "Enrich") {
    return personEnrich(ctx, node, itemJson);
  }
  throw new Error(`UpLead: unsupported resource/operation "${resource}/${operation}"`);
}

async function companyEnrich(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const by = String(node.parameters.by ?? "domain");

  let body: Record<string, string>;
  if (by === "domain") {
    const domain = String(resolveValue(node.parameters.domain, itemJson) ?? "");
    if (!domain) throw new Error("UpLead: Domain is required for company enrich by domain");
    body = { domain };
  } else if (by === "companyName") {
    const companyName = String(resolveValue(node.parameters.companyName, itemJson) ?? "");
    if (!companyName) throw new Error("UpLead: Company Name is required for company enrich by name");
    body = { company: companyName };
  } else {
    throw new Error(`UpLead: unknown lookup mode "${by}" for company enrich`);
  }

  const result = await upleadRequest(API_BASE + "/company-search", apiKey, body);
  const data = result.data ?? {};
  return {
    data,
    userInfo: result.userInfo ?? { availableCredits: 0 },
  };
}

async function personEnrich(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const by = String(node.parameters.by ?? "email");

  let body: Record<string, string>;
  if (by === "email") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!email) throw new Error("UpLead: Email is required for person enrich by email");
    body = { email };
  } else if (by === "nameAndDomain") {
    const firstName = String(resolveValue(node.parameters.firstName, itemJson) ?? "");
    const lastName = String(resolveValue(node.parameters.lastName, itemJson) ?? "");
    const domain = String(resolveValue(node.parameters.domain, itemJson) ?? "");
    if (!firstName || !lastName || !domain) {
      throw new Error("UpLead: First Name, Last Name, and Domain are required for person enrich by name+domain");
    }
    body = { first_name: firstName, last_name: lastName, domain };
  } else {
    throw new Error(`UpLead: unknown lookup mode "${by}" for person enrich`);
  }

  const result = await upleadRequest(API_BASE + "/person-search", apiKey, body);
  const data = result.data ?? {};
  return {
    data,
    userInfo: result.userInfo ?? { availableCredits: 0 },
  };
}

async function upleadRequest(
  url: string,
  apiKey: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    const obj = asObj(parsed);
    if (response.status === 429) {
      throw new Error("UpLead: rate limited (HTTP 429)");
    }
    if (response.status < 200 || response.status >= 300) {
      const errObj = obj.error as Record<string, unknown> | undefined;
      const desc = errObj?.message ? String(errObj.message) : `HTTP ${response.status}`;
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`UpLead: ${desc}`);
      }
      throw new Error(`UpLead: ${desc}`);
    }
    return obj;
  } finally {
    clearTimeout(timer);
  }
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}
