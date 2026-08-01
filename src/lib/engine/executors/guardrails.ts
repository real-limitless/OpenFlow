import type { NodeExecutor, ExecutionContext, IWorkflow } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ModelInvokeResult {
  text: string;
  [key: string]: unknown;
}

interface ModelHandle {
  invoke(messages: ChatMessage[]): Promise<ModelInvokeResult>;
}

interface GuardrailResult {
  name: string;
  triggered: boolean;
  confidenceScore?: number;
  executionFailed?: boolean;
  exception?: string;
}

interface SubNodeRef {
  name: string;
  index: number;
}

interface GuardrailConfig {
  keywords?: string;
  jailbreak?: { value: { threshold?: number } };
  nsfw?: { value: { threshold?: number } };
  pii?: { value: { type?: string; entities?: string[] } };
  secretKeys?: { value: { permissiveness?: string } };
  topicalAlignment?: { value: { prompt?: string; threshold?: number } };
  urls?: {
    value: {
      allowedUrls?: string;
      allowedSchemes?: string[];
      allowSubdomains?: boolean;
      blockUserinfo?: boolean;
    };
  };
  customRegex?: { regex: Array<{ name: string; value: string }> };
  custom?: { value: { name?: string; prompt?: string; threshold?: number } };
}

function findConnectedSubNodes(
  connections: IWorkflow["connections"],
  nodeName: string,
): SubNodeRef[] {
  const models: SubNodeRef[] = [];
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets) continue;
        for (const t of targets) {
          if (!t || t.node !== nodeName) continue;
          if (t.type === "ai_languageModel") {
            models.push({ name: sourceName, index: t.index ?? 0 });
          }
        }
      }
    }
  }
  models.sort((a, b) => a.index - b.index);
  return models;
}

function getModelHandle(ctx: ExecutionContext, name: string): ModelHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  const json = items[0].json;
  if (json && typeof (json as { invoke?: unknown }).invoke === "function") {
    return json as unknown as ModelHandle;
  }
  return null;
}

function getGuardrailConfig(params: Record<string, unknown>): GuardrailConfig | undefined {
  const g = params.guardrails;
  if (!g || typeof g !== "object") return undefined;
  return g as GuardrailConfig;
}

function hasLlmChecks(config: GuardrailConfig): boolean {
  return !!(
    config.jailbreak ||
    config.nsfw ||
    config.topicalAlignment ||
    config.custom
  );
}

function checkKeywords(text: string, keywords: string): GuardrailResult {
  const words = keywords.split(",").map((w) => w.trim()).filter(Boolean);
  const lower = text.toLowerCase();
  const triggered = words.some((w) => lower.includes(w.toLowerCase()));
  return { name: "keywords", triggered };
}

function checkCustomRegex(text: string, regexes: Array<{ name: string; value: string }>): GuardrailResult[] {
  return regexes.map((r) => {
    try {
      const triggered = new RegExp(r.value).test(text);
      return { name: r.name || "customRegex", triggered };
    } catch {
      return { name: r.name || "customRegex", triggered: false, executionFailed: true, exception: "Invalid regex" };
    }
  });
}

function sanitizeCustomRegex(text: string, regexes: Array<{ name: string; value: string }>): string {
  let result = text;
  for (const r of regexes) {
    try {
      result = result.replace(new RegExp(r.value, "g"), `<${r.name}>`);
    } catch {
    }
  }
  return result;
}

function checkUrls(text: string, config: NonNullable<GuardrailConfig["urls"]>["value"]): GuardrailResult {
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const matches = text.match(urlRegex);
  if (!matches) return { name: "urls", triggered: false };

  const allowedList = (config.allowedUrls ?? "")
    .split(",")
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean);
  const allowedSchemes = config.allowedSchemes ?? [];
  const allowSubdomains = config.allowSubdomains ?? false;
  const blockUserinfo = config.blockUserinfo ?? false;

  for (const rawUrl of matches) {
    try {
      const url = new URL(rawUrl);
      if (allowedSchemes.length > 0 && !allowedSchemes.includes(url.protocol.replace(":", ""))) {
        return { name: "urls", triggered: true };
      }
      if (blockUserinfo && (url.username || url.password)) {
        return { name: "urls", triggered: true };
      }
      if (allowedList.length > 0) {
        const host = url.hostname.toLowerCase();
        const allowed = allowedList.some((a) => {
          if (allowSubdomains && host.endsWith("." + a.toLowerCase())) return true;
          return host === a.toLowerCase();
        });
        if (!allowed) return { name: "urls", triggered: true };
      }
    } catch {
      return { name: "urls", triggered: true };
    }
  }
  return { name: "urls", triggered: false };
}

function checkPii(text: string, _type?: string, _entities?: string[]): GuardrailResult {
  const patterns: Array<{ key: string; regex: RegExp }> = [
    { key: "CREDIT_CARD", regex: /\b(?:\d[ -]*?){13,16}\b/ },
    { key: "EMAIL_ADDRESS", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
    { key: "PHONE_NUMBER", regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/ },
    { key: "US_SSN", regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  ];

  let active = patterns;
  if (_type === "selected" && _entities) {
    active = patterns.filter((p) => _entities.includes(p.key));
  }

  const triggered = active.some((p) => p.regex.test(text));
  return { name: "pii", triggered };
}

function checkSecretKeys(text: string, _permissiveness?: string): GuardrailResult {
  const patterns: RegExp[] = [
    /\b(?:sk[-_])?[A-Za-z0-9_-]{20,}\b/,
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/,
  ];

  const strict = _permissiveness !== "permissive";
  const matches = patterns.filter((p) => p.test(text));
  let triggered = matches.length > 0;
  if (!strict && triggered) {
    triggered = matches.length >= 2;
  }
  return { name: "secretKeys", triggered };
}

function getJsonValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".").filter((p) => p !== "json");
  if (parts.length === 0) return obj;
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setJsonValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter((p) => p !== "json");
  if (parts.length === 0) return;
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

export const guardrailsExecutor: NodeExecutor = async (ctx, node) => {
  const operation = (node.parameters.operation as string) ?? "check";
  const jsonOutput = (node.parameters.jsonOutput as string) ?? "json.text";
  const config = getGuardrailConfig(node.parameters);
  const inputItems = ctx.getInputItems(0);

  if (!config) return operation === "sanitize" ? [inputItems] : [inputItems, []];

  const needsModel = hasLlmChecks(config);
  const continueOnFail = ctx.continueOnFail();

  let modelHandle: ModelHandle | null = null;
  if (needsModel) {
    const workflow = ctx.getWorkflow();
    const models = findConnectedSubNodes(workflow.connections, node.name);
    if (models.length > 0) {
      modelHandle = getModelHandle(ctx, models[0].name);
    }
  }

  const passItems: INodeExecutionData[] = [];
  const failItems: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const rawText = getJsonValue(item.json, jsonOutput);
    const text = typeof rawText === "string" ? rawText : "";
    let sanitized = text;

    if (typeof rawText !== "string") {
      if (continueOnFail) {
        passItems.push({ ...item, json: { ...item.json, error: "Text to evaluate is not a string" } });
      } else {
        failItems.push({
          ...item,
          json: {
            ...item.json,
            guardrailsResults: {
              failed: [{ name: "execution", triggered: true, executionFailed: true, exception: "Text to evaluate is not a string" }],
            },
          },
        });
      }
      continue;
    }

    const results: GuardrailResult[] = [];

    if (config.keywords) {
      results.push(checkKeywords(sanitized, config.keywords));
    }

    if (config.urls) {
      results.push(checkUrls(sanitized, config.urls.value));
    }

    if (config.customRegex && config.customRegex.regex) {
      results.push(...checkCustomRegex(sanitized, config.customRegex.regex));
    }

    if (config.pii) {
      const piiVal = config.pii.value;
      results.push(checkPii(sanitized, piiVal?.type, piiVal?.entities));
    }

    if (config.secretKeys) {
      results.push(checkSecretKeys(sanitized, config.secretKeys.value?.permissiveness));
    }

    if (operation === "check" && config.jailbreak) {
      const r = await runLlmCheck(ctx, modelHandle, text, config.jailbreak.value, "jailbreak", "jailbreak");
      results.push(r);
    }

    if (operation === "check" && config.nsfw) {
      const r = await runLlmCheck(ctx, modelHandle, text, config.nsfw.value, "nsfw", "nsfw");
      results.push(r);
    }

    if (operation === "check" && config.topicalAlignment) {
      const r = await runLlmCheck(ctx, modelHandle, text, config.topicalAlignment.value, "topicalAlignment", "topicalAlignment");
      results.push(r);
    }

    if (operation === "check" && config.custom) {
      const r = await runLlmCheck(ctx, modelHandle, text, config.custom.value, config.custom.value.name ?? "custom", "custom");
      results.push(r);
    }

    const triggered = results.filter((r) => r.triggered || r.executionFailed);

    if (operation === "sanitize") {
      if (config.keywords) {
        const words = config.keywords.split(",").map((w) => w.trim()).filter(Boolean);
        for (const w of words) {
          sanitized = sanitized.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<REDACTED>");
        }
      }
      if (config.urls) {
        sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, "<URL_REDACTED>");
      }
      if (config.customRegex && config.customRegex.regex) {
        sanitized = sanitizeCustomRegex(sanitized, config.customRegex.regex);
      }
      if (config.pii) {
        sanitized = sanitized
          .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "<PHONE_NUMBER>")
          .replace(/\b(?:\d[ -]*?){13,16}\b/g, "<CREDIT_CARD>")
          .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "<EMAIL_ADDRESS>")
          .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "<US_SSN>");
      }
      if (config.secretKeys) {
        sanitized = sanitized.replace(/\b(?:sk[-_])?[A-Za-z0-9_-]{20,}\b/g, "<REDACTED>")
          .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g, "<REDACTED>");
      }

      const outputItem = { ...item, json: { ...item.json } };
      setJsonValue(outputItem.json, jsonOutput, sanitized);
      passItems.push(outputItem);
    } else {
      if (triggered.length > 0) {
        failItems.push({
          ...item,
          json: { ...item.json, guardrailsResults: { failed: triggered } },
        });
      } else {
        passItems.push({
          ...item,
          json: { ...item.json, guardrailsResults: { passed: results } },
        });
      }
    }
  }

  if (operation === "sanitize") return [passItems];
  return [passItems, failItems];
};

async function runLlmCheck(
  ctx: ExecutionContext,
  model: ModelHandle | null,
  text: string,
  _config: { threshold?: number; prompt?: string } | undefined,
  name: string,
  _checkType: string,
): Promise<GuardrailResult> {
  if (!model) {
    return { name: name || "llm", triggered: true, executionFailed: true, exception: "ai_languageModel not connected" };
  }
  const threshold = _config?.threshold ?? 0.5;
  const userPrompt = _config?.prompt ?? `Check the following text for ${_checkType} violations:\n\n${text}`;
  const systemMessage = ctx.getParam<string>("systemMessage", undefined);

  const messages: ChatMessage[] = [];
  if (systemMessage) {
    messages.push({ role: "system", content: systemMessage });
  }
  messages.push({ role: "user", content: userPrompt });

  try {
    const result = await model.invoke(messages);
    const raw = typeof result.text === "string" ? result.text : "";
    let parsed: { flagged?: boolean; confidenceScore?: number } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const lower = raw.toLowerCase();
      parsed.flagged = lower.includes("flagged") || lower.includes("true") || lower.includes("violation") || lower.includes("yes");
      parsed.confidenceScore = 0.5;
    }
    const { flagged = false, confidenceScore = 0 } = parsed;
    const triggered = flagged && confidenceScore >= threshold;
    return { name, triggered, confidenceScore };
  } catch (err) {
    return { name, triggered: true, executionFailed: true, exception: err instanceof Error ? err.message : String(err) };
  }
}
