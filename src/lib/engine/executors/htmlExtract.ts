import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems, withPairedItem } from "@/sdk";
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
  attribute?: string;
  skipSelectors?: string;
  returnArray?: boolean;
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
    case "Attribute":
    case "attribute":
      value = row.attribute ? element.attributes[row.attribute] : undefined;
      break;
    case "HTML":
    case "html":
      value = getInnerHTML(element);
      break;
    case "Text":
    case "text":
      value = getTextContent(element, row.skipSelectors ?? "");
      break;
    case "Value":
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

export const htmlExtractExecutor: NodeExecutor = async (ctx) => {
  const items: INodeExecutionData[] = ensureItems(ctx.getInputItems(0));

  const sourceData = ctx.getParam<string>("sourceData", "JSON");
  const jsonProperty = ctx.getParam<string>("jsonProperty", "");
  const inputBinaryField = ctx.getParam<string>("inputBinaryField", "");
  const extractionValuesParam = ctx.getParam<{ values?: ExtractionRow[] }>("extractionValues", {}) ?? {};
  const rows = extractionValuesParam.values ?? [];
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const trimValues = options.trimValues === true;
  const cleanUp = options.cleanUpText === true;
  const continueOnFail = ctx.continueOnFail();

  const output: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    let htmlStrings: string[];

    try {
      if (sourceData === "Binary") {
        const fieldName = inputBinaryField || "data";
        const bin = item.binary?.[fieldName];
        if (!bin) {
          throw new Error(`No binary field named "${fieldName}" exists`);
        }
        const text = Buffer.from(bin.data, "base64").toString("utf8");
        htmlStrings = [text];
      } else {
        const value = jsonProperty
          ? getNestedValue(item.json, jsonProperty)
          : undefined;
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
          if (row.returnArray) {
            extracted[row.key] = [];
          }
          continue;
        }

        if (row.returnArray) {
          extracted[row.key] = elements.map((el) =>
            extractValue(el, row, trimValues, cleanUp),
          );
        } else {
          extracted[row.key] = extractValue(elements[0], row, trimValues, cleanUp);
        }
      }

      output.push({
        json: { ...item.json, htmlExtract: extracted },
        pairedItem: withPairedItem(item, itemIndex),
      });
    }
  }

  return [output];
};
