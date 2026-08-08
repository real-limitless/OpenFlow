/** Shared init payload when placing a node from palette / drag / store. */

export type AddNodeInit = {
  /** Preferred canvas display name */
  name?: string;
  /** Merged over description defaults */
  parameters?: Record<string, unknown>;
};

export type OpenFlowNodeDragPayload = {
  type: string;
  name?: string;
  parameters?: Record<string, unknown>;
};

export const OPENFLOW_NODE_MIME = "application/openflow-node";

export function encodeNodeDragPayload(payload: OpenFlowNodeDragPayload): string {
  return JSON.stringify(payload);
}

/** Accept plain type string (legacy) or JSON payload. */
export function decodeNodeDragPayload(raw: string): OpenFlowNodeDragPayload | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as OpenFlowNodeDragPayload;
      if (parsed && typeof parsed.type === "string" && parsed.type.trim()) {
        return {
          type: parsed.type.trim(),
          name: typeof parsed.name === "string" ? parsed.name : undefined,
          parameters:
            parsed.parameters &&
            typeof parsed.parameters === "object" &&
            !Array.isArray(parsed.parameters)
              ? parsed.parameters
              : undefined,
        };
      }
    } catch {
      return null;
    }
    return null;
  }
  return { type: text };
}

export function normalizeAddNodeInit(init?: string | AddNodeInit): AddNodeInit {
  if (init == null) return {};
  if (typeof init === "string") return { name: init };
  return {
    name: init.name,
    parameters: init.parameters,
  };
}
