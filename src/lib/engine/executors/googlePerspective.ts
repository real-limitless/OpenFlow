import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "@/lib/expressions/evaluate";

const API_BASE = "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze";

interface AttributeScore {
  spanScores: Array<{ begin: number; end: number; score: { value: number; scoreType: string } }>;
  summaryScore: { value: number; scoreType: string };
}

interface AnalyzeResponse {
  attributeScores: Record<string, AttributeScore>;
  languages: string[];
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function toNumber(v: unknown, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}

export const googlePerspectiveExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();
  const params = ctx.getParams();

  const cred = await ctx.getCredential("googlePerspectiveOAuth2Api");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      const rawText = ctx.getParam<string>("text", "");
      const text = String(resolveValue(rawText, itemJson) ?? "");

      if (!text.trim()) {
        throw new Error("Google Perspective: text parameter is empty or whitespace-only");
      }

      const requestedAttributes: Record<string, { scoreThreshold?: number }> = {};

      const attrUi = params.requestedAttributesUi as Record<string, unknown> | undefined;
      const attrValues = attrUi?.requestedAttributesValues as Array<Record<string, unknown>> | undefined;

      if (attrValues && attrValues.length > 0) {
        for (const a of attrValues) {
          const name = String(resolveValue(a.attributeName, itemJson) ?? "toxicity");
          const threshold = toNumber(resolveValue(a.scoreThreshold, itemJson), 0);
          requestedAttributes[name] = threshold > 0 ? { scoreThreshold: threshold } : {};
        }
      } else {
        requestedAttributes.toxicity = {};
      }

      const optionsParam = params.options as Record<string, unknown> | undefined;
      const languagesRaw = optionsParam?.languages as string | undefined;
      const languagesVal = languagesRaw ? String(resolveValue(languagesRaw, itemJson) ?? "") : "";

      const body: Record<string, unknown> = {
        comment: { text },
        requestedAttributes,
      };

      if (languagesVal) {
        body.languages = languagesVal.split(",").map((s: string) => s.trim()).filter(Boolean);
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (cred && typeof cred === "object") {
        const accessToken =
          (cred as Record<string, unknown>).accessToken ??
          ((cred as Record<string, unknown>).data as Record<string, unknown>)?.accessToken ??
          "";
        if (accessToken) {
          headers["Authorization"] = `Bearer ${String(accessToken)}`;
        }
      }

      const response = await fetch(API_BASE, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        let errMsg = `Google Perspective API: HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(errBody);
          errMsg = parsed.error?.message ?? errMsg;
        } catch { /* ignore parse error */ }
        throw new Error(errMsg);
      }

      const data = (await response.json()) as AnalyzeResponse;

      out.push({
        json: { ...itemJson, attributeScores: data.attributeScores },
        pairedItem,
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { ...itemJson, error: err instanceof Error ? err.message : String(err) },
          pairedItem,
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};
