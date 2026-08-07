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
    currencyConversion: { endpoint: "/exchange_rate", method: "GET", paramMap: { amount: "value", fromCurrency: "from", toCurrency: "to" } },
    imageMetadata: { endpoint: "/image_info", method: "GET", paramMap: { imageUrl: "url" } },
  },
  socialProfile: {
    instagramProfile: { endpoint: "/instagram_profile", method: "GET", paramMap: { instagramUsername: "profile" } },
    spotifyArtist: { endpoint: "/spotify_profile", method: "GET", paramMap: { spotifyArtistId: "artist" } },
  },
  utility: {
    expandUrl: { endpoint: "/unshorten", method: "GET", paramMap: { shortUrl: "url" } },
    qrCode: { endpoint: "/qr_code", method: "GET", paramMap: { content: "message" } },
    emailValidation: { endpoint: "/email", method: "GET", paramMap: { emailAddress: "email" } },
  },
  website: {
    pdfFromWebpage: { endpoint: "/pdf", method: "GET", paramMap: { webpageUrl: "url" } },
    seoInfo: { endpoint: "/page_info", method: "GET", paramMap: { webpageUrl: "url" } },
    screenshot: { endpoint: "/screenshot", method: "GET", paramMap: { webpageUrl: "url" } },
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

export const oneSimpleApiToolExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  if (items.length === 0) {
    return [[{ json: {} }]];
  }

  const resource = ctx.getParam<string>("resource", "information");
  const operation = ctx.getParam<string>("operation", "currencyConversion");
  const mapping = OP_MAP[resource]?.[operation];

  if (!mapping) {
    throw new Error(`One Simple API Tool: unknown resource/operation combination "${resource}/${operation}"`);
  }

  const credential = await ctx.getCredential("oneSimpleApiApi");
  const apiToken =
    (credential?.apiToken as string) ??
    (credential?.apiKey as string) ??
    "";

  if (!apiToken) {
    throw new Error("One Simple API Tool: credential apiToken/apiKey is required");
  }

  const results = await Promise.all(
    items.map(async (item) => {
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
            `One Simple API Tool returned status ${response.status}: ${JSON.stringify(response.body)}`,
          );
        }

        if (ctx.continueOnFail() && response.status >= 400) {
          return {
            json: {
              ...item.json,
              error: `One Simple API Tool returned status ${response.status}: ${JSON.stringify(response.body)}`,
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
