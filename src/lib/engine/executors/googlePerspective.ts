import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest, ensureItems } from "@/sdk";

const API_BASE = "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze";

const ATTRIBUTE_NAMES = [
  "flirtation",
  "identity_attack",
  "insult",
  "profanity",
  "severe_toxicity",
  "sexually_explicit",
  "threat",
  "toxicity",
] as const;

interface RequestedAttribute {
  attributeName: string;
  scoreThreshold?: number;
}

function resolveValue(
  raw: unknown,
  itemJson: Record<string, unknown>,
  ctx: { evaluate: (expr: string, json: Record<string, unknown>) => unknown },
): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    return ctx.evaluate(raw, itemJson);
  }
  return raw;
}

export const googlePerspectiveExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();
  const out: INodeExecutionData[] = [];

  for (const item of items) {
    try {
      const text = String(
        resolveValue(ctx.getParam("text"), item.json, ctx) ?? "",
      );

      const requestedAttributesUi = ctx.getParam<{
        requestedAttributesValues?: RequestedAttribute[];
      }>("requestedAttributesUi", {});

      const attributeValues = requestedAttributesUi?.requestedAttributesValues ?? [];

      const attributes: Record<string, { scoreThreshold?: number }> = {};
      for (const attr of attributeValues) {
        if (ATTRIBUTE_NAMES.includes(attr.attributeName as typeof ATTRIBUTE_NAMES[number])) {
          const threshold = attr.scoreThreshold ?? 0;
          attributes[attr.attributeName] = threshold > 0 ? { scoreThreshold: threshold } : {};
        }
      }

      const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
      const languagesRaw = resolveValue(options.languages, item.json, ctx);
      const languages = typeof languagesRaw === "string" && languagesRaw.length > 0
        ? [languagesRaw]
        : undefined;

      const body: Record<string, unknown> = {
        comment: { text },
        requestedAttributes: attributes,
      };

      if (languages) {
        body.languages = languages;
      }

      const credential = await ctx.getCredential("googlePerspectiveOAuth2Api");
      const accessToken =
        credential?.accessToken ??
        (credential?.data as Record<string, unknown>)?.accessToken ??
        "";

      const res = await sdkHttpRequest({
        method: "POST",
        url: API_BASE,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body,
      });

      if (res.status < 200 || res.status >= 300) {
        const errBody = res.body as Record<string, unknown> | undefined;
        const msg =
          ((errBody?.error as Record<string, unknown>)?.message as string) ??
          `HTTP ${res.status}`;
        throw new Error(String(msg));
      }

      const apiResponse = res.body as Record<string, unknown>;

      out.push({
        json: {
          ...item.json,
          perspective: apiResponse,
        },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: {
            ...item.json,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      } else {
        throw err;
      }
    }
  }

  return [out];
};
