import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const BITLY_API_BASE = "https://api-ssl.bitly.com/v4";

export const bitlyToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "Link");
  const operation = ctx.getParam<string>("operation", "Create");
  const continueOnFail = ctx.continueOnFail();

  const authentication = ctx.getParam<string>("authentication", "accessToken");
  const credName = authentication === "oAuth2" ? "bitlyOAuth2Api" : "bitlyApi";
  const credential = await ctx.getCredential(credName);
  const accessToken: string | undefined =
    credential?.data?.accessToken ??
    credential?.data?.access_token;

  if (!accessToken) {
    throw new Error("BitlyTool: no access token found in credentials");
  }

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      if (resource === "Link" && operation === "Create") {
        const longUrl = ctx.getParam<string>("longUrl", "");
        if (!longUrl || longUrl.trim() === "") {
          throw new Error("BitlyTool: longUrl is required for Create");
        }
        const body: Record<string, unknown> = { long_url: longUrl };
        const domain = ctx.getParam<string>("domain", "");
        if (domain) body.domain = domain;
        const group = ctx.getParam<string>("group", "");
        if (group) body.group_guid = group;
        const tags = ctx.getParam<string[]>("tags", []);
        if (tags.length > 0) body.tags = tags;
        const title = ctx.getParam<string>("title", "");
        if (title) body.title = title;
        const deeplinks = ctx.getParam<unknown[]>("deeplinks", []);
        if (deeplinks.length > 0) {
          body.deeplinks = deeplinks.map((dl: unknown) => {
            const entry = dl as Record<string, unknown>;
            return {
              app_id: entry.appId,
              app_uri_path: entry.appUriPath,
              install_type: entry.installType,
              install_url: entry.installUrl,
            };
          });
        }

        result = await bitlyFetch("/shorten", accessToken, "POST", body);
      } else if (resource === "Link" && operation === "Get") {
        const id = ctx.getParam<string>("id", "");
        if (!id || id.trim() === "") {
          throw new Error("BitlyTool: id is required for Get");
        }
        result = await bitlyFetch(`/bitlinks/${encodeURIComponent(id)}`, accessToken);
      } else if (resource === "Link" && operation === "Update") {
        const id = ctx.getParam<string>("id", "");
        if (!id || id.trim() === "") {
          throw new Error("BitlyTool: id is required for Update");
        }
        const body: Record<string, unknown> = {};
        const archived = ctx.getParam<boolean>("archived", undefined);
        if (archived !== undefined) body.archived = archived;
        const tags = ctx.getParam<string[]>("tags", []);
        if (tags.length > 0) body.tags = tags;
        const title = ctx.getParam<string>("title", "");
        if (title) body.title = title;
        const longUrl = ctx.getParam<string>("longUrl", "");
        if (longUrl) body.long_url = longUrl;
        const group = ctx.getParam<string>("group", "");
        if (group) body.group_guid = group;
        const deeplinks = ctx.getParam<unknown[]>("deeplinks", []);
        if (deeplinks.length > 0) {
          body.deeplinks = deeplinks.map((dl: unknown) => {
            const entry = dl as Record<string, unknown>;
            return {
              app_id: entry.appId,
              app_uri_path: entry.appUriPath,
              install_type: entry.installType,
              install_url: entry.installUrl,
            };
          });
        }

        result = await bitlyFetch(
          `/bitlinks/${encodeURIComponent(id)}`,
          accessToken,
          "PATCH",
          body,
        );
      } else {
        throw new Error(
          `BitlyTool: unsupported resource/operation combination: ${resource}/${operation}`,
        );
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

async function bitlyFetch(
  path: string,
  token: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${BITLY_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  const opts: RequestInit = { method, headers };
  if (body) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Bitly API: HTTP ${res.status} ${res.statusText ?? ""} ${text}`.trim(),
    );
  }
  return (await res.json()) as Record<string, unknown>;
}
