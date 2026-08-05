import type { NodeExecutor } from "@/sdk";
import { withPairedItem, requireCredential, sdkHttpRequest } from "@/sdk";

const LINGVA_NEX_TRANSLATE_URL = "https://api.lingvanex.com/v2/translate";

export const lingvaNexExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const text = ctx.getParam<string>("text", "");
  const translateTo = ctx.getParam<string>("translateTo", "");
  const translateFrom = ctx.getParam<string>("translateFrom", "");
  const options = ctx.getParam<Record<string, unknown>>("options", {});

  if (!text) {
    throw new Error("Text parameter is required");
  }
  if (!translateTo) {
    throw new Error("Translate To parameter is required");
  }

  const credential = await requireCredential(ctx, "lingvaNexApi");
  const apiKey = String(credential.apiKey ?? "");

  const additionalFields =
    (options.additionalFields as Record<string, unknown>) ?? {};

  const results = await Promise.all(
    items.map(async (item, idx) => {
      const resolvedText = text.startsWith("={{")
        ? String(ctx.evaluate(text, item.json) ?? "")
        : text;

      if (!resolvedText) {
        throw new Error("Resolved text is empty");
      }

      const body: Record<string, unknown> = {
        text: resolvedText,
        to: translateTo,
        ...additionalFields,
      };
      if (translateFrom) {
        body.from = translateFrom;
      }

      const response = await sdkHttpRequest({
        method: "POST",
        url: LINGVA_NEX_TRANSLATE_URL,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body,
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `LingvaNex API error: ${response.status} ${JSON.stringify(response.body)}`,
        );
      }

      const responseBody = response.body as Record<string, unknown>;
      const translatedText = String(responseBody.translation ?? "");
      const detectedLang = responseBody.from
        ? String(responseBody.from)
        : undefined;

      const output: Record<string, unknown> = {
        translation: translatedText,
        ...item.json,
      };
      if (detectedLang) {
        output.detectedLanguage = detectedLang;
      }

      return withPairedItem({ json: output }, idx);
    }),
  );

  return [results];
};
