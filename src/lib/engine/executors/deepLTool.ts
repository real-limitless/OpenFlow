import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest, ensureItems } from "@/sdk";

const API_PRO = "https://api.deepl.com/v2";
const API_FREE = "https://api-free.deepl.com/v2";

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

export const deepLToolExecutor: NodeExecutor = async (ctx) => {
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
      const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});

      if (!isNonEmptyString(text)) {
        throw new Error("The parameter 'text' is required.");
      }
      if (!isNonEmptyString(translateTo)) {
        throw new Error("The parameter 'translateTo' is required.");
      }

      const body: Record<string, string> = {
        text,
        target_lang: translateTo.toUpperCase(),
      };

      const sourceLangRaw = resolveValue(additionalFields.sourceLang, item.json, ctx);
      if (isNonEmptyString(sourceLangRaw)) {
        body.source_lang = String(sourceLangRaw).toUpperCase();
      }

      const splitSentencesRaw = resolveValue(additionalFields.splitSentences, item.json, ctx);
      if (isNonEmptyString(splitSentencesRaw)) {
        body.split_sentences = splitSentencesRaw as string;
      }

      const preserveFormattingRaw = resolveValue(additionalFields.preserveFormatting, item.json, ctx);
      if (isNonEmptyString(preserveFormattingRaw)) {
        body.preserve_formatting = preserveFormattingRaw as string;
      }

      const formalityRaw = resolveValue(additionalFields.formality, item.json, ctx);
      if (isNonEmptyString(formalityRaw)) {
        body.formality = formalityRaw as string;
      }

      const credential = await ctx.getCredential("deepLApi");
      const apiKey =
        (credential?.apiKey as string) ??
        ((credential?.data as Record<string, unknown>)?.apiKey as string) ??
        "";
      const plan =
        (credential?.plan as string) ??
        ((credential?.data as Record<string, unknown>)?.plan as string) ??
        "pro";

      const baseUrl = plan === "free" ? API_FREE : API_PRO;

      const res = await sdkHttpRequest({
        method: "POST",
        url: `${baseUrl}/translate`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `DeepL-Auth-Key ${apiKey}`,
        },
        body,
      });

      if (res.status < 200 || res.status >= 300) {
        const errBody = res.body as Record<string, unknown> | undefined;
        const msg =
          ((errBody?.message as string) ||
            (errBody?.error as string)) ??
          `HTTP ${res.status}`;
        throw new Error(String(msg));
      }

      const data = res.body as Record<string, unknown>;
      const translations = data?.translations as Array<Record<string, unknown>> | undefined;
      const t = translations?.[0];

      out.push({
        json: {
          detected_source_language: String(t?.detected_source_language ?? ""),
          text: String(t?.text ?? ""),
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
