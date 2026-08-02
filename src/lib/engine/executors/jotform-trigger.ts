import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface JotformPayload {
  formID?: string;
  submissionID?: string;
  type?: string;
  ip?: string;
  formTitle?: string;
  pretty?: string;
  rawRequest?: string;
  customTitle?: string;
  customParams?: string;
  webhookURL?: string;
}

const BOT_PATTERN =
  /bot|crawl|spider|preview|slurp|mediapartners|facebookexternalhit|twitterbot|linkedinbot|telegrambot|whatsapp|skypeuripreview/i;

function parseRawRequest(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function resolveQuestionKeys(
  answers: Record<string, unknown>,
  questionMap: Record<string, string>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    const labelKey = questionMap[key];
    resolved[labelKey ?? key] = value;
  }
  return resolved;
}

/**
 * Jotform Trigger — webhook-based trigger that emits one item per submission.
 *
 * The host (server webhook route) receives the Jotform POST (multipart/form-data),
 * parses it, and feeds the parsed fields as input items. Each input item's `json`
 * carries the decoded payload (formID, submissionID, type, ip, formTitle, pretty,
 * rawRequest as a JSON string, customTitle, customParams, webhookURL).
 *
 * The executor:
 * - Strips bot requests if configured.
 * - Decodes the `rawRequest` string into a structured answers object.
 * - Optionally resolves question IDs to human-readable labels (lookup mechanism
 *   is host-provided via questionMap — spec says TODO).
 * - Conditionally emits only the answers or the full envelope.
 *
 * Gaps (documented TODOs):
 * - `resolveData` question-label lookup: requires a form-question API call to map
 *   q3 → "Name". The questionMap param is expected to come from the host.
 * - Actual webhook lifecycle (activate = POST /v1/form/{formID}/webhooks,
 *   deactivate = DELETE) is host-level; the executor transforms the received payload.
 * - Manual/active mode distinction is host-level.
 */
export const jotFormTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const onlyAnswers = ctx.getParam<boolean>("onlyAnswers", true);
  const resolveData = ctx.getParam<boolean>("resolveData", true);
  const ignoreBots = ctx.getParam<boolean>("options.ignoreBots", false);

  const questionMap = ctx.getParam<Record<string, string>>("questionMap", {});

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const payload = (item.json ?? {}) as JotformPayload;

    if (ignoreBots) {
      const ua = String(payload.ip ?? "");
      if (BOT_PATTERN.test(ua)) continue;
    }

    const rawRequestStr = payload.rawRequest;
    if (!rawRequestStr) continue;

    const answers = parseRawRequest(rawRequestStr);
    if (Object.keys(answers).length === 0) continue;

    const resolved = resolveData ? resolveQuestionKeys(answers, questionMap) : answers;

    if (onlyAnswers) {
      out.push({ json: resolved, binary: item.binary });
    } else {
      const envelope: Record<string, unknown> = {
        formID: payload.formID,
        submissionID: payload.submissionID,
        type: payload.type,
        ip: payload.ip,
        formTitle: payload.formTitle,
        pretty: payload.pretty,
        customTitle: payload.customTitle,
        customParams: payload.customParams,
        webhookURL: payload.webhookURL,
        answers: resolved,
      };
      out.push({ json: envelope, binary: item.binary });
    }
  }

  if (out.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};
