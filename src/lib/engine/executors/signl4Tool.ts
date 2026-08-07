import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://connect.signl4.com/webhook";

export const signl4ToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("signl4Api");
  if (!cred) throw new Error("SIGNL4 Tool: signl4Api credential is required");
  const teamSecret = String((cred as Record<string, unknown>).teamSecret ?? "");
  if (!teamSecret) throw new Error("SIGNL4 Tool: teamSecret is missing in credential");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = (item.json ?? {}) as Record<string, unknown>;
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
      const message = resolveParam(ctx, parameters.message, itemJson);
      if (message) body.message = String(message);

      const additionalFields = (parameters.additionalFields as Record<string, unknown>) ?? {};

      const title = resolveParam(ctx, additionalFields.title, itemJson);
      if (title) body.title = String(title);

      const service = resolveParam(ctx, additionalFields.service, itemJson);
      if (service) headers["X-S4-Service"] = String(service);

      const alertingScenario = additionalFields.alertingScenario ?? "single_ack";
      headers["X-S4-AlertingScenario"] = String(alertingScenario);

      const externalId = resolveParam(ctx, additionalFields.externalId, itemJson);
      if (externalId) headers["X-S4-ExternalID"] = String(externalId);

      const filtering = additionalFields.filtering;
      if (filtering !== undefined && filtering !== null) {
        headers["X-S4-Filtering"] = String(filtering);
      }

      const locationFieldsUi = additionalFields.locationFieldsUi as Record<string, unknown> | undefined;
      if (locationFieldsUi) {
        const locationValues = locationFieldsUi.locationFieldsValues as Array<Record<string, unknown>> | undefined;
        if (locationValues && locationValues.length > 0) {
          const lat = resolveParam(ctx, locationValues[0].latitude, itemJson);
          const lng = resolveParam(ctx, locationValues[0].longitude, itemJson);
          if (lat !== undefined && lng !== undefined) {
            headers["X-S4-Location"] = `${lat},${lng}`;
          }
        }
      }
    } else if (operation === "resolve") {
      const externalId = resolveParam(ctx, parameters.externalId, itemJson);
      if (!externalId) throw new Error("SIGNL4 Tool: externalId is required for resolve operation");
      headers["X-S4-ExternalID"] = String(externalId);
      headers["X-S4-Status"] = "resolved";
    }
  }

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
      throw new Error("SIGNL4 Tool: invalid credentials");
    }
    if (response.status === 400) {
      throw new Error("SIGNL4 Tool: request body was empty or missing");
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = parsed as Record<string, unknown> | undefined;
      const errMsg = obj?.error
        ? String(obj.error)
        : `SIGNL4 Tool request failed with status code ${response.status}`;
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
    return ctx.evaluate(raw, itemJson);
  }
  return raw;
}
