import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";

export interface OutputParserHandle {
  type: "@n8n/n8n-nodes-langchain.outputParserStructured";
  schemaType: string;
  autoFix: boolean;
  parse(text: string): unknown;
  [key: string]: unknown;
}

type JsonType = "string" | "number" | "boolean" | "object" | "array" | "null";

interface JsonSchema {
  type?: JsonType;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  [key: string]: unknown;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveStringParam(ctx: ExecutionContext, name: string): string {
  const raw = ctx.getParam<unknown>(name, "");
  if (typeof raw !== "string") return "";
  if (raw.startsWith("=")) {
    const resolved = ctx.evaluate(raw, firstItemJson(ctx));
    return resolved != null ? String(resolved) : "";
  }
  return raw;
}

function jsonTypeOf(value: unknown): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "number") return "number";
  if (t === "string") return "string";
  if (t === "boolean") return "boolean";
  return "object";
}

function deriveSchemaFromExample(example: Record<string, unknown>): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const [key, value] of Object.entries(example)) {
    const type = jsonTypeOf(value);
    if (type === "object" && value !== null) {
      properties[key] = deriveSchemaFromExample(value as Record<string, unknown>);
    } else if (type === "array") {
      const arr = value as unknown[];
      properties[key] = {
        type: "array",
        items: arr.length > 0 ? { type: jsonTypeOf(arr[0]) } : {},
      };
    } else {
      properties[key] = { type };
    }
  }
  return {
    type: "object",
    properties,
    required: Object.keys(example),
  };
}

function containsRef(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  if (Array.isArray(schema)) return schema.some(containsRef);
  if ("$ref" in (schema as Record<string, unknown>)) return true;
  return Object.values(schema as Record<string, unknown>).some(containsRef);
}

function validateValue(value: unknown, schema: JsonSchema, path: string): string[] {
  const errors: string[] = [];
  if (schema.type) {
    const actual = jsonTypeOf(value);
    if (actual !== schema.type) {
      errors.push(`${path}: expected ${schema.type}, got ${actual}`);
    }
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path}: not in enum`);
  }
  if (
    schema.type === "object" &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const obj = value as Record<string, unknown>;
    if (schema.required) {
      for (const req of schema.required) {
        if (!(req in obj)) {
          errors.push(`${path}.${req}: missing required property`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (key in obj) {
          errors.push(...validateValue(obj[key], sub, `${path}.${key}`));
        }
      }
    }
  }
  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      errors.push(...validateValue(value[i], schema.items, `${path}[${i}]`));
    }
  }
  return errors;
}

function defaultForType(type: JsonType | undefined): unknown {
  switch (type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    case "null":
      return null;
    default:
      return null;
  }
}

function repairValue(value: unknown, schema: JsonSchema): unknown {
  if (!schema) return value;
  if (
    schema.type === "object" &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const obj = { ...(value as Record<string, unknown>) };
    if (schema.required) {
      for (const req of schema.required) {
        if (!(req in obj)) {
          const propSchema = schema.properties?.[req];
          obj[req] = defaultForType(propSchema?.type);
        }
      }
    }
    return obj;
  }
  return value;
}

function parseText(text: string, schema: JsonSchema, autoFix: boolean): unknown {
  let value: unknown;
  let parsed = false;
  try {
    value = JSON.parse(text);
    parsed = true;
  } catch {
    if (autoFix) {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          value = JSON.parse(text.slice(start, end + 1));
          parsed = true;
        } catch {
          // leave parsed = false
        }
      }
    }
  }
  if (!parsed) {
    throw new Error("Structured Output Parser: failed to parse output as JSON");
  }
  let errors = validateValue(value, schema, "output");
  if (errors.length > 0 && autoFix) {
    value = repairValue(value, schema);
    errors = validateValue(value, schema, "output");
  }
  if (errors.length > 0) {
    throw new Error(`Structured Output Parser: ${errors.join("; ")}`);
  }
  return value;
}

export const langchainOutputParserStructuredExecutor: NodeExecutor = async (ctx) => {
  const schemaType = ctx.getParam<string>("schemaType", "");
  const autoFix = ctx.getParam<boolean>("autoFix", false);

  let schema: JsonSchema;
  if (schemaType === "manual") {
    const raw = resolveStringParam(ctx, "inputSchema");
    if (!raw) {
      throw new Error(
        "Structured Output Parser: inputSchema is required in JSON Schema mode",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Structured Output Parser: inputSchema is not valid JSON");
    }
    if (containsRef(parsed)) {
      throw new Error("Structured Output Parser: $ref is not supported in JSON Schema");
    }
    schema = parsed as JsonSchema;
  } else {
    const raw = resolveStringParam(ctx, "jsonSchemaExample");
    if (!raw) {
      throw new Error(
        "Structured Output Parser: jsonSchemaExample is required in JSON Example mode",
      );
    }
    let example: unknown;
    try {
      example = JSON.parse(raw);
    } catch {
      throw new Error("Structured Output Parser: jsonSchemaExample is not valid JSON");
    }
    if (typeof example !== "object" || example === null || Array.isArray(example)) {
      throw new Error("Structured Output Parser: jsonSchemaExample must be a JSON object");
    }
    schema = deriveSchemaFromExample(example as Record<string, unknown>);
  }

  const handle: OutputParserHandle = {
    type: "@n8n/n8n-nodes-langchain.outputParserStructured",
    schemaType: schemaType || "example",
    autoFix,
    parse: (text: string) => parseText(text, schema, autoFix),
  };

  const out: INodeExecutionData[] = [
    { json: handle as unknown as Record<string, unknown> },
  ];
  return [out];
};