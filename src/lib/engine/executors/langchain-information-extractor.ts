import type { NodeExecutor, INodeExecutionData, ExecutionContext, IWorkflow } from "@/sdk";
import { withPairedItem } from "@/sdk";

interface ModelInvokeResult {
  text: string;
  [key: string]: unknown;
}

interface ModelHandle {
  type?: string;
  model?: string;
  invoke(messages: Array<{ role: string; content: string }>): Promise<ModelInvokeResult>;
}

interface SubNodeRef {
  name: string;
  index: number;
}

interface AttributeEntry {
  name: string;
  description?: string;
}

function findConnectedModel(
  connections: IWorkflow["connections"],
  nodeName: string,
): SubNodeRef | null {
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets) continue;
        for (const t of targets) {
          if (!t || t.node !== nodeName) continue;
          if (t.type === "ai_languageModel") {
            return { name: sourceName, index: t.index ?? 0 };
          }
        }
      }
    }
  }
  return null;
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

function resolveText(ctx: ExecutionContext, raw: unknown, itemJson: Record<string, unknown>): string {
  if (typeof raw !== "string") return "";
  if (raw.startsWith("=")) {
    const resolved = ctx.evaluate(raw, itemJson);
    return resolved != null ? String(resolved) : "";
  }
  return raw;
}

function buildSchemaFromAttributes(attributes: unknown): Record<string, unknown> {
  if (!Array.isArray(attributes)) return {};
  const properties: Record<string, unknown> = {};
  for (const attr of attributes) {
    const entry = attr as AttributeEntry;
    if (entry.name) {
      properties[entry.name] = { description: entry.description ?? "" };
    }
  }
  return { type: "object", properties, required: Object.keys(properties) };
}

function buildSchemaFromJsonExample(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const example = JSON.parse(raw);
    if (typeof example !== "object" || example === null) return {};
    const properties: Record<string, unknown> = {};
    for (const key of Object.keys(example)) {
      const val = example[key];
      let propType = "string";
      if (typeof val === "number") propType = "number";
      else if (typeof val === "boolean") propType = "boolean";
      else if (Array.isArray(val)) propType = "array";
      else if (val === null) propType = "string";
      properties[key] = { type: propType };
    }
    return { type: "object", properties, required: Object.keys(properties) };
  } catch {
    return {};
  }
}

function buildSchemaFromManual(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const schema = JSON.parse(raw);
    if (typeof schema !== "object" || schema === null) return {};
    return schema as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildSchema(ctx: ExecutionContext): Record<string, unknown> {
  const schemaType = ctx.getParam<string>("schemaType", "fromAttributes");
  if (schemaType === "fromAttributes") {
    const attributesRaw = ctx.getParam<unknown>("attributes", {});
    const messageValues =
      attributesRaw &&
      typeof attributesRaw === "object" &&
      Array.isArray((attributesRaw as { values?: unknown }).values)
        ? (attributesRaw as { values: unknown[] }).values
        : [];
    return buildSchemaFromAttributes(messageValues);
  }
  if (schemaType === "fromJson") {
    const example = ctx.getParam<string>("jsonSchemaExample", "");
    return buildSchemaFromJsonExample(example);
  }
  if (schemaType === "manual") {
    const raw = ctx.getParam<string>("inputSchema", "");
    return buildSchemaFromManual(raw);
  }
  return {};
}

function schemaToPrompt(schema: Record<string, unknown>): string {
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return "{}";
  }
}

const DEFAULT_SYSTEM_PROMPT =
  "You are an information extraction assistant. Extract structured information from the provided text according to the specified schema. Return ONLY valid JSON that conforms to the schema. Do not include any text outside the JSON object.";

export const langchainInformationExtractorExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const workflow = ctx.getWorkflow();

  const modelRef = findConnectedModel(workflow.connections, node.name);
  if (!modelRef) {
    throw new Error("A Language Model sub-node must be connected");
  }

  const modelHandle = getModelHandle(ctx, modelRef.name);
  if (!modelHandle) {
    throw new Error("A Language Model sub-node must be connected");
  }

  const schema = buildSchema(ctx);
  const schemaJson = schemaToPrompt(schema);

  const customSystemPrompt = ctx.getParam<string>("systemPrompt", "");
  const systemPrompt = customSystemPrompt
    ? `${customSystemPrompt}\n\nOutput schema:\n${schemaJson}`
    : `${DEFAULT_SYSTEM_PROMPT}\n\nOutput schema:\n${schemaJson}`;

  const formatInstruction =
    "\n\nYou MUST respond with a JSON object only. The JSON object must conform to the schema above. Do not include any explanation, markdown formatting, or text outside the JSON object.";

  const continueOnFail = ctx.continueOnFail();
  const outputItems: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: itemIndex, input: 0 };

    try {
      const text = resolveText(ctx, ctx.getParam<unknown>("text", ""), itemJson);
      if (!text) {
        throw new Error("Text input is empty or missing");
      }

      const messages = [
        { role: "system" as const, content: systemPrompt + formatInstruction },
        { role: "user" as const, content: text },
      ];

      let result: ModelInvokeResult;
      try {
        result = await modelHandle.invoke(messages);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Model invocation failed: ${detail}`);
      }
      const finalText = result.text ?? "";

      let output: unknown;
      try {
        output = JSON.parse(finalText);
      } catch {
        throw new Error("Model response is not valid JSON");
      }

      outputItems.push({ json: { output }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const error = err instanceof Error ? err.message : String(err);
      outputItems.push({ json: { error }, pairedItem });
    }
  }

  return [outputItems];
};
