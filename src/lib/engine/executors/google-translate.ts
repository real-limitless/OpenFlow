import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest, ensureItems } from "@/sdk";

const API_BASE = "https://translation.googleapis.com/language/translate/v2";

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

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export const googleTranslateExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();
  const out: INodeExecutionData[] = [];

  for (const item of items) {
    try {
      const text = String(
        resolveValue(ctx.getParam("text"), item.json, ctx) ?? "",
      );
      const translateTo = String(
        resolveValue(ctx.getParam("translateTo"), item.json, ctx) ?? "",
      );
      const translateFromRaw = resolveValue(
        ctx.getParam("translateFrom"),
        item.json,
        ctx,
      );

      if (!isNonEmptyString(text)) {
        throw new Error("The parameter 'text' is required.");
      }
      if (!isNonEmptyString(translateTo)) {
        throw new Error("The parameter 'translateTo' is required.");
      }

      const body: Record<string, string> = {
        q: text,
        target: translateTo,
      };
      if (isNonEmptyString(translateFromRaw)) {
        body.source = translateFromRaw as string;
      }

      const credential = await ctx.getCredential("googleTranslateOAuth2Api");
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

      const data = res.body as Record<string, unknown>;
      const d = data?.data as Record<string, unknown> | undefined;
      const t = (d?.translations as Array<Record<string, unknown>>)?.[0];

      out.push({
        json: {
          translatedText: String(t?.translatedText ?? ""),
          detectedSourceLanguage: String(
            t?.detectedSourceLanguage ?? translateFromRaw ?? "",
          ),
        },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: {
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