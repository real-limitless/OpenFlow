import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";

interface FieldValue {
  name?: string;
  type?: string;
  stringValue?: string;
  numberValue?: string;
  booleanValue?: string;
  arrayValue?: string;
  objectValue?: string;
}

interface FieldsParam {
  values?: FieldValue[];
}

interface Document {
  pageContent: string;
  metadata: Record<string, unknown>;
}

export interface RetrieverWorkflowHandle {
  type: "@n8n/n8n-nodes-langchain.retrieverWorkflow";
  getRelevantDocuments: (query: string) => Promise<Document[]>;
  invoke: (input: { query: string }) => Promise<Document[]>;
}

function coerceFieldValue(field: FieldValue): unknown {
  const type = field.type ?? "stringValue";
  switch (type) {
    case "numberValue": {
      const n = Number(field.numberValue);
      return isNaN(n) ? 0 : n;
    }
    case "booleanValue":
      return field.booleanValue === "true";
    case "arrayValue": {
      try {
        return JSON.parse(field.arrayValue ?? "[]");
      } catch {
        return [];
      }
    }
    case "objectValue": {
      try {
        return JSON.parse(field.objectValue ?? "{}");
      } catch {
        return {};
      }
    }
    default:
      return String(field.stringValue ?? "");
  }
}

function assembleInputValues(rawFields: FieldsParam | undefined): Record<string, unknown> {
  const inputValues: Record<string, unknown> = {};
  const fieldValues = rawFields?.values ?? [];
  for (const field of fieldValues) {
    if (!field.name) continue;
    inputValues[field.name] = coerceFieldValue(field);
  }
  return inputValues;
}

function mapToDocuments(items: INodeExecutionData[]): Document[] {
  return items.map((item) => {
    const json = item.json ?? {};
    return {
      pageContent: String(json.pageContent ?? json.content ?? JSON.stringify(json)),
      metadata: (json.metadata as Record<string, unknown>) ?? {},
    };
  });
}

export const retrieverWorkflowExecutor: NodeExecutor = async (ctx) => {
  const source = ctx.getParam<string>("source", "database");
  const continueOnFail = ctx.continueOnFail();

  let workflowId: string | undefined;
  let resolvedWorkflowJson: string | undefined;

  if (source === "parameter") {
    const raw = ctx.getParam<string>("workflowJson", "");
    if (!raw) {
      throw new Error("workflowJson is required when source is 'parameter'");
    }
    resolvedWorkflowJson = raw;
  } else {
    workflowId = ctx.getParam<string>("workflowId", "");
    if (!workflowId) {
      throw new Error("workflowId is required when source is 'database'");
    }
  }

  const rawFields = ctx.getParam<FieldsParam>("fields", {});
  const inputValues = assembleInputValues(rawFields);

  async function runSub(): Promise<INodeExecutionData[]> {
    if (!ctx.runSubWorkflow) {
      throw new Error("Sub-workflow execution is not available in this context");
    }
    const childItems = await ctx.runSubWorkflow({
      workflowId,
      workflowJson: resolvedWorkflowJson
        ? (JSON.parse(resolvedWorkflowJson) as Parameters<NonNullable<typeof ctx.runSubWorkflow>>[0]["workflowJson"])
        : undefined,
      items: [{ json: inputValues }],
    });
    return childItems;
  }

  const handle: RetrieverWorkflowHandle = {
    type: "@n8n/n8n-nodes-langchain.retrieverWorkflow",
    async getRelevantDocuments(_query: string) {
      try {
        const childItems = await runSub();
        return mapToDocuments(childItems);
      } catch (err) {
        if (continueOnFail) {
          return [{ pageContent: `Retriever workflow failed: ${err instanceof Error ? err.message : String(err)}`, metadata: {} }];
        }
        throw err;
      }
    },
    async invoke(input: { query: string }) {
      return this.getRelevantDocuments(input.query);
    },
  };

  const retrieverItem: INodeExecutionData = {
    json: handle as unknown as Record<string, unknown>,
  };

  return [[retrieverItem]];
};
