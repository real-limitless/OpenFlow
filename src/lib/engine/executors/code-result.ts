import type { INodeExecutionData } from "@/sdk";

export function normalizeCodeResult(result: unknown): INodeExecutionData[] {
  if (result === null || result === undefined) {
    throw new Error("Code node doesn't return an object");
  }
  if (Array.isArray(result)) {
    return result.map((r) => toExecutionData(r));
  }
  return [toExecutionData(result)];
}

export function toExecutionData(value: unknown): INodeExecutionData {
  if (value === null || value === undefined) {
    throw new Error("Code node doesn't return an object");
  }

  if (value && typeof value === "object" && "json" in value) {
    const item = value as INodeExecutionData;
    if (item.json === null || typeof item.json !== "object" || Array.isArray(item.json)) {
      throw new Error(
        "Code node output 'json' property must be an object, not an array or primitive",
      );
    }
    return {
      json: item.json as Record<string, unknown>,
      pairedItem: item.pairedItem,
      binary: item.binary,
    };
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { json: value as Record<string, unknown> };
  }

  return { json: { result: value } };
}
