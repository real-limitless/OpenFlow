import type { INodeTypeDescription } from "@/lib/nodes/types";
import { allNodeTypes } from "@/lib/nodes/registry";

export type SlotSide = "input" | "output";

/** Canvas slot picker anchor (opened from BaseNode + buttons). */
export interface SlotPickerTarget {
  nodeName: string;
  side: SlotSide;
  channel: string;
  handleId: string;
  x: number;
  y: number;
}

/** Human labels for connection channels (wire id → display). */
export const CHANNEL_LABELS: Record<string, string> = {
  main: "Main",
  ai_agent: "AI Agent",
  ai_chain: "AI Chain",
  ai_document: "Document",
  ai_documentLoader: "Document Loader",
  ai_embedding: "Embedding",
  ai_languageModel: "Chat Model",
  ai_memory: "Memory",
  ai_outputParser: "Output Parser",
  ai_retriever: "Retriever",
  ai_reranker: "Reranker",
  ai_textSplitter: "Text Splitter",
  ai_tool: "Tool",
  ai_vectorRetriever: "Vector Retriever",
  ai_vectorStore: "Vector Store",
};

/** CSS color tokens per channel family. */
export const CHANNEL_COLORS: Record<string, string> = {
  main: "var(--border)",
  ai_agent: "var(--ai-channel-agent)",
  ai_chain: "var(--ai-channel-chain)",
  ai_document: "var(--ai-channel-document)",
  ai_documentLoader: "var(--ai-channel-document)",
  ai_embedding: "var(--ai-channel-embedding)",
  ai_languageModel: "var(--ai-channel-model)",
  ai_memory: "var(--ai-channel-memory)",
  ai_outputParser: "var(--ai-channel-parser)",
  ai_retriever: "var(--ai-channel-retriever)",
  ai_reranker: "var(--ai-channel-reranker)",
  ai_textSplitter: "var(--ai-channel-splitter)",
  ai_tool: "var(--ai-channel-tool)",
  ai_vectorRetriever: "var(--ai-channel-retriever)",
  ai_vectorStore: "var(--ai-channel-vector)",
};

const DEFAULT_AI_COLOR = "var(--ai-handle)";

export function isAiChannel(channel: string): boolean {
  return channel.startsWith("ai_");
}

/**
 * Display label for a handle.
 * @param channel wire id
 * @param ordinal per-channel index (0-based among handles of this channel)
 * @param namedExact optional full label from inputNames/outputNames (already ordinal-aware)
 */
export function channelLabel(channel: string, ordinal = 0, namedExact?: string | null): string {
  if (namedExact) return namedExact;
  const base = CHANNEL_LABELS[channel] ?? humanizeChannel(channel);
  if (channel === "main" && ordinal > 0) return `Input ${ordinal + 1}`;
  if (ordinal > 0) return `${base} ${ordinal + 1}`;
  return base;
}

/**
 * Resolve display label from parallel names + static channel list.
 * For repeated channels (main×N), names are indexed by ordinal within that channel.
 * When expanded past the named static list (extra tool slot), returns first name + suffix.
 * When no name applies, returns undefined so channelLabel can fall back.
 */
export function namedBaseForChannel(
  channel: string,
  staticChannels: string[],
  names: string[] | null | undefined,
  ordinal = 0,
): string | undefined {
  if (!names?.length) return undefined;
  let seen = 0;
  let firstName: string | undefined;
  for (let i = 0; i < staticChannels.length; i++) {
    if (staticChannels[i] !== channel) continue;
    if (names[i] && firstName === undefined) firstName = names[i];
    if (seen === ordinal) return names[i] || undefined;
    seen++;
  }
  // Expanded AI multi-slot (e.g. tool-1 empty): "Tool 2"
  if (firstName && isAiChannel(channel) && ordinal > 0) {
    return `${firstName} ${ordinal + 1}`;
  }
  return undefined;
}

export function channelColor(channel: string): string {
  if (channel === "main") return "var(--color-surface-raised)";
  return CHANNEL_COLORS[channel] ?? DEFAULT_AI_COLOR;
}

export function channelEdgeColor(channel: string): string {
  if (channel === "main") return "var(--border)";
  return CHANNEL_COLORS[channel] ?? DEFAULT_AI_COLOR;
}

function humanizeChannel(channel: string): string {
  const raw = channel.startsWith("ai_") ? channel.slice(3) : channel;
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse `ai_tool-0` / `main-1` style React Flow handle ids. */
export function parseHandle(
  handle: string | null | undefined,
  fallback = "main",
): [string, number] {
  if (!handle) return [fallback, 0];
  const idx = handle.lastIndexOf("-");
  if (idx === -1) return [handle, 0];
  const channel = handle.slice(0, idx);
  const n = Number(handle.slice(idx + 1));
  return [channel || fallback, Number.isFinite(n) ? n : 0];
}

/**
 * Whether a connection between two handles is type-compatible.
 * AI channels must match exactly; main only connects to main.
 */
export function isCompatibleConnection(
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
): boolean {
  const [srcChannel] = parseHandle(sourceHandle);
  const [tgtChannel] = parseHandle(targetHandle);
  return srcChannel === tgtChannel;
}

export type HandleConnectRole = "idle" | "origin" | "compatible" | "incompatible";

export interface ConnectDragState {
  fromNodeId: string;
  fromHandleId: string | null;
  /** Handle type the user started dragging from. */
  fromType: "source" | "target";
  channel: string;
}

/**
 * Visual role of a handle while a connection drag is in progress.
 * Opposite handle type + same channel → compatible; everything else dimmed.
 */
export function handleConnectRole(
  drag: ConnectDragState | null,
  nodeId: string,
  handleId: string,
  handleType: "source" | "target",
): HandleConnectRole {
  if (!drag) return "idle";
  if (drag.fromNodeId === nodeId && drag.fromHandleId === handleId) return "origin";
  // Must land on the opposite side of the node graph (source→target or target→source)
  if (handleType === drag.fromType) return "incompatible";
  if (nodeId === drag.fromNodeId) return "incompatible";
  const [channel] = parseHandle(handleId);
  if (channel !== drag.channel) return "incompatible";
  return "compatible";
}

/** Compact key for useConnection selectors (stable string → fewer node re-renders). */
export function connectDragKey(
  inProgress: boolean,
  fromNodeId?: string | null,
  fromHandleId?: string | null,
  fromType?: string | null,
): string {
  if (!inProgress || !fromNodeId) return "";
  return `${fromNodeId}\0${fromHandleId ?? ""}\0${fromType ?? "source"}`;
}

export function parseConnectDragKey(key: string): ConnectDragState | null {
  if (!key) return null;
  const [fromNodeId, fromHandleId, fromType] = key.split("\0");
  if (!fromNodeId) return null;
  const [channel] = parseHandle(fromHandleId || null);
  return {
    fromNodeId,
    fromHandleId: fromHandleId || null,
    fromType: fromType === "target" ? "target" : "source",
    channel,
  };
}

/** Node types that expose `channel` as an output (can feed a target slot). */
export function nodesProvidingChannel(channel: string): INodeTypeDescription[] {
  return allNodeTypes().filter((d) => !d.placeholder && d.outputs.includes(channel));
}

/** Node types that accept `channel` as an input (can receive from a source slot). */
export function nodesAcceptingChannel(channel: string): INodeTypeDescription[] {
  return allNodeTypes().filter((d) => !d.placeholder && d.inputs.includes(channel));
}

/**
 * Expand static inputs for multi-index AI slots:
 * - ai_tool: one handle per existing connection index + one empty next slot
 * - ai_languageModel: second handle when needsFallback
 * - ai_outputParser: hidden when hasOutputParser is explicitly false
 */
export function expandAiInputs(
  inputs: string[],
  parameters: Record<string, unknown>,
  connectedCounts: Record<string, number> = {},
): string[] {
  const result: string[] = [];
  const needsFallback = Boolean(parameters.needsFallback);
  const hideParser = parameters.hasOutputParser === false;

  for (const channel of inputs) {
    if (channel === "ai_outputParser" && hideParser) continue;
    if (channel === "ai_languageModel") {
      result.push(channel);
      if (needsFallback) result.push(channel);
      continue;
    }
    if (channel === "ai_tool") {
      const connected = Math.max(0, connectedCounts[channel] ?? 0);
      const slots = Math.max(1, connected + 1);
      for (let i = 0; i < slots; i++) result.push(channel);
      continue;
    }
    result.push(channel);
  }
  return result;
}

/** Count max connection index+1 per target channel for a node. */
export function countIncomingByChannel(
  connections:
    | Record<
        string,
        Record<string, Array<Array<{ node: string; type?: string; index?: number }> | null> | null>
      >
    | null
    | undefined,
  targetNode: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!connections) return counts;
  for (const channels of Object.values(connections)) {
    for (const outputs of Object.values(channels)) {
      outputs?.forEach((targets) => {
        targets?.forEach((t) => {
          if (!t || t.node !== targetNode) return;
          const ch = t.type ?? "main";
          const idx = t.index ?? 0;
          counts[ch] = Math.max(counts[ch] ?? 0, idx + 1);
        });
      });
    }
  }
  return counts;
}
