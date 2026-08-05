import type { NodeExecutor } from "@/sdk";
import { sdkHttpRequest } from "@/sdk";

const API_BASE = "https://onesimpleapi.com/api";

interface OpMapping {
  endpoint: string;
  method: "GET" | "POST";
  paramMap: Record<string, string>;
}

const OP_MAP: Record<string, Record<string, OpMapping>> = {
  information: {
    exchangeRate: { endpoint: "/exchange_rate", method: "GET", paramMap: { value: "value", fromCurrency: "from", toCurrency: "to" } },
    imageMetadata: { endpoint: "/image_info", method: "GET", paramMap: { link: "url" } },
  },
  socialProfile: {
    instagramProfile: { endpoint: "/instagram_profile", method: "GET", paramMap: { profileName: "profile" } },
    spotifyArtistProfile: { endpoint: "/spotify_profile", method: "GET", paramMap: { artistName: "artist" } },
  },
  utility: {
    expandURL: { endpoint: "/unshorten", method: "GET", paramMap: { link: "url" } },
    qrCode: { endpoint: "/qr_code", method: "GET", paramMap: { message: "message" } },
    validateEmail: { endpoint: "/email", method: "GET", paramMap: { emailAddress: "email" } },
  },
  website: {
    pdf: { endpoint: "/pdf", method: "GET", paramMap: { link: "url" } },
    seo: { endpoint: "/page_info", method: "GET", paramMap: { link: "url" } },
    screenshot: { endpoint: "/screenshot", method: "GET", paramMap: { link: "url" } },
  },
};

function buildQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      qs.set(k, String(v));
    }
  }
  return qs.toString();
}

function collectParams(resource: string, operation: string, ctx: Parameters<NodeExecutor>[0], item: Record<string, unknown>): Record<string, unknown> {
  const mapping = OP_MAP[resource]?.[operation];
  if (!mapping) return {};

  const resolved: Record<string, unknown> = {};
  for (const [specParam, apiParam] of Object.entries(mapping.paramMap)) {
    const raw = ctx.getParam(specParam);
    if (raw === undefined || raw === null || raw === "") continue;
    const val = typeof raw === "string" && raw.startsWith("={{")
      ? ctx.evaluate(raw, item)
      : raw;
    if (val !== undefined && val !== null) {
      resolved[apiParam] = val;
    }
  }
  return resolved;
}

export const oneSimpleApiExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  if (items.length === 0) {
    return [[{ json: {} }]];
  }

  const resource = ctx.getParam<string>("resource", "information");
  const operation = ctx.getParam<string>("operation", "exchangeRate");
  const mapping = OP_MAP[resource]?.[operation];

  if (!mapping) {
    throw new Error(`One Simple API: unknown resource/operation combination "${resource}/${operation}"`);
  }

  const credential = await ctx.getCredential("oneSimpleApi");
  const apiToken =
    (credential?.apiToken as string) ??
    (credential?.apiKey as string) ??
    "";

  if (!apiToken) {
    throw new Error("One Simple API: credential apiToken/apiKey is required");
  }

  const options = ctx.getParam<Record<string, unknown>>("options", {});

  const results = await Promise.all(
    items.map(async (item, idx) => {
      const params = collectParams(resource, operation, ctx, item.json);

      const url = `${API_BASE}${mapping.endpoint}?${buildQueryString(params)}`;
      const headers: Record<string, string> = {
        Accept: "application/json",
        Authorization: `Bearer ${apiToken}`,
      };

      try {
        const response = await sdkHttpRequest({
          method: mapping.method,
          url,
          headers,
          timeoutMs: 30000,
        });

        if (response.status >= 400 && !ctx.continueOnFail()) {
          throw new Error(
            `One Simple API returned status ${response.status}: ${JSON.stringify(response.body)}`,
          );
        }

        if (ctx.continueOnFail() && response.status >= 400) {
          return {
            json: {
              ...item.json,
              error: `One Simple API returned status ${response.status}: ${JSON.stringify(response.body)}`,
            },
          };
        }

        return { json: response.body as Record<string, unknown> };
      } catch (err) {
        if (ctx.continueOnFail()) {
          return {
            json: {
              ...item.json,
              error: err instanceof Error ? err.message : String(err),
            },
          };
        }
        throw err;
      }
    }),
  );

  return [results];
};
