import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest, ensureItems } from "@/sdk";

const API_BASE = "https://language.googleapis.com/v1/documents:analyzeSentiment";

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

export const googleCloudNaturalLanguageToolExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();
  const out: INodeExecutionData[] = [];

  for (const item of items) {
    try {
      const documentSource = ctx.getParam<string>("documentSource", "text");
      const textRaw = ctx.getParam<string>("text", "");
      const jsonInputField = ctx.getParam<string>("jsonInputField", "");
      const options = ctx.getParam<Record<string, unknown>>("options", {});

      const text =
        documentSource === "fromJson" && jsonInputField
          ? String(item.json[jsonInputField] ?? "")
          : String(resolveValue(textRaw, item.json, ctx) ?? "");

      if (!text) {
        throw new Error("Document text is required.");
      }

      const document: Record<string, unknown> = {
        type: "PLAIN_TEXT",
        content: text,
      };

      const language = options.language as string | undefined;
      if (language) {
        document.languageCode = language;
      }

      const encodingType = (options.encodingType as string) ?? "UTF8";

      const credential = await ctx.getCredential("googleCloudNaturalLanguageOAuth2Api");
      const accessToken =
        credential?.accessToken ??
        (credential?.data as Record<string, unknown>)?.accessToken ??
        "";

      const body: Record<string, unknown> = { document, encodingType };

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

      out.push({ json: { sentiment: data } });
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
