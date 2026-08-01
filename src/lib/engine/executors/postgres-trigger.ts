import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface PostgresTriggerParams {
  triggerMode: "createTrigger" | "listenTrigger";
  schema?: string;
  tableName?: string;
  insert?: boolean;
  update?: boolean;
  delete?: boolean;
  channelName?: string;
  additionalOptions?: {
    connectionTimeout?: number;
  };
}

interface CreateTriggerNotification {
  type: string;
  table: string;
  payload: Record<string, unknown>;
}

interface ListenTriggerNotification {
  channel: string;
  message: string;
}

/**
 * Postgres Trigger — processes inbound notifications from a Postgres LISTEN
 * channel into output items.
 *
 * The host (engine) manages the pg client lifecycle (connect, LISTEN,
 * UNLISTEN, close). On activation the host:
 *  - createTrigger mode: creates trigger function + trigger on table + LISTEN,
 *    then feeds each NOTIFY payload as an input item
 *  - listenTrigger mode: LISTENs on the configured channel, feeds each NOTIFY
 *    as an input item
 * On deactivation the host:
 *  - createTrigger mode: DROP TRIGGER + DROP FUNCTION + UNLISTEN + close
 *  - listenTrigger mode: UNLISTEN + close
 *
 * Gaps (documented TODOs):
 *  - Host-level pg connection lifecycle management (pool, SSL, SSH tunnel)
 *  - SQL object name generation (unique suffix per workflow)
 *  - `replaceIfExists` for DROP before CREATE
 *  - Parameter expression evaluation
 *  - Manual trigger mode (first notification then deactivate)
 */
export const postgresTriggerExecutor: NodeExecutor = async (ctx) => {
  const params = ctx.getParams() as unknown as PostgresTriggerParams;
  const triggerMode = params.triggerMode ?? "createTrigger";

  if (triggerMode === "createTrigger") {
    const tableName = params.tableName;
    if (!tableName) {
      throw new Error("Postgres Trigger: 'tableName' is required in createTrigger mode");
    }

    const inputItems = ctx.getInputItems(0);
    const out: INodeExecutionData[] = [];

    for (const item of inputItems) {
      const json = item.json as CreateTriggerNotification | undefined;
      if (json?.type && json.table) {
        out.push({
          json: {
            type: json.type,
            table: json.table,
            payload: json.payload ?? {},
          },
        });
      }
    }

    if (out.length === 0) {
      return [[{ json: {} }]];
    }
    return [out];
  }

  const channelName = params.channelName;
  if (!channelName) {
    throw new Error("Postgres Trigger: 'channelName' is required in listenTrigger mode");
  }

  const inputItems = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const json = item.json as ListenTriggerNotification | undefined;
    if (json?.channel) {
      out.push({
        json: {
          channel: json.channel,
          message: json.message ?? "",
        },
      });
    }
  }

  if (out.length === 0) {
    return [[{ json: {} }]];
  }
  return [out];
};
