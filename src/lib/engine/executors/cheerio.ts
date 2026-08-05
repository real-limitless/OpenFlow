import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems, withPairedItem } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";
import {
  parseHtml,
  querySelectorAll,
  getTextContent,
  getInnerHTML,
  getElementValue,
  trimValue,
  cleanUpTextFn,
} from "./html";

interface ExtractionRow {
  key: string;
  cssSelector: string;
  returnValue: string;
  attributeName?: string;
  skipSelectors?: string;
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  if (key.includes(".")) {
    const parts = key.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
  return obj[key];
}

function extractValue(
  element: import("./html").HtmlElement,
  row: ExtractionRow,
  trim: boolean,
  cleanUp: boolean,
): unknown {
  let value: unknown;

  switch (row.returnValue) {
    case "attribute":
      value = row.attributeName ? element.attributes[row.attributeName] : undefined;
      break;
    case "html":
      value = getInnerHTML(element);
      break;
    case "text":
      value = getTextContent(element, row.skipSelectors ?? "");
      break;
    case "value":
      value = getElementValue(element);
      break;
    default:
      value = getTextContent(element, "");
  }

  if (value === undefined) return undefined;

  let s = String(value);
  if (trim) s = trimValue(s);
  if (cleanUp) s = cleanUpTextFn(s);
  return s;
}

function generateHtmlTemplate(
  items: INodeExecutionData[],
  template: string,
): INodeExecutionData[] {
  return items.map((item, idx) => {
    const blocks: string[] = [];
    const placeholderTemplate = template.replace(
      /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,
      (block) => {
        blocks.push(block);
        return `\x00BLOCK${blocks.length - 1}\x00`;
      },
    );

    const result = evaluateExpression(placeholderTemplate, {
      json: item.json,
      itemIndex: idx,
    });
    let rendered =
      result.ok && result.value != null ? String(result.value) : placeholderTemplate;

    rendered = rendered.replace(/\x00BLOCK(\d+)\x00/g, (_, i) => blocks[parseInt(i, 10)]);

    return {
      json: { ...item.json, data: rendered },
      pairedItem: item.pairedItem ?? { item: idx, input: 0 },
    };
  });
}

function capitalizeHeader(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCell(value: unknown): string {
  if (typeof value === "boolean") {
    return value
      ? '<input type="checkbox" checked="checked"/>'
      : '<input type="checkbox" />';
  }
  if (value == null) return "";
  return escapeHtml(String(value));
}

function resolveAttribute(
  attr: string,
  item: INodeExecutionData,
  idx: number,
): string {
  if (!attr) return "";
  if (attr.includes("{{")) {
    const result = evaluateExpression(attr, { json: item.json, itemIndex: idx });
    return result.ok && typeof result.value === "string" ? result.value : attr;
  }
  return attr;
}

function convertToHtmlTable(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
): INodeExecutionData[] {
  if (items.length === 0) return [];

  const capitalizeHeaders = ctx.getParam<boolean>("capitalizeHeaders", true);
  const customStyling = ctx.getParam<boolean>("customStyling", false);
  const caption = ctx.getParam<string>("caption", "");
  const tableAttributes = ctx.getParam<string>("tableAttributes", "");
  const headerAttributes = ctx.getParam<string>("headerAttributes", "");
  const rowAttributes = ctx.getParam<string>("rowAttributes", "");
  const cellAttributes = ctx.getParam<string>("cellAttributes", "");

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of items) {
    for (const k of Object.keys(item.json)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }

  const headers = keys.map((k) => (capitalizeHeaders ? capitalizeHeader(k) : k));

  const tableStyle = customStyling ? "" : ' style="border-collapse: collapse;"';
  const thStyle = customStyling
    ? ""
    : ' style="border: 1px solid black; padding: 5px; text-align: left;"';
  const tdStyle = customStyling ? "" : ' style="border: 1px solid black; padding: 5px;"';

  const parts: string[] = [];

  parts.push(`<table${tableStyle}${tableAttributes ? " " + tableAttributes : ""}>`);

  if (caption) {
    parts.push(`<caption>${escapeHtml(caption)}</caption>`);
  }

  parts.push("<thead>");
  parts.push("<tr>");
  for (const h of headers) {
    parts.push(
      `<th${thStyle}${headerAttributes ? " " + headerAttributes : ""}>${escapeHtml(h)}</th>`,
    );
  }
  parts.push("</tr>");
  parts.push("</thead>");

  parts.push("<tbody>");
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const resolvedRowAttrs = resolveAttribute(rowAttributes, item, i);
    parts.push(`<tr${resolvedRowAttrs ? " " + resolvedRowAttrs : ""}>`);
    for (const k of keys) {
      const v = item.json[k];
      const resolvedCellAttrs = resolveAttribute(cellAttributes, item, i);
      const cellContent = renderCell(v);
      parts.push(
        `<td${tdStyle}${resolvedCellAttrs ? " " + resolvedCellAttrs : ""}>${cellContent}</td>`,
      );
    }
    parts.push("</tr>");
  }
  parts.push("</tbody>");

  parts.push("</table>");

  const tableStr = parts.join("");

  return [
    {
      json: { data: tableStr },
      pairedItem: items.map((_, i) => ({ item: i, input: 0 })),
    },
  ];
}

async function extractHtmlContent(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const sourceData = ctx.getParam<string>("sourceData", "json");
  const jsonProperty = ctx.getParam<string>("jsonProperty", "data");
  const inputBinaryField = ctx.getParam<string>("inputBinaryField", "data");
  const extractionValues = ctx.getParam<{ values?: ExtractionRow[] }>("extractionValues", {}) ?? {};
  const rows = extractionValues.values ?? [];
  const returnArray = ctx.getParam<boolean>("returnArray", false);
  const trimValues = ctx.getParam<boolean>("trimValues", true);
  const cleanUp = ctx.getParam<boolean>("cleanUpText", true);
  const continueOnFail = ctx.continueOnFail();

  const output: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    let htmlStrings: string[];

    try {
      if (sourceData === "binary") {
        const fieldName = inputBinaryField || "data";
        const bin = item.binary?.[fieldName];
        if (!bin) {
          throw new Error(`No binary field named "${fieldName}" exists`);
        }
        const text = Buffer.from(bin.data, "base64").toString("utf8");
        htmlStrings = [text];
      } else {
        const value = jsonProperty ? getNestedValue(item.json, jsonProperty) : undefined;
        if (value === undefined) {
          throw new Error(`No property named "${jsonProperty}" exists`);
        }
        htmlStrings = Array.isArray(value) ? value.map(String) : [String(value)];
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      output.push({
        json: { error: err instanceof Error ? err.message : String(err) },
        pairedItem: item.pairedItem ?? { item: itemIndex, input: 0 },
      });
      continue;
    }

    for (const htmlStr of htmlStrings) {
      const root = parseHtml(htmlStr);
      const extracted: Record<string, unknown> = {};

      for (const row of rows) {
        const elements = querySelectorAll(root, row.cssSelector);
        if (elements.length === 0) {
          if (returnArray) {
            extracted[row.key] = [];
          }
          continue;
        }

        if (returnArray) {
          extracted[row.key] = elements.map((el) => extractValue(el, row, trimValues, cleanUp));
        } else {
          extracted[row.key] = extractValue(elements[0], row, trimValues, cleanUp);
        }
      }

      const resultJson: Record<string, unknown> = { ...item.json };
      for (const [k, v] of Object.entries(extracted)) {
        resultJson[k] = v;
      }

      output.push({
        json: resultJson,
        pairedItem: withPairedItem(item, itemIndex),
      });
    }
  }

  return output;
}

export const cheerioExecutor: NodeExecutor = async (ctx) => {
  const items: INodeExecutionData[] = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "extractHtmlContent");

  switch (operation) {
    case "extractHtmlContent":
      return [await extractHtmlContent(ctx, items)];
    case "generateHtmlTemplate": {
      const template = ctx.getParam<string>("template", "");
      return [generateHtmlTemplate(items, template)];
    }
    case "convertToHtmlTable": {
      return [convertToHtmlTable(ctx, items)];
    }
    default:
      throw new Error(`cheerio: unknown operation "${operation}"`);
  }
};
