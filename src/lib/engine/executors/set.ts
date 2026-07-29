import type { NodeExecutor } from "../types";
import type { INodeExecutionData } from "../../workflow/types";
import { evaluateExpression } from "../../expressions/evaluate";

interface FieldValue {
  name?: string;
  type?: string;
  value?: unknown;
}

const TYPE_MAP: Record<string, string> = {
  stringValue: "string",
  numberValue: "number",
  booleanValue: "boolean",
  arrayValue: "array",
  objectValue: "object",
};

export const setExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const items: INodeExecutionData[] = inputItems.length > 0 ? inputItems : [{ json: {} }];

  const mode = (node.parameters.mode as string) ?? "manual";

  if (mode === "raw") {
    const rawJson = node.parameters.jsonOutput;
    const parsed = typeof rawJson === "string" ? safeParse(rawJson) : rawJson;
    return [
      items.map((item, idx) => ({
        json:
          typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? { ...(parsed as Record<string, unknown>) }
            : { value: parsed },
        binary: item.binary,
        pairedItem: item.pairedItem ?? { item: idx, input: 0 },
      })),
    ];
  }

  const fieldsContainer = node.parameters.fields as
    { values?: FieldValue[] } | FieldValue[] | undefined;

  const fields: FieldValue[] = Array.isArray(fieldsContainer)
    ? fieldsContainer
    : (fieldsContainer?.values ?? []);

  const includeOther = node.parameters.includeOtherFields === true;

  return [
    items.map((item, idx) => {
      const json: Record<string, unknown> = includeOther ? { ...item.json } : {};
      for (const field of fields) {
        const name = field.name;
        if (!name) continue;
        let value = field.value;

        if (typeof value === "string") {
          const result = evaluateExpression(value, { json: item.json });
          if (result.ok) value = result.value;
        }

        const targetType = TYPE_MAP[field.type ?? "stringValue"] ?? "string";
        value = coerceType(value, targetType);

        json[name] = value;
      }
      return { json, binary: item.binary, pairedItem: item.pairedItem ?? { item: idx, input: 0 } };
    }),
  ];
};

function coerceType(value: unknown, targetType: string): unknown {
  switch (targetType) {
    case "number":
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const n = Number(value);
        return isNaN(n) ? 0 : n;
      }
      return 0;
    case "boolean":
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value === "true" || value === "1";
      return Boolean(value);
    case "array":
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        const parsed = safeParse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      }
      return [value];
    case "object":
      if (typeof value === "object" && value !== null && !Array.isArray(value)) return value;
      if (typeof value === "string") {
        const parsed = safeParse(value);
        return typeof parsed === "object" && parsed !== null ? parsed : { raw: parsed };
      }
      return { raw: value };
    default:
      return value;
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
