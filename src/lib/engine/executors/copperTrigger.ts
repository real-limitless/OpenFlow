import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const ENTITY_TYPES = [
  "lead",
  "person",
  "company",
  "opportunity",
  "project",
  "task",
  "activity_log",
] as const;

const EVENT_MAP: Record<string, string> = {
  New: "new",
  Update: "update",
  Delete: "delete",
};

export const copperTriggerExecutor: NodeExecutor = async (ctx) => {
  const mode = ctx.getParam("mode") as string | undefined;

  if (mode === "activate") {
    const events = (ctx.getParam("events") as string[]) ?? ["New", "Update", "Delete"];
    const additionalOptions = ctx.getParam("additionalOptions") as Record<string, unknown> | undefined;
    const callbackUrl = ctx.getParam("callbackUrl") as string | undefined;
    const credential = await ctx.getCredential("copperApi");
    if (!credential) {
      throw new Error("Copper API credential is required");
    }
    const apiKey = credential.apiKey as string;
    const email = credential.email as string;
    const headers: Record<string, string> = {
      "X-PW-AccessToken": apiKey,
      "X-PW-Application": email,
      "Content-Type": "application/json",
    };
    const subscriptionIds: number[] = [];
    const selectedEvents = events.map((e) => EVENT_MAP[e]).filter(Boolean);
    for (const event of selectedEvents) {
      for (const entity of ENTITY_TYPES) {
        if (entity === "activity_log" && selectedEvents.length === 0) continue;
        const body: Record<string, unknown> = {
          type: entity,
          event,
          target: callbackUrl ?? "",
        };
        if (additionalOptions?.customFieldsAsValues) {
          body.custom_field_computed_values = true;
        }
        if (additionalOptions?.secret) {
          const secretVal = additionalOptions.secret as Record<string, unknown>;
          if (secretVal.values) {
            const entries = secretVal.values as Array<Record<string, string>>;
            for (const entry of entries) {
              if (entry.key) body[entry.key] = entry.value;
            }
          }
        }
        if (additionalOptions?.headers) {
          const headerVal = additionalOptions.headers as Record<string, unknown>;
          if (headerVal.values) {
            const entries = headerVal.values as Array<Record<string, string>>;
            const extraHeaders: Record<string, string> = {};
            for (const entry of entries) {
              if (entry.name) extraHeaders[entry.name] = entry.value;
            }
            if (Object.keys(extraHeaders).length > 0) {
              body.headers = extraHeaders;
            }
          }
        }
        const res = await fetch("https://api.copper.com/developer_api/v1/webhooks/subscription", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`Copper subscription creation failed: ${res.status} ${res.statusText}`);
        }
        const data = await res.json() as { id: number };
        subscriptionIds.push(data.id);
      }
    }
    return [[{ json: { subscriptionIds } }]];
  }

  if (mode === "deactivate") {
    const subs = ctx.getParam("subscriptionIds") as number[] | undefined;
    const credential = await ctx.getCredential("copperApi");
    if (credential) {
      const apiKey = credential.apiKey as string;
      const email = credential.email as string;
      const headers: Record<string, string> = {
        "X-PW-AccessToken": apiKey,
        "X-PW-Application": email,
      };
      if (subs) {
        for (const id of subs) {
          try {
            await fetch(`https://api.copper.com/developer_api/v1/webhooks/subscription/${id}`, {
              method: "DELETE",
              headers,
            });
          } catch (e) {
            console.error(`Failed to delete Copper subscription ${id}:`, e);
          }
        }
      }
    }
    return [[]];
  }

  const items = ctx.getInputItems(0);
  const out: INodeExecutionData[] = items.map((item) => ({
    json: item.json as Record<string, unknown>,
  }));
  return [out];
};
