import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface FormSubmission {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  ip?: string;
  executionMode?: string;
  submittedAt?: string;
}

export interface FormResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

const formResponses = new Map<string, FormResponse>();

export function getFormResponse(executionId: string): FormResponse | undefined {
  return formResponses.get(executionId);
}

export function setFormResponse(executionId: string, response: FormResponse): void {
  formResponses.set(executionId, response);
}

export function clearFormResponse(executionId: string): void {
  formResponses.delete(executionId);
}

export function clearAllFormResponses(): void {
  formResponses.clear();
}

const BOT_PATTERN =
  /bot|crawl|spider|preview|slurp|mediapartners|facebookexternalhit|twitterbot|linkedinbot|telegrambot|whatsapp|skypeuripreview/i;

function getExecutionId(ctx: Parameters<NodeExecutor>[0]): string | undefined {
  const workflow = ctx.getWorkflow();
  return (workflow as Record<string, unknown>).__executionId as string | undefined;
}

function formatInTimezone(date: Date, timezone: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";

  let hour = get("hour");
  if (hour === "24") hour = "00";

  let offset = get("timeZoneName").replace("GMT", "");
  if (offset === "" || offset === "Z") offset = "+00:00";

  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}${offset}`;
}

function formatSubmittedAt(raw: string | undefined, useTz: boolean, timezone?: string): string {
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  if (useTz && timezone) return formatInTimezone(date, timezone);
  return date.toISOString();
}

/**
 * Form Trigger — starts a workflow when a user submits a form served at
 * `/form/<formPath>`.
 *
 * Input contract (host → executor): each input item's `json` carries the
 * parsed form submission:
 *  - `body`: field values keyed by Field Name (host maps form body → fieldName)
 *  - `headers`, `query`, `ip`, `executionMode`: request metadata
 *  - `submittedAt`: ISO timestamp captured by the host (optional; defaults to now)
 * File uploads arrive on `item.binary`.
 *
 * Output: a single item per submission whose `json` contains each field value
 * keyed by Field Name plus `submittedAt` (UTC by default; workflow timezone
 * when `options.useWorkflowTimezone` is on).
 *
 * Response modes:
 *  - `formSubmitted`: stores an immediate response (`options.formSubmittedText`)
 *    so the host can return it right away.
 *  - `workflowFinishes`: no immediate response; the host waits for the workflow
 *    to complete and shapes the response from the final output (host-level).
 *
 * Gaps (documented TODOs):
 *  - `authentication` (basic auth — host-level validation)
 *  - HTML sanitization of formDescription / customHtml elements (rendering concern)
 *  - Query-parameter default values (production-only, host-level rendering)
 *  - File upload binary property name (not documented; preserved as-is)
 */
export const formTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const responseMode = ctx.getParam<string>("responseMode", "formSubmitted");
  const ignoreBots = options.ignoreBots === true;
  const useWorkflowTimezone = options.useWorkflowTimezone === true;
  const formSubmittedText = String(options.formSubmittedText ?? "");

  const workflow = ctx.getWorkflow();
  const timezone = useWorkflowTimezone
    ? (workflow.settings?.timezone as string | undefined)
    : undefined;

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const submission = (item.json ?? {}) as FormSubmission;
    const headers = submission.headers ?? {};

    if (ignoreBots) {
      const ua = String(headers["user-agent"] ?? headers["User-Agent"] ?? "");
      if (BOT_PATTERN.test(ua)) {
        continue;
      }
    }

    const body = submission.body ?? {};
    const submittedAt = formatSubmittedAt(submission.submittedAt, useWorkflowTimezone, timezone);

    out.push({
      json: {
        ...body,
        submittedAt,
      },
      binary: item.binary,
    });
  }

  if (responseMode === "formSubmitted") {
    const execId = getExecutionId(ctx);
    if (execId) {
      setFormResponse(execId, {
        statusCode: 200,
        body: formSubmittedText || "Form submitted",
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }
  return [out];
};
