import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest, ensureItems } from "@/sdk";

const API_BASE = "https://language.googleapis.com/v2/documents:analyzeSentiment";

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

export const googleCloudNaturalLanguageExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();
  const out: INodeExecutionData[] = [];

  for (const item of items) {
    try {
      const documentType = ctx.getParam<string>("documentType", "content");
      const encodingType = ctx.getParam<string>("encodingType", "UTF8");
      const languageRaw = resolveValue(ctx.getParam("inputLanguage"), item.json, ctx);

      const document: Record<string, unknown> = { type: "PLAIN_TEXT" };

      if (documentType === "content") {
        const textContent = String(
          resolveValue(ctx.getParam("textContent"), item.json, ctx) ?? "",
        );
        if (!isNonEmptyString(textContent)) {
          throw new Error("Text content is required when document source is 'Text Content'.");
        }
        document.content = textContent;
      } else {
        const gcsUri = String(
          resolveValue(ctx.getParam("gcsUri"), item.json, ctx) ?? "",
        );
        if (!isNonEmptyString(gcsUri)) {
          throw new Error("Cloud Storage URI is required when document source is 'Cloud Storage URI'.");
        }
        document.gcsContentUri = gcsUri;
      }

      if (isNonEmptyString(languageRaw)) {
        document.languageCode = languageRaw as string;
      }

      const body: Record<string, unknown> = {
        document,
        encodingType,
      };

      const credential = await ctx.getCredential("googleCloudNaturalLanguageOAuth2Api");
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

      out.push({ json: data });
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
