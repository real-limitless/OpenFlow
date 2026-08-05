import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const BEEMINDER_API_BASE = "https://www.beeminder.com/api/v1";

export const beeminderToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "datapoint");
  const operation = ctx.getParam<string>("operation", "create");
  const continueOnFail = ctx.continueOnFail();

  const credential = await ctx.getCredential("beeminderApi");
  const authToken = credential?.accessToken ?? credential?.apiKey ?? "";
  let username = credential?.username ?? "";

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      const goalName = resolveParam(ctx, "goalName", item, i) as string | undefined;

      if (resource === "datapoint") {
        result = await handleDatapoint(operation, goalName, ctx, item, i, authToken, username);
      } else if (resource === "goal") {
        result = await handleGoal(operation, goalName, ctx, item, i, authToken, username);
      } else if (resource === "user" && operation === "get") {
        result = await handleUserGet(ctx, authToken, username);
      } else if (resource === "charge" && operation === "create") {
        result = await handleChargeCreate(ctx, authToken, username);
      } else {
        throw new Error(`Beeminder Tool: unsupported resource/operation combination: ${resource}/${operation}`);
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

async function handleDatapoint(
  operation: string,
  goalName: string | undefined,
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  _idx: number,
  authToken: string,
  _username: string,
): Promise<unknown> {
  if (operation === "getAll") {
    if (!goalName) throw new Error("Beeminder Tool: goalName is required for datapoint getAll");
    const returnAll = ctx.getParam<boolean>("returnAll", false);
    const limit = ctx.getParam<number>("limit", 20);
    const options = ctx.getParam<Record<string, unknown>>("options", {});
    const params = new URLSearchParams();
    if (options.sort) params.set("sort", String(options.sort));
    if (options.page) params.set("page", String(options.page));
    if (options.per) params.set("per", String(options.per));
    const count = returnAll ? 10000 : limit;
    params.set("count", String(count));
    return beeminderFetch(`/users/${encodeURIComponent(_username)}/goals/${encodeURIComponent(goalName)}/datapoints.json`, params, authToken);
  }

  if (operation === "get" || operation === "delete") {
    if (!goalName) throw new Error("Beeminder Tool: goalName is required");
    const datapointId = resolveParam(ctx, "datapointId", item, _idx) as string | undefined;
    if (!datapointId) throw new Error("Beeminder Tool: datapointId is required");
    const url = `/users/${encodeURIComponent(_username)}/goals/${encodeURIComponent(goalName)}/datapoints/${encodeURIComponent(datapointId)}.json`;
    if (operation === "delete") {
      return beeminderFetch(url, new URLSearchParams(), authToken, "DELETE");
    }
    return beeminderFetch(url, new URLSearchParams(), authToken);
  }

  if (operation === "create" || operation === "update") {
    if (!goalName) throw new Error("Beeminder Tool: goalName is required");
    const value = ctx.getParam<number>("value", 0);
    const comment = ctx.getParam<string>("comment", "");
    const timestamp = ctx.getParam<string>("timestamp", "");
    const requestid = ctx.getParam<string>("requestid", "");
    const body: Record<string, unknown> = {};
    if (value !== undefined) body.value = value;
    if (comment) body.comment = comment;
    if (timestamp) body.timestamp = timestamp;
    if (requestid && operation === "create") body.requestid = requestid;

    const updateFields = ctx.getParam<Record<string, unknown>>("updateFields", {});
    if (operation === "update" && updateFields) {
      if (updateFields.value !== undefined) body.value = updateFields.value;
      if (updateFields.comment) body.comment = updateFields.comment;
      if (updateFields.timestamp) body.timestamp = updateFields.timestamp;
    }

    const datapointId = resolveParam(ctx, "datapointId", item, _idx) as string | undefined;

    if (operation === "update") {
      if (!datapointId) throw new Error("Beeminder Tool: datapointId is required for update");
      const url = `/users/${encodeURIComponent(_username)}/goals/${encodeURIComponent(goalName)}/datapoints/${encodeURIComponent(datapointId)}.json`;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== "") params.set(k, String(v));
      }
      return beeminderPost(url, params, authToken);
    }

    const url = `/users/${encodeURIComponent(_username)}/goals/${encodeURIComponent(goalName)}/datapoints.json`;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    return beeminderPost(url, params, authToken);
  }

  if (operation === "createAll") {
    const datapointsRaw = ctx.getParam<string>("datapoints", "[]");
    const datapoints = typeof datapointsRaw === "string" ? JSON.parse(datapointsRaw) : datapointsRaw;
    if (!Array.isArray(datapoints)) throw new Error("Beeminder Tool: datapoints must be an array");
    if (!goalName) throw new Error("Beeminder Tool: goalName is required for createAll");
    const params = new URLSearchParams();
    for (const dp of datapoints) {
      params.append("datapoints[]", JSON.stringify(dp));
    }
    return beeminderPost(`/users/${encodeURIComponent(_username)}/goals/${encodeURIComponent(goalName)}/datapoints.json`, params, authToken);
  }

  throw new Error(`Beeminder Tool: unsupported datapoint operation: ${operation}`);
}

async function handleGoal(
  operation: string,
  goalName: string | undefined,
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  _idx: number,
  authToken: string,
  _username: string,
): Promise<unknown> {
  if (operation === "getAll" || operation === "getArchived") {
    const emaciated = ctx.getParam<boolean>("emaciated", false);
    const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});
    const params = new URLSearchParams();
    if (emaciated || additionalFields.emaciated) params.set("emaciated", "true");
    return beeminderFetch(`/users/${encodeURIComponent(_username)}/goals.json`, params, authToken);
  }

  if (operation === "get") {
    if (!goalName) throw new Error("Beeminder Tool: goalName is required");
    const emaciated = ctx.getParam<boolean>("emaciated", false);
    const includeDps = ctx.getParam<boolean>("datapoints", false);
    const params = new URLSearchParams();
    if (emaciated) params.set("emaciated", "true");
    if (includeDps) params.set("datapoints", "true");
    return beeminderFetch(`/users/${encodeURIComponent(_username)}/goals/${encodeURIComponent(goalName)}.json`, params, authToken);
  }

  if (operation === "create") {
    const slug = ctx.getParam<string>("slug", "");
    const title = ctx.getParam<string>("title", "");
    const goalType = ctx.getParam<string>("goal_type", "");
    const gunits = ctx.getParam<string>("gunits", "");
    const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});
    if (!slug) throw new Error("Beeminder Tool: slug is required for goal create");
    const params = new URLSearchParams();
    params.set("slug", slug);
    if (title) params.set("title", title);
    if (goalType) params.set("goal_type", goalType);
    if (gunits) params.set("gunits", gunits);
    for (const [k, v] of Object.entries(additionalFields)) {
      if (v !== undefined && v !== false) params.set(k, String(v));
    }
    return beeminderPost(`/users/${encodeURIComponent(_username)}/goals.json`, params, authToken);
  }

  if (operation === "update") {
    if (!goalName) throw new Error("Beeminder Tool: goalName is required");
    const updateFields = ctx.getParam<Record<string, unknown>>("updateFields", {});
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(updateFields)) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    return beeminderPost(`/users/${encodeURIComponent(_username)}/goals/${encodeURIComponent(goalName)}.json`, params, authToken);
  }

  if (operation === "refresh" || operation === "shortCircuit" || operation === "stepDown" || operation === "cancelStepDown" || operation === "uncle" || operation === "ratchet") {
    if (!goalName) throw new Error(`Beeminder Tool: goalName is required for ${operation}`);
    const actionMap: Record<string, string> = {
      refresh: "refresh",
      shortCircuit: "short_circuit",
      stepDown: "step_down",
      cancelStepDown: "cancel_step_down",
      uncle: "uncle",
      ratchet: "ratchet",
    };
    return beeminderPost(`/users/${encodeURIComponent(_username)}/goals/${encodeURIComponent(goalName)}/${actionMap[operation]}.json`, new URLSearchParams(), authToken);
  }

  throw new Error(`Beeminder Tool: unsupported goal operation: ${operation}`);
}

async function handleUserGet(
  ctx: Parameters<NodeExecutor>[0],
  authToken: string,
  _username: string,
): Promise<unknown> {
  const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});
  const params = new URLSearchParams();
  if (additionalFields.associations) params.set("associations", "true");
  if (additionalFields.diff_since) params.set("diff_since", String(additionalFields.diff_since));
  if (additionalFields.skinny) params.set("skinny", "true");
  if (additionalFields.emaciated) params.set("emaciated", "true");
  if (additionalFields.datapoints_count) params.set("datapoints_count", String(additionalFields.datapoints_count));
  return beeminderFetch(`/users/${encodeURIComponent(_username)}.json`, params, authToken);
}

async function handleChargeCreate(
  ctx: Parameters<NodeExecutor>[0],
  authToken: string,
  _username: string,
): Promise<unknown> {
  const amount = ctx.getParam<number>("amount", 0);
  const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});
  if (!amount || amount <= 0) throw new Error("Beeminder Tool: amount is required for charge create");
  const params = new URLSearchParams();
  params.set("amount", String(amount));
  if (additionalFields.note) params.set("note", String(additionalFields.note));
  if (additionalFields.dryrun) params.set("dryrun", "true");
  return beeminderPost(`/users/${encodeURIComponent(_username)}/charges.json`, params, authToken);
}

function resolveParam(
  ctx: Parameters<NodeExecutor>[0],
  name: string,
  item: INodeExecutionData,
  _idx: number,
): unknown {
  const raw = ctx.getParam(name);
  if (typeof raw === "string" && raw.startsWith("={{") && raw.endsWith("}}")) {
    return ctx.evaluate(raw, item.json);
  }
  return raw;
}

async function beeminderFetch(
  path: string,
  params: URLSearchParams,
  authToken: string,
  method = "GET",
): Promise<unknown> {
  let url = `${BEEMINDER_API_BASE}${path}`;
  params.set("auth_token", authToken);
  url += `?${params.toString()}`;
  const res = await fetch(url, {
    method,
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Beeminder API: HTTP ${res.status} ${res.statusText ?? ""}${text ? ` — ${text}` : ""}`);
  }
  return res.json();
}

async function beeminderPost(
  path: string,
  params: URLSearchParams,
  authToken: string,
): Promise<unknown> {
  const url = `${BEEMINDER_API_BASE}${path}`;
  params.set("auth_token", authToken);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Beeminder API: HTTP ${res.status} ${res.statusText ?? ""}${text ? ` — ${text}` : ""}`);
  }
  return res.json();
}
