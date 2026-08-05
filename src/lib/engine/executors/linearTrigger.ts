import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const API_BASE = "https://api.linear.app/graphql";

interface FilterCondition {
  field: string;
  operator: string;
  value: unknown;
}

async function getLinearToken(ctx: { getCredential(name: string): Promise<unknown> }): Promise<string> {
  const apiCred = await ctx.getCredential("linearApi");
  if (apiCred) {
    const data = apiCred as Record<string, unknown>;
    const key = String(data.apiKey ?? "");
    if (key) return key;
  }
  const oauthCred = await ctx.getCredential("linearOAuth2Api");
  if (oauthCred) {
    const data = oauthCred as Record<string, unknown>;
    const token = String(data.accessToken ?? "");
    if (token) return token;
  }
  return "";
}

async function registerWebhook(
  token: string,
  event: string,
  webhookUrl: string,
  additionalFields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {
    url: webhookUrl,
    resourceTypes: [event],
  };
  const projectId = String(additionalFields.projectId ?? "");
  if (projectId) input.projectId = projectId;

  const query = `mutation($input: WebhookCreateInput!) { webhookCreate(input: $input) { webhook { id url resourceTypes } } }`;
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables: { input } }),
  });
  const body = await res.json() as Record<string, unknown>;
  if (body.errors) {
    const msgs = (body.errors as Array<{ message: string }>).map((e) => e.message).join("; ");
    throw new Error(`Linear webhook registration failed: ${msgs}`);
  }
  return ((body.data as Record<string, unknown>)?.webhookCreate as Record<string, unknown>)?.webhook as Record<string, unknown> ?? {};
}

function resolveDotPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function matchesFilter(condition: FilterCondition, body: Record<string, unknown>): boolean {
  const fieldValue = resolveDotPath(body, condition.field);
  const condValue = condition.value;
  switch (condition.operator) {
    case "equals":
      return fieldValue === condValue;
    case "notEqual":
      return fieldValue !== condValue;
    case "contains":
      return typeof fieldValue === "string" && typeof condValue === "string" && fieldValue.includes(condValue);
    case "notContains":
      return typeof fieldValue === "string" && typeof condValue === "string" && !fieldValue.includes(condValue);
    case "startsWith":
      return typeof fieldValue === "string" && typeof condValue === "string" && fieldValue.startsWith(condValue);
    case "endsWith":
      return typeof fieldValue === "string" && typeof condValue === "string" && fieldValue.endsWith(condValue);
    case "greaterThan":
      return typeof fieldValue === "number" && typeof condValue === "number" && fieldValue > condValue;
    case "lessThan":
      return typeof fieldValue === "number" && typeof condValue === "number" && fieldValue < condValue;
    default:
      return true;
  }
}

function parseFilters(additionalFields: Record<string, unknown>): FilterCondition[] {
  const rawFilter = additionalFields.filter;
  if (!rawFilter) return [];
  if (typeof rawFilter === "string") {
    try {
      const parsed = JSON.parse(rawFilter);
      if (Array.isArray(parsed)) return parsed as FilterCondition[];
    } catch {
      return [];
    }
  }
  if (Array.isArray(rawFilter)) return rawFilter as FilterCondition[];
  return [];
}

function processWebhookPayload(
  payload: Record<string, unknown>,
  event: string,
  filters: FilterCondition[],
): INodeExecutionData | null {
  const body = payload as Record<string, unknown>;

  if (filters.length > 0) {
    for (const condition of filters) {
      if (!matchesFilter(condition, body)) return null;
    }
  }

  return {
    json: {
      body,
      event,
      timestamp: new Date().toISOString(),
      webhookId: "",
    },
  };
}

export const linearTriggerExecutor: NodeExecutor = async function (ctx) {
  const items = ctx.getInputItems(0);
  const event = ctx.getParam("event", "Issue");
  const additionalFields = (ctx.getParam("additionalFields", {}) ?? {}) as Record<string, unknown>;
  const webhookUrl = ctx.getParam("webhookUrl", "") as string;

  if (webhookUrl) {
    try {
      const token = await getLinearToken(ctx);
      if (!token) throw new Error("Linear Trigger: credential with apiKey or accessToken is required");
      await registerWebhook(token, String(event), webhookUrl, additionalFields);
      return [[{ json: { success: true, event, webhookUrl } }]];
    } catch (err) {
      if (ctx.continueOnFail()) {
        return [[{ json: { error: true, message: (err as Error).message } }]];
      }
      throw err;
    }
  }

  if (items.length === 0) {
    return [[{ json: { event, timestamp: new Date().toISOString() } }]];
  }

  const filters = parseFilters(additionalFields);
  const result: INodeExecutionData[] = [];

  for (const item of items) {
    try {
      const processed = processWebhookPayload(
        item.json as Record<string, unknown>,
        String(event),
        filters,
      );
      if (processed) result.push(processed);
    } catch (err) {
      if (ctx.continueOnFail()) {
        result.push({ json: { error: true, message: (err as Error).message } });
      } else {
        throw err;
      }
    }
  }

  return [result];
};
