import type { IWorkflow } from "../../lib/workflow/types";

const JSON_FIELDS = ["nodes", "connections", "settings", "staticData", "pinData", "meta"] as const;

export const KNOWN_WORKFLOW_FIELDS = new Set([
  ...JSON_FIELDS,
  "id",
  "userId",
  "name",
  "active",
  "versionId",
  "createdAt",
  "updatedAt",
]);

function reviveExtraValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const s = value.trim();
  if (!(s.startsWith("{") || s.startsWith("["))) return value;
  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
}

export function serializeJsonFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (KNOWN_WORKFLOW_FIELDS.has(key)) {
      if (
        JSON_FIELDS.includes(key as (typeof JSON_FIELDS)[number]) &&
        value !== undefined &&
        value !== null &&
        typeof value !== "string"
      ) {
        out[key] = JSON.stringify(value);
      } else {
        out[key] = value;
      }
    } else if (value !== undefined) {
      extras[key] = reviveExtraValue(value);
    }
  }

  out.extra = Object.keys(extras).length > 0 ? JSON.stringify(extras) : null;
  return out;
}

export function deserializeJsonFields(row: Record<string, unknown>): IWorkflow {
  const out: Record<string, unknown> = { ...row };
  for (const key of JSON_FIELDS) {
    if (typeof out[key] === "string") {
      try {
        out[key] = JSON.parse(out[key] as string);
      } catch {
        out[key] = key === "settings" || key === "connections" ? {} : key === "nodes" ? [] : null;
      }
    }
  }
  // DB null / missing JSON blobs → safe empty values so parseWorkflowJson accepts the graph
  if (out.settings == null || typeof out.settings !== "object" || Array.isArray(out.settings)) {
    out.settings = {};
  }
  if (out.connections == null || typeof out.connections !== "object" || Array.isArray(out.connections)) {
    out.connections = {};
  }
  if (!Array.isArray(out.nodes)) {
    out.nodes = [];
  }
  if (typeof out.extra === "string") {
    try {
      const parsed = JSON.parse(out.extra as string) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        out[k] = reviveExtraValue(v);
      }
    } catch {
      /* ignore */
    }
    delete out.extra;
  }
  out.createdAt = (out.createdAt as Date)?.toISOString?.() ?? out.createdAt;
  out.updatedAt = (out.updatedAt as Date)?.toISOString?.() ?? out.updatedAt;
  return out as IWorkflow;
}
