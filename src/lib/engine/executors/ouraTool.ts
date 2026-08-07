import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { requireCredential } from "@/sdk/helpers/credentials";

const BASE_URL = "https://api.ouraring.com/v2/usercollection";
const RESOURCE_PATHS: Record<string, Record<string, string>> = {
  profile: {
    get: "/personal_info",
  },
  summary: {
    getActivity: "/daily_activity",
    getReadiness: "/daily_readiness",
    getSleep: "/daily_sleep",
  },
};

export const ouraExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "profile");
  const operation = ctx.getParam<string>("operation", "get");
  const continueOnFail = ctx.continueOnFail();

  const resourceMap = RESOURCE_PATHS[resource];
  if (!resourceMap) {
    throw new Error(`Oura: unknown resource "${resource}"`);
  }
  const path = resourceMap[operation];
  if (!path) {
    throw new Error(`Oura: unknown operation "${operation}" for resource "${resource}"`);
  }

  const out: INodeExecutionData[] = [];

  try {
    const cred = await requireCredential(ctx, "ouraApi");
    const accessToken = (cred as Record<string, string>)?.accessToken;
    if (!accessToken) {
      throw new Error("Oura: accessToken is missing from credential");
    }

    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(
        `Oura API: HTTP ${res.status}${errorBody ? ` - ${errorBody}` : ""}`,
      );
    }

    const data = (await res.json()) as Record<string, unknown>;
    for (let i = 0; i < items.length; i++) {
      out.push({
        json: data,
        pairedItem: items[i].pairedItem ?? { item: i, input: 0 },
      });
    }
  } catch (err) {
    if (continueOnFail) {
      for (let i = 0; i < items.length; i++) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: items[i].pairedItem ?? { item: i, input: 0 },
        });
      }
    } else {
      throw err;
    }
  }

  return [out];
};
