import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://connect.signl4.com/webhook";

export const signl4Executor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("signl4Api");
  if (!cred) throw new Error("SIGNL4: signl4Api credential is required");
  const teamSecret = String((cred as Record<string, unknown>).teamSecret ?? "");
  if (!teamSecret) throw new Error("SIGNL4: teamSecret is missing in credential");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await sendSignl4(ctx, node.parameters, itemJson, teamSecret);
      out.push({
        json: { ...itemJson, eventId: (result as Record<string, unknown>).eventId },
        pairedItem,
      });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...itemJson, error: { message } }, pairedItem });
    }
  }

  return [out];
};

async function sendSignl4(
  ctx: ExecutionContext,
  parameters: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  teamSecret: string,
): Promise<unknown> {
  const resource = String(parameters.resource ?? "alert");
  const operation = String(parameters.operation ?? "send");

  const url = `${API_BASE}/${teamSecret}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let body: Record<string, unknown> = {};

  if (resource === "alert") {
    if (operation === "send") {
      const alertFields = (parameters.alertFields as Record<string, unknown>) ?? {};
      const additional = (alertFields.alertFieldsAdditional as Record<string, unknown>) ?? {};

      const message = resolveParam(ctx, alertFields.message, itemJson);
      if (message) body.message = String(message);

      const xS4Service = resolveParam(ctx, additional.xS4Service, itemJson);
      if (xS4Service) headers["X-S4-Service"] = String(xS4Service);

      const xS4Location = resolveParam(ctx, additional.xS4Location, itemJson);
      if (xS4Location) headers["X-S4-Location"] = String(xS4Location);

      const xS4AlertingScenario = additional.xS4AlertingScenario ?? "single_ack";
      headers["X-S4-AlertingScenario"] = String(xS4AlertingScenario);

      const xS4ExternalID = resolveParam(ctx, additional.xS4ExternalID, itemJson);
      if (xS4ExternalID) headers["X-S4-ExternalID"] = String(xS4ExternalID);

      const xS4Filtering = additional.xS4Filtering;
      if (xS4Filtering !== undefined && xS4Filtering !== null) {
        headers["X-S4-Filtering"] = String(xS4Filtering);
      }
    } else if (operation === "resolve") {
      const resolveFields = (parameters.resolveFields as Record<string, unknown>) ?? {};
      const xS4ExternalID = resolveParam(ctx, resolveFields.xS4ExternalID, itemJson);
      if (!xS4ExternalID) throw new Error("SIGNL4: xS4ExternalID is required for resolve operation");
      headers["X-S4-ExternalID"] = String(xS4ExternalID);
      headers["X-S4-Status"] = "resolved";
    }
  }

  const options = (parameters.options as Record<string, unknown>) ?? {};
  const extIdParam = resolveParam(ctx, options.extIdParam, itemJson);
  if (extIdParam) headers["ExtIdParam"] = String(extIdParam);
  const extStatusParam = resolveParam(ctx, options.extStatusParam, itemJson);
  if (extStatusParam) headers["ExtStatusParam"] = String(extStatusParam);
  const newStatus = resolveParam(ctx, options.newStatus, itemJson);
  if (newStatus) headers["NewStatus"] = String(newStatus);
  const resolvedStatus = resolveParam(ctx, options.resolvedStatus, itemJson);
  if (resolvedStatus) headers["ResolvedStatus"] = String(resolvedStatus);
  const ackStatus = resolveParam(ctx, options.ackStatus, itemJson);
  if (ackStatus) headers["AckStatus"] = String(ackStatus);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
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
    if (response.status === 404) {
      throw new Error("SIGNL4: invalid credentials");
    }
    if (response.status === 400) {
      throw new Error("SIGNL4: request body was empty or missing");
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = parsed as Record<string, unknown> | undefined;
      const errMsg = obj?.error
        ? String(obj.error)
        : `SIGNL4 request failed with status code ${response.status}`;
      throw new Error(errMsg);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function resolveParam(ctx: ExecutionContext, raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = ctx.evaluate(raw, itemJson);
    return result;
  }
  return raw;
}
