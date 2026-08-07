import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface TheHiveWebhookEvent {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  webhookId?: string;
}

export const theHiveProjectTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const event = (item.json ?? {}) as TheHiveWebhookEvent;

    // Reject unparseable payloads — if we can't read the body, discard
    if (event.body === undefined || event.body === null) {
      const workflow = ctx.getWorkflow();
      console.warn(
        `[${workflow.name ?? "unknown"}] theHiveProjectTrigger: discarded event with null/undefined body`,
      );
      continue;
    }

    const body = typeof event.body === "string"
      ? tryParseJson(event.body)
      : event.body;

    if (body === undefined) {
      const workflow = ctx.getWorkflow();
      console.warn(
        `[${workflow.name ?? "unknown"}] theHiveProjectTrigger: discarded event with unparseable body`,
      );
      continue;
    }

    out.push({
      json: {
        body,
        headers: event.headers ?? {},
        query: event.query ?? {},
        webhookId: event.webhookId ?? "",
      },
    });
  }

  if (out.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};

function tryParseJson(raw: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
