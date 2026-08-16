import { STREAM_FIRST_CHUNK_MS, STREAM_GAP_MS } from "../llm-silence";
import type { OpenRouterCompletionResult, OpenRouterToolCall } from "./lm-chat-open-router";

export type OpenRouterStreamDelta = {
  text: string;
  reasoning?: string;
  toolCalls?: OpenRouterToolCall[];
};

export class OpenRouterStreamSilentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterStreamSilentError";
  }
}

type PartialToolCall = { id?: string; name: string; arguments: string };

function parseToolCallArguments(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { raw };
  }
}

export function looksLikeSse(body: unknown): body is string {
  return typeof body === "string" && body.includes("data:");
}

export function looksLikeChatCompletion(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return Array.isArray((body as { choices?: unknown }).choices);
}

export function isStreamRejected(status: number, body: unknown): boolean {
  if (status === 401 || status === 402 || status === 403 || status === 429) return false;
  if (status === 400 || status === 404 || status === 415 || status === 422) return true;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return /stream/i.test(text) && status >= 400 && status < 500;
}

function finalizeToolCalls(acc: Map<number, PartialToolCall>): OpenRouterToolCall[] {
  const out: OpenRouterToolCall[] = [];
  const keys = [...acc.keys()].sort((a, b) => a - b);
  for (const k of keys) {
    const tc = acc.get(k);
    if (!tc?.name) continue;
    out.push({ id: tc.id, name: tc.name, args: parseToolCallArguments(tc.arguments) });
  }
  return out;
}

function applyToolCallDeltas(
  acc: Map<number, PartialToolCall>,
  deltas: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>,
): void {
  for (const d of deltas) {
    const idx = typeof d.index === "number" ? d.index : 0;
    const cur = acc.get(idx) ?? { name: "", arguments: "" };
    if (d.id) cur.id = d.id;
    if (d.function?.name) cur.name += d.function.name;
    if (d.function?.arguments) cur.arguments += d.function.arguments;
    acc.set(idx, cur);
  }
}

export function parseSseDataPayloads(chunk: string): unknown[] {
  const payloads: unknown[] = [];
  for (const rawLine of chunk.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") {
      if (data === "[DONE]") payloads.push("[DONE]");
      continue;
    }
    try {
      payloads.push(JSON.parse(data));
    } catch {
      /* incomplete / non-JSON */
    }
  }
  return payloads;
}

export async function* iterateByteStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* iterateSseText(text: string): AsyncGenerator<string> {
  yield text;
}

function nextWithTimeout<T>(
  it: AsyncIterator<T>,
  ms: number,
  message: string,
): Promise<IteratorResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OpenRouterStreamSilentError(message)), ms);
  });
  return Promise.race([it.next(), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function consumeOpenRouterSse(
  chunks: AsyncIterable<string>,
  opts: {
    firstChunkMs?: number;
    gapMs?: number;
    onDelta?: (delta: OpenRouterStreamDelta) => void;
  } = {},
): Promise<OpenRouterCompletionResult> {
  const firstChunkMs = opts.firstChunkMs ?? STREAM_FIRST_CHUNK_MS;
  const gapMs = opts.gapMs ?? STREAM_GAP_MS;
  const it = chunks[Symbol.asyncIterator]();
  let buffer = "";
  let text = "";
  let reasoning = "";
  let model = "";
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const toolAcc = new Map<number, PartialToolCall>();
  let sawEvent = false;

  const emit = () => {
    const toolCalls = finalizeToolCalls(toolAcc);
    opts.onDelta?.({
      text,
      ...(reasoning ? { reasoning } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    });
  };

  const applyPayload = (payload: unknown): boolean => {
    if (payload === "[DONE]") return true;
    if (!payload || typeof payload !== "object") return false;
    const p = payload as {
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      choices?: Array<{
        delta?: {
          content?: string | null;
          reasoning?: string | null;
          reasoning_content?: string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    if (p.model) model = p.model;
    if (p.usage) {
      usage = {
        promptTokens: p.usage.prompt_tokens ?? usage.promptTokens,
        completionTokens: p.usage.completion_tokens ?? usage.completionTokens,
        totalTokens: p.usage.total_tokens ?? usage.totalTokens,
      };
    }
    const delta = p.choices?.[0]?.delta;
    if (!delta) return false;
    if (typeof delta.content === "string" && delta.content) text += delta.content;
    const reason = delta.reasoning_content ?? delta.reasoning;
    if (typeof reason === "string" && reason) reasoning += reason;
    if (delta.tool_calls?.length) applyToolCallDeltas(toolAcc, delta.tool_calls);
    emit();
    return false;
  };

  while (true) {
    const waitMs = sawEvent ? gapMs : firstChunkMs;
    const message = sawEvent
      ? `OpenRouter stream went silent for ${Math.round(gapMs / 1000)}s`
      : `OpenRouter stream silent: no tokens in ${Math.round(firstChunkMs / 1000)}s`;
    const step = await nextWithTimeout(it, waitMs, message);
    if (step.done) break;
    sawEvent = true;
    buffer += step.value;
    const nl = buffer.lastIndexOf("\n");
    if (nl < 0) continue;
    const complete = buffer.slice(0, nl + 1);
    buffer = buffer.slice(nl + 1);
    const payloads = parseSseDataPayloads(complete);
    for (const payload of payloads) {
      if (applyPayload(payload)) {
        const toolCalls = finalizeToolCalls(toolAcc);
        return {
          text,
          model,
          usage,
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
          ...(reasoning ? { reasoning } : {}),
        };
      }
    }
  }

  if (buffer.trim()) {
    for (const payload of parseSseDataPayloads(buffer)) applyPayload(payload);
  }

  const toolCalls = finalizeToolCalls(toolAcc);
  return {
    text,
    model,
    usage,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(reasoning ? { reasoning } : {}),
  };
}
