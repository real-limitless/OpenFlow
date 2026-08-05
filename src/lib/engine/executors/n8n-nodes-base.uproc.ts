import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

interface ToolParam {
  name: string;
  value: unknown;
}

function buildToolParams(
  getParam: (name: string, defaultVal?: unknown) => unknown,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const knownParams = [
    "email", "domain", "phone_number", "first_name", "last_name",
    "company_name", "address_1", "address_2", "number", "standard",
    "birth_date", "ean", "password", "text", "language", "amount",
    "from_currency", "to_currency", "exchange_date", "ip",
  ];
  const params: Record<string, unknown> = {};
  for (const key of knownParams) {
    const val = getParam(key);
    if (val !== undefined && val !== null && val !== "") {
      params[key] = val;
    } else if (itemJson[key] !== undefined) {
      params[key] = itemJson[key];
    }
  }
  return params;
}

export const uprocExecutor: NodeExecutor = async (ctx, _node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const group = ctx.getParam<string>("group", "communication");
  const tool = ctx.getParam<string>("tool", "");
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("uProcApi");

  if (!credentials) {
    throw new Error("uProcApi credential is not configured");
  }

  const auth = credentials as { email?: string; apiKey?: string };
  if (!auth.email || !auth.apiKey) {
    throw new Error("uProcApi credential requires both email and apiKey");
  }

  const outputs: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      const toolParams = buildToolParams(ctx.getParam.bind(ctx), item.json);

      const encoded = Buffer.from(`${auth.email}:${auth.apiKey}`).toString("base64");
      const response = await fetch("https://api.uproc.io/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${encoded}`,
        },
        body: JSON.stringify({ tool, group, ...toolParams }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`uProc API error ${response.status}: ${errorText}`);
      }

      const responseData: unknown = await response.json();
      const result: unknown =
        responseData && typeof responseData === "object" && !Array.isArray(responseData)
          ? (responseData as Record<string, unknown>).data ?? responseData
          : responseData;

      outputs.push({
        json: { ...item.json, result },
        binary: item.binary,
        pairedItem: { item: i, input: 0 },
      });
    } catch (error) {
      if (continueOnFail) {
        outputs.push({
          json: { ...items[i].json, _error: String(error), result: null },
          binary: items[i].binary,
          pairedItem: { item: i, input: 0 },
        });
      } else {
        throw error;
      }
    }
  }

  return [outputs];
};
