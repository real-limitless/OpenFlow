import type { INodeProperties, INodeTypeDescription } from "@/lib/nodes/types";
import { isShellNodeType } from "./shell";

function collectOps(props: INodeProperties[] | undefined, depth = 0): string[] {
  if (!props || depth > 2) return [];
  const out: string[] = [];
  for (const p of props) {
    if (p.name === "operation" || p.name === "resource" || p.displayName === "Operation") {
      if (Array.isArray(p.options)) {
        for (const o of p.options) {
          if (o && typeof o === "object" && "name" in o && "value" in o) {
            const opt = o as { name?: string; value?: unknown; action?: string };
            const label = opt.action || opt.name || String(opt.value ?? "");
            if (label) out.push(String(label));
          }
        }
      }
    }
    if (Array.isArray(p.options)) {
      for (const o of p.options) {
        if (o && typeof o === "object" && "values" in o) {
          out.push(...collectOps((o as { values?: INodeProperties[] }).values, depth + 1));
        }
      }
    }
  }
  return out;
}

/** Short “when to use” line for agents and palette. */
export function whenToUseFor(desc: INodeTypeDescription | undefined, isShell: boolean): string {
  if (!desc) return "";
  if (isShell || isShellNodeType(desc.name, desc.displayName, desc.description ?? "")) {
    return "Last resort host shell — prefer a domain node when one exists for this task.";
  }
  const cat = String(desc.category ?? "");
  if (cat === "AI Tool" || cat === "AI") {
    return "Connect on ai_tool / ai_languageModel to an AI Agent or chain.";
  }
  if (Array.isArray(desc.group) && desc.group.includes("trigger")) {
    return "Start a workflow when this event fires (no main input).";
  }
  return desc.description?.slice(0, 140) || `Use for ${desc.displayName} automation.`;
}

/** Spec/ops-backed usage hint (operations list or description). */
export function usageSnippetFor(desc: INodeTypeDescription | undefined): string {
  if (!desc) return "";
  const ops = [...new Set(collectOps(desc.properties as INodeProperties[] | undefined))].slice(0, 8);
  if (ops.length > 0) {
    return `Operations: ${ops.join(" · ")}`;
  }
  const d = (desc.description ?? "").trim();
  return d.length > 180 ? `${d.slice(0, 177)}…` : d;
}

export function enrichSuggestedFields(desc: INodeTypeDescription | undefined, isShell: boolean) {
  return {
    icon: desc?.icon ?? "Box",
    usageSnippet: usageSnippetFor(desc),
    whenToUse: whenToUseFor(desc, isShell),
  };
}
