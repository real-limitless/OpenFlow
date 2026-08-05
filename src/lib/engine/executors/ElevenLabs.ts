import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.elevenlabs.io";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

export const elevenLabsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "textToSpeech");
  const operation = String(node.parameters.operation ?? "convert");
  const continueOnFail = ctx.continueOnFail();
  const usePerItem = typeof node.parameters.text === "string" && node.parameters.text.startsWith("=");

  const cred = await ctx.getCredential("elevenLabsApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("ElevenLabs: elevenLabsApi credential is not configured");
  }

  if (resource !== "textToSpeech" || operation !== "convert") {
    throw new Error(`ElevenLabs: unsupported resource/operation "${resource}/${operation}"`);
  }

  if (usePerItem) {
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemJson = item.json ?? {};
      const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
      try {
        const result = await ttsConvert(apiKey, node, itemJson);
        const audioBytes = new Uint8Array(result.audio);
        const base64 = bytesToBase64(audioBytes);
        const binary: Record<string, IBinaryData> = {
          data: { data: base64, mimeType: "audio/mpeg", fileName: "audio.mp3" },
        };
        out.push({
          json: { ...itemJson, voiceId: result.voiceId, modelId: result.modelId },
          binary,
          pairedItem,
        });
      } catch (err) {
        if (!continueOnFail) throw err;
        const message = err instanceof Error ? err.message : String(err);
        out.push({ json: { ...itemJson, error: true, errorMessage: message }, pairedItem });
      }
    }
  } else {
    try {
      const result = await ttsConvert(apiKey, node, items[0]?.json ?? {});
      const audioBytes = new Uint8Array(result.audio);
      const base64 = bytesToBase64(audioBytes);
      const binary: Record<string, IBinaryData> = {
        data: { data: base64, mimeType: "audio/mpeg", fileName: "audio.mp3" },
      };
      out.push({
        json: { ...(items[0]?.json ?? {}), voiceId: result.voiceId, modelId: result.modelId },
        binary,
      });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: true, errorMessage: message } });
    }
  }

  return [out];
};

interface TtsResult {
  audio: ArrayBuffer;
  voiceId: string;
  modelId: string;
}

async function ttsConvert(
  apiKey: string,
  node: Parameters<typeof elevenLabsExecutor>[1],
  itemJson: Record<string, unknown>,
): Promise<TtsResult> {
  const voiceId = String(resolveValue(node.parameters.voiceId, itemJson) ?? "");
  if (!voiceId) throw new Error("ElevenLabs: voiceId is required");

  const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
  if (!text || !text.trim()) {
    throw new Error("ElevenLabs: text is required and cannot be empty");
  }

  const modelId = String(resolveValue(node.parameters.modelId, itemJson) ?? "eleven_multilingual_v2");

  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {
    text,
    model_id: modelId,
  };

  const voiceSettings: Record<string, unknown> = {};

  const stability = resolveValue(options.stability, itemJson);
  if (stability !== undefined && stability !== "") {
    voiceSettings.stability = Number(stability);
  }
  const similarityBoost = resolveValue(options.similarityBoost, itemJson);
  if (similarityBoost !== undefined && similarityBoost !== "") {
    voiceSettings.similarity_boost = Number(similarityBoost);
  }
  const style = resolveValue(options.style, itemJson);
  if (style !== undefined && style !== "") {
    voiceSettings.style = Number(style);
  }
  const useSpeakerBoost = resolveValue(options.useSpeakerBoost, itemJson);
  if (useSpeakerBoost !== undefined && useSpeakerBoost !== "") {
    voiceSettings.use_speaker_boost = Boolean(useSpeakerBoost);
  }

  if (Object.keys(voiceSettings).length > 0) {
    body.voice_settings = voiceSettings;
  }

  const speed = resolveValue(options.speed, itemJson);
  if (speed !== undefined && speed !== "") {
    body.speed = Number(speed);
  }

  let url = `${API_BASE}/v1/text-to-speech/${voiceId}`;
  const query: string[] = [];

  const outputFormat = resolveValue(options.outputFormat, itemJson);
  if (outputFormat !== undefined && outputFormat !== "") {
    query.push(`output_format=${encodeURIComponent(String(outputFormat))}`);
  }

  const optimizeStreamingLatency = resolveValue(options.optimizeStreamingLatency, itemJson);
  if (optimizeStreamingLatency !== undefined && optimizeStreamingLatency !== "") {
    query.push(`optimize_streaming_latency=${Number(optimizeStreamingLatency)}`);
  }

  if (query.length > 0) {
    url += `?${query.join("&")}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        Accept: "audio/mpeg,application/octet-stream",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `ElevenLabs API error: HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail) {
          errorMessage = `ElevenLabs: ${typeof errorJson.detail === "string" ? errorJson.detail : JSON.stringify(errorJson.detail)}`;
        } else if (errorJson.message) {
          errorMessage = `ElevenLabs: ${errorJson.message}`;
        } else if (errorJson.status && errorJson.error) {
          errorMessage = `ElevenLabs: ${errorJson.error}`;
        }
      } catch {
        if (errorText) errorMessage = `ElevenLabs: ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    const audio = await response.arrayBuffer();
    if (!audio || audio.byteLength === 0) {
      throw new Error("ElevenLabs: empty audio response");
    }

    return { audio, voiceId, modelId };
  } catch (err) {
    if (err instanceof TypeError && err.message.includes("fetch")) {
      throw new Error(`ElevenLabs network error: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
