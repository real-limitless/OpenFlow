import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface GetResponseCredential {
  apiKey?: string;
  access_token?: string;
  oauthTokenData?: { access_token?: string };
}

export const getResponseExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const apiCred = await ctx.getCredential("getResponseApi") as GetResponseCredential | null;
  const oauthCred = await ctx.getCredential("getResponseOAuth2Api") as GetResponseCredential | null;
  const apiKey = apiCred?.apiKey ?? "";
  const oauthToken = oauthCred?.access_token ?? oauthCred?.oauthTokenData?.access_token ?? "";

  const operation = String(ctx.getParam("operation") ?? "Create");
  const resource = String(ctx.getParam("resource") ?? "Contact");

  if (resource !== "Contact") {
    throw new Error("GetResponse: only Contact resource is supported");
  }

  const baseUrl = "https://api.getresponse.com/v3";

  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (oauthToken) {
      headers["Authorization"] = `Bearer ${oauthToken}`;
    } else if (apiKey) {
      headers["X-Auth-Token"] = `api-key ${apiKey}`;
    }
    return headers;
  }

  async function apiCall(
    method: string,
    endpoint: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        method,
        headers: buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* keep as text */
      }
      if (res.status < 200 || res.status >= 300) {
        const obj = parsed as Record<string, unknown> | null;
        const msg =
          (obj?.message as string) ??
          (obj?.httpStatus as string) ??
          `HTTP ${res.status}`;
        throw new Error(`GetResponse: ${msg}`);
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: unknown;

      switch (operation) {
        case "Create": {
          const email = String(ctx.getParam("email") ?? "");
          const campaignId = String(ctx.getParam("campaignId") ?? "");
          if (!email) throw new Error("GetResponse: email is required for Create");
          if (!campaignId)
            throw new Error("GetResponse: campaignId is required for Create");

          const body: Record<string, unknown> = {
            email,
            campaign: { campaignId },
          };
          const name = ctx.getParam("name");
          if (name) body.name = name;
          const dayOfCycle = ctx.getParam("dayOfCycle");
          if (dayOfCycle != null) body.dayOfCycle = dayOfCycle;
          const source = ctx.getParam("source");
          if (source) body.source = source;
          const tags = ctx.getParam("tags");
          if (tags) body.tags = tags;
          const customFieldValues = ctx.getParam("customFieldValues");
          if (customFieldValues) body.customFieldValues = customFieldValues;
          const ipAddress = ctx.getParam("ipAddress");
          if (ipAddress) body.ipAddress = ipAddress;
          const timeZone = ctx.getParam("timeZone");
          if (timeZone) body.timeZone = timeZone;

          result = await apiCall("POST", "/contacts", body);
          break;
        }

        case "Get": {
          const contactId = ctx.getParam<string>("contactId");
          const email = ctx.getParam<string>("email");
          if (contactId) {
            result = await apiCall("GET", `/contacts/${contactId}`);
          } else if (email) {
            const raw = await apiCall("GET", `/contacts?query[email]=${encodeURIComponent(email)}`);
            const list = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.contacts as Array<Record<string, unknown>> ?? []);
            result = list[0] ?? null;
            if (!result) throw new Error("GetResponse: contact not found");
          } else {
            throw new Error("GetResponse: contactId or email is required for Get");
          }
          break;
        }

        case "GetAll": {
          const returnAll = ctx.getParam<boolean>("returnAll") ?? false;
          const limit = ctx.getParam<number>("limit") ?? 100;
          const maxPerPage = returnAll ? 100 : limit;
          const queryParams = new URLSearchParams();
          queryParams.set("perPage", String(maxPerPage));
          const options = ctx.getParam<Record<string, unknown>>("options") ?? {};
          if (options.sortBy) queryParams.set("sort[createdOn]", String(options.sortBy));
          let page = 1;
          let collected: Array<Record<string, unknown>> = [];
          while (true) {
            const qs = new URLSearchParams(queryParams);
            qs.set("page", String(page));
            const endpoint = `/contacts?${qs.toString()}`;
            const raw = await apiCall("GET", endpoint);
            const contacts = Array.isArray(raw)
              ? raw as Array<Record<string, unknown>>
              : ((raw as Record<string, unknown>)?.contacts as Array<Record<string, unknown>> ?? []);
            if (contacts.length === 0) break;
            collected.push(...contacts);
            if (!returnAll) break;
            if (contacts.length < maxPerPage) break;
            page++;
          }
          if (!returnAll) collected = collected.slice(0, limit);
          for (const c of collected) {
            out.push({ json: c, pairedItem });
          }
          continue;
        }

        case "Update": {
          const contactId = ctx.getParam<string>("contactId");
          const email = ctx.getParam<string>("email");
          let id = contactId;
          if (!id && email) {
            const raw = await apiCall("GET", `/contacts?query[email]=${encodeURIComponent(email)}`);
            const list = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.contacts as Array<Record<string, unknown>> ?? []);
            if (list.length === 0) throw new Error("GetResponse: contact not found");
            id = String(list[0].contactId ?? "");
          }
          if (!id) throw new Error("GetResponse: contactId or email is required for Update");

          const updateBody: Record<string, unknown> = {};
          const name = ctx.getParam("name");
          if (name) updateBody.name = name;
          const campaignId = ctx.getParam("campaignId");
          if (campaignId) updateBody.campaign = { campaignId };
          const addTags = ctx.getParam("addTags");
          if (addTags) updateBody.addTags = addTags;
          const removeTags = ctx.getParam("removeTags");
          if (removeTags) updateBody.removeTags = removeTags;
          const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields") ?? {};
          for (const [k, v] of Object.entries(additionalFields)) {
            updateBody[k] = v;
          }
          const customFieldValues = ctx.getParam("customFieldValues");
          if (customFieldValues) updateBody.customFieldValues = customFieldValues;

          result = await apiCall("POST", `/contacts/${id}`, updateBody);
          break;
        }

        case "Delete": {
          const delContactId = ctx.getParam<string>("contactId");
          const delEmail = ctx.getParam<string>("email");
          let delId = delContactId;
          if (!delId && delEmail) {
            const raw = await apiCall("GET", `/contacts?query[email]=${encodeURIComponent(delEmail)}`);
            const list = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.contacts as Array<Record<string, unknown>> ?? []);
            if (list.length === 0) throw new Error("GetResponse: contact not found");
            delId = String(list[0].contactId ?? "");
          }
          if (!delId) throw new Error("GetResponse: contactId or email is required for Delete");
          await apiCall("DELETE", `/contacts/${delId}`);
          result = { success: true };
          break;
        }

        default:
          throw new Error(`GetResponse: unknown operation "${operation}"`);
      }

      out.push({
        json: (result as Record<string, unknown>) ?? {},
        pairedItem,
      });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};
