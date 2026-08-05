import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface FacebookLeadChangeValue {
  leadgen_id?: string;
  created_time?: number;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  field_data?: Array<{ name: string; values?: string[] }>;
  [key: string]: unknown;
}

interface FacebookLeadChange {
  field: string;
  value: FacebookLeadChangeValue;
}

interface FacebookLeadEntry {
  changes?: FacebookLeadChange[];
  [key: string]: unknown;
}

interface FacebookLeadPayload {
  entry?: FacebookLeadEntry[];
  [key: string]: unknown;
}

export const facebookLeadAdsTriggerExecutor: NodeExecutor = async function (ctx) {
  const items = ctx.getInputItems(0);
  const result: INodeExecutionData[] = [];

  for (const item of items) {
    const body = item.json as FacebookLeadPayload;
    const entries = body.entry ?? [];

    for (const entry of entries) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        if (change.field === "leadgen") {
          result.push({ json: change.value as Record<string, unknown> });
        }
      }
    }
  }

  return [result];
};
