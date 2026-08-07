import type { NodeExecutor, INodeExecutionData, INode } from "@/sdk";
import { requireCredential } from "@/sdk/helpers/credentials";

const BASE_URL = "https://api.phantombuster.com/api/v2";

function collectKvPairs(ui: unknown): Record<string, string> {
  if (!ui || typeof ui !== "object") return {};
  const container = ui as Record<string, unknown>;
  const values = container.argumentValues as Array<Record<string, string>> | undefined;
  if (!Array.isArray(values)) return {};
  const out: Record<string, string> = {};
  for (const v of values) {
    if (v.key) out[v.key] = v.value;
  }
  return out;
}

async function apiFetch(
  url: string,
  opts: { method?: string; body?: unknown; apiKey: string },
): Promise<unknown> {
  const headers: Record<string, string> = {
    "X-Phantombuster-Key": opts.apiKey,
    accept: "application/json",
  };
  if (opts.body) {
    headers["content-type"] = "application/json";
  }
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `PhantomBuster API: HTTP ${res.status}${errorBody ? ` - ${errorBody}` : ""}`,
    );
  }
  return res.json();
}

export const phantombusterToolExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const operation = ctx.getParam<string>("operation", "launch");
  const continueOnFail = ctx.continueOnFail();

  const cred = await requireCredential(ctx, "phantombusterApi");
  const apiKey = (cred as Record<string, string>)?.apiKey;
  if (!apiKey) {
    throw new Error("PhantomBuster: API key is missing from credential");
  }

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      switch (operation) {
        case "delete": {
          const agentId = ctx.getParam<string>("agentId", "");
          if (!agentId) throw new Error("PhantomBuster: agentId is required for delete");
          await apiFetch(`${BASE_URL}/agents/delete`, {
            method: "POST",
            body: { id: agentId },
            apiKey,
          });
          result = { success: true };
          break;
        }
        case "get": {
          const agentId = ctx.getParam<string>("agentId", "");
          if (!agentId) throw new Error("PhantomBuster: agentId is required for get");
          result = await apiFetch(`${BASE_URL}/agents/fetch?id=${encodeURIComponent(agentId)}`, {
            apiKey,
          });
          break;
        }
        case "getAll": {
          const raw = (await apiFetch(`${BASE_URL}/agents/fetch-all`, {
            apiKey,
          })) as unknown[];
          const returnAll = ctx.getParam<boolean>("returnAll", false);
          if (returnAll) {
            result = raw;
          } else {
            const limit = ctx.getParam<number>("limit", 25);
            result = raw.slice(0, limit);
          }
          break;
        }
        case "getOutput": {
          const agentId = ctx.getParam<string>("agentId", "");
          if (!agentId) throw new Error("PhantomBuster: agentId is required for getOutput");
          const resolveData = ctx.getParam<boolean>("resolveData", true);
          const prevContainerId = ctx.getParam<string>("prevContainerId", "");
          const prevStatus = ctx.getParam<string>("prevStatus", "");
          const prevRuntimeEventIndex = ctx.getParam<number>("prevRuntimeEventIndex", 0);
          let url = `${BASE_URL}/agents/fetch-output?id=${encodeURIComponent(agentId)}`;
          if (prevContainerId) url += `&prevContainerId=${encodeURIComponent(prevContainerId)}`;
          if (prevStatus) url += `&prevStatus=${encodeURIComponent(prevStatus)}`;
          if (prevRuntimeEventIndex) url += `&prevRuntimeEventIndex=${prevRuntimeEventIndex}`;
          const output = await apiFetch(url, { apiKey });
          if (resolveData) {
            const containerId = (output as Record<string, unknown>)?.containerId;
            if (containerId) {
              result = await apiFetch(
                `${BASE_URL}/containers/fetch-result-object?id=${encodeURIComponent(String(containerId))}`,
                { apiKey },
              );
            } else {
              result = {};
            }
          } else {
            result = output;
          }
          break;
        }
        case "launch": {
          const agentId = ctx.getParam<string>("agentId", "");
          if (!agentId) throw new Error("PhantomBuster: agentId is required for launch");
          const resolveData = ctx.getParam<boolean>("resolveData", true);
          const jsonParameters = ctx.getParam<boolean>("jsonParameters", false);
          const body: Record<string, unknown> = { id: agentId };
          body.manualLaunch = ctx.getParam<boolean>("manualLaunch", false);
          const maxInstanceCount = ctx.getParam<number>("maxInstanceCount", 0);
          if (maxInstanceCount) body.maxInstanceCount = maxInstanceCount;
          const saveArgument = ctx.getParam<string>("saveArgument", "");
          if (saveArgument) body.saveArgument = saveArgument;
          if (jsonParameters) {
            const argsJson = ctx.getParam<string>("argumentsJson", "");
            const bonusJson = ctx.getParam<string>("bonusArgumentJson", "");
            if (argsJson) {
              try { body.arguments = JSON.parse(argsJson); } catch { body.arguments = argsJson; }
            }
            if (bonusJson) {
              try { body.bonusArgument = JSON.parse(bonusJson); } catch { body.bonusArgument = bonusJson; }
            }
          } else {
            const argsUi = collectKvPairs(ctx.getParam("argumentsUi"));
            const bonusUi = collectKvPairs(ctx.getParam("bonusArgumentUi"));
            if (Object.keys(argsUi).length > 0) body.arguments = argsUi;
            if (Object.keys(bonusUi).length > 0) body.bonusArgument = bonusUi;
          }
          const launchResult = (await apiFetch(`${BASE_URL}/agents/launch`, {
            method: "POST",
            body,
            apiKey,
          })) as Record<string, unknown>;
          if (resolveData && launchResult.containerId) {
            result = await apiFetch(
              `${BASE_URL}/containers/fetch?id=${encodeURIComponent(String(launchResult.containerId))}`,
              { apiKey },
            );
          } else {
            result = launchResult;
          }
          break;
        }
        default:
          throw new Error(`PhantomBuster: unsupported operation "${operation}"`);
      }

      out.push({
        json: result as Record<string, unknown>,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};
