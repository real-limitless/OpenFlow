import type { NodeExecutor, INodeExecutionData } from "@/sdk";

function tryParseBody(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object") return body as Record<string, unknown>;
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return { raw: body };
    }
  }
  return { raw: String(body ?? "") };
}

export const awsSnsTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const jsonParseBody = ctx.getParam<boolean>("jsonParseBody", true);
  const onlyMessage = ctx.getParam<boolean>("onlyMessage", false);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const rawBody = item.json?.body ?? item.json;
    const envelope = tryParseBody(rawBody);

    let outputJson: Record<string, unknown>;

    if (onlyMessage) {
      const msg = envelope.Message ?? envelope.message ?? "";
      if (jsonParseBody && typeof msg === "string") {
        try {
          outputJson = JSON.parse(msg) as Record<string, unknown>;
        } catch {
          outputJson = { message: msg } as unknown as Record<string, unknown>;
        }
      } else {
        outputJson = { message: msg } as unknown as Record<string, unknown>;
      }
    } else {
      outputJson = { ...envelope };
      if (jsonParseBody && typeof outputJson.Message === "string") {
        try {
          outputJson.Message = JSON.parse(outputJson.Message as string);
        } catch {
        }
      }
    }

    out.push({ json: outputJson, binary: item.binary ?? {} });
  }

  return [out];
};
