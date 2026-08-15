import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";
import { parseFormElements } from "@/lib/forms/path";
import { evaluateExpression, isExpression } from "@/lib/expressions/evaluate";

function resolveAgainstItem(
  raw: unknown,
  itemJson: Record<string, unknown>,
  nodeData?: Record<string, { json: Record<string, unknown> }[]>,
): string {
  if (raw == null) return "";
  if (typeof raw !== "string") return String(raw);
  if (!isExpression(raw) && !raw.includes("{{")) return raw;
  const result = evaluateExpression(raw, {
    json: itemJson,
    nodeData: nodeData as never,
  });
  if (result.ok && result.value != null) return String(result.value);
  return raw;
}

export const formExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const operation = ctx.getParam<string>("operation", "form");

  if (operation === "completion") {
    if (items.length === 0) {
      return [
        [
          {
            json: {
              formCompletion: {
                title: "Done",
                message: "",
                pageTitle: "Submitted",
              },
            },
          },
        ],
      ];
    }

    const titleRaw = ctx.getParam<unknown>("completionTitle", "");
    const messageRaw = ctx.getParam<unknown>("completionMessage", "");
    const pageTitleRaw = ctx.getParam<unknown>("completionPageTitle", "");

    return [
      items.map((item, idx) => {
        const base = { ...(item.json ?? {}) };
        const title =
          resolveAgainstItem(titleRaw, base) ||
          String(base.priceLine ?? base.symbol ?? "Done");
        const message =
          resolveAgainstItem(messageRaw, base) ||
          String(base.reportHtml ?? base.reportText ?? "");
        const pageTitle =
          resolveAgainstItem(pageTitleRaw, base) || title || "Submitted";
        return withPairedItem(
          {
            ...item,
            json: {
              ...base,
              formCompletion: {
                title,
                message,
                pageTitle,
              },
            },
          },
          idx,
        );
      }),
    ];
  }

  const formFieldsRaw = ctx.getParam<unknown>("formFields", []);
  const fields = parseFormElements(formFieldsRaw);

  if (items.length === 0) return [[{ json: {} }]];

  return [
    items.map((item, idx) => {
      const json = { ...item.json };
      for (const f of fields) {
        const name = f.fieldName;
        if (!name) continue;
        if (name in json) continue;
        if (f.elementType === "hidden" && f.fieldValue !== undefined) {
          json[name] = f.fieldValue;
        } else if (f.defaultValue !== undefined) {
          json[name] = f.defaultValue;
        }
      }
      return { ...item, json, pairedItem: item.pairedItem ?? { item: idx, input: 0 } };
    }),
  ];
};
