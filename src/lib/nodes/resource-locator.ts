/**
 * Canonical resourceLocator shape used by the editor and LM executors.
 *
 * n8n stores `{ __rl: true, mode, value }`. OpenFlow's editor historically wrote
 * `{ mode, value }` without `__rl`, and some APIs/imports persist a plain string.
 * Spreading a string into an object (`{ ...legacyString, value }`) also produces
 * a corrupted object with numeric character-index keys. These helpers accept
 * every observed shape and never coerce leftover objects via `String()`.
 */

export interface ResourceLocatorValue {
  __rl: true;
  mode: string;
  value: string;
  cachedResultName?: string;
}

export interface ResourceLocatorEvalContext {
  getParam<T = unknown>(name: string, defaultValue?: T): T;
  getInputItems(index: number): Array<{ json?: Record<string, unknown> }>;
  evaluate(expression: string, json: Record<string, unknown>): unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

const RESOURCE_LOCATOR_KEYS = new Set([
  "__rl",
  "mode",
  "value",
  "cachedResultName",
  "cachedResultUrl",
  "cachedResultUrlDisplay",
]);

function looksLikeResourceLocator(obj: Record<string, unknown>): boolean {
  if (!("value" in obj)) return false;
  if (obj.__rl != null || obj.mode != null) return true;
  return Object.keys(obj).every((key) => RESOURCE_LOCATOR_KEYS.has(key) || /^\d+$/.test(key));
}

export function unwrapResourceLocator(param: unknown): unknown {
  if (!isRecord(param) || !looksLikeResourceLocator(param)) return param;
  return param.value;
}

export function normalizeResourceLocator(value: unknown, defaultMode = "id"): ResourceLocatorValue {
  if (typeof value === "string") {
    return { __rl: true, mode: defaultMode, value };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { __rl: true, mode: defaultMode, value: String(value) };
  }
  if (isRecord(value)) {
    const mode = typeof value.mode === "string" && value.mode ? value.mode : defaultMode;
    const unwrapped = unwrapResourceLocator(value);
    let inner = "";
    if (typeof unwrapped === "string") inner = unwrapped;
    else if (typeof unwrapped === "number" || typeof unwrapped === "boolean")
      inner = String(unwrapped);
    const out: ResourceLocatorValue = { __rl: true, mode, value: inner };
    if (typeof value.cachedResultName === "string") {
      out.cachedResultName = value.cachedResultName;
    }
    return out;
  }
  return { __rl: true, mode: defaultMode, value: "" };
}

function jsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function requireScalarLocatorValue(raw: unknown, label: string): string {
  if (raw == null || raw === "") {
    throw new Error(`${label} is required`);
  }
  if (typeof raw === "object") {
    throw new Error(`${label} resolved to a non-string value: ${jsonPreview(raw)}`);
  }
  return String(raw);
}

export function resolveChatModelId(
  ctx: ResourceLocatorEvalContext,
  label: string,
  paramName = "model",
): string {
  const raw = unwrapResourceLocator(ctx.getParam<unknown>(paramName));
  const str = requireScalarLocatorValue(raw, label);
  const firstJson = ctx.getInputItems(0)[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();
  if (!modelId) {
    throw new Error(`${label} resolved to empty`);
  }
  return modelId;
}
