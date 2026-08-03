import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface TypeformField {
  id: string;
  title: string;
}

interface TypeformAnswer {
  field: { id: string };
  type: string;
  [key: string]: unknown;
}

interface TypeformPayload {
  form_response?: {
    definition?: { fields?: TypeformField[] };
    answers?: TypeformAnswer[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const typeformTriggerExecutor: NodeExecutor = async function (ctx) {
  const simplify = ctx.getParam<boolean>("simplifyAnswers", true);
  const onlyAns = ctx.getParam<boolean>("onlyAnswers", true);
  const items = ctx.getInputItems(0);

  const result: INodeExecutionData[] = items.map((item) => {
    const body = item.json as TypeformPayload;

    if (!body.form_response || !body.form_response.definition || !body.form_response.answers) {
      throw new Error("Missing payload structure: form_response, definition, or answers are missing");
    }

    if (!simplify && !onlyAns) {
      return { json: body };
    }

    const { definition, answers } = body.form_response;

    const fields = definition?.fields ?? [];
    const titleMap = new Map<string, string>();
    for (const f of fields) {
      const sanitized = f.title.replace(/\{\{/g, "[").replace(/\}\}/g, "]");
      titleMap.set(f.id, sanitized);
    }

    let simplified: Record<string, unknown>;
    if (simplify) {
      simplified = {};
      for (const a of answers) {
        const title = titleMap.get(a.field.id) ?? a.field.id;
        simplified[title] = extractValue(a);
      }
    } else {
      simplified = {};
      for (const a of answers) {
        simplified[a.field.id] = a;
      }
    }

    let outputJson: Record<string, unknown>;
    if (onlyAns) {
      outputJson = simplified;
    } else {
      outputJson = { form_response: { definition, answers: simplified } };
    }

    return { json: outputJson };
  });

  return [result];
};

function extractValue(answer: TypeformAnswer): unknown {
  if (answer.label !== undefined) return answer.label;
  if (answer.labels !== undefined) return answer.labels;
  const { field, type, ...rest } = answer;
  for (const key of Object.keys(rest)) {
    const val = rest[key];
    if (val !== null && val !== undefined) return val;
  }
  return null;
}
