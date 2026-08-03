import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

// ---------------------------------------------------------------------------
// Minimal HTML parser + CSS selector engine
// ---------------------------------------------------------------------------

export interface HtmlElement {
  tag: string;
  attributes: Record<string, string>;
  children: HtmlNode[];
  parentNode: HtmlElement | null;
}

export interface HtmlTextNode {
  type: "text";
  text: string;
  parentNode: HtmlElement | null;
}

type HtmlNode = HtmlElement | HtmlTextNode;

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)'|\s*=\s*([^\s>]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = {
    tag: "#document",
    attributes: {},
    children: [],
    parentNode: null,
  };
  const stack: HtmlElement[] = [root];
  const tagRegex =
    /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      const text = html.slice(lastIndex, match.index);
      const current = stack[stack.length - 1];
      current.children.push({ type: "text", text, parentNode: current });
    }

    const isClosing = match[0][1] === "/";
    const tag = match[1].toLowerCase();
    const attrStr = match[2] ?? "";

    if (isClosing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else {
      const attributes = parseAttributes(attrStr);
      const isSelfClosing = attrStr.trimEnd().endsWith("/") || VOID_ELEMENTS.has(tag);
      const element: HtmlElement = {
        tag,
        attributes,
        children: [],
        parentNode: stack[stack.length - 1],
      };
      stack[stack.length - 1].children.push(element);
      if (!isSelfClosing) {
        stack.push(element);
      }
    }

    lastIndex = tagRegex.lastIndex;
  }

  if (lastIndex < html.length) {
    const text = html.slice(lastIndex);
    const current = stack[stack.length - 1];
    current.children.push({ type: "text", text, parentNode: current });
  }

  return root;
}

// --- CSS selector engine ---

interface CompoundSelector {
  tag: string | null;
  classes: string[];
  id: string | null;
}

function parseCompoundSelector(s: string): CompoundSelector {
  const result: CompoundSelector = { tag: null, classes: [], id: null };
  const regex = /([a-zA-Z][a-zA-Z0-9]*)|\.([a-zA-Z0-9_-]+)|#([a-zA-Z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(s)) !== null) {
    if (m[1]) result.tag = m[1].toLowerCase();
    else if (m[2]) result.classes.push(m[2]);
    else if (m[3]) result.id = m[3];
  }
  return result;
}

function matchesCompound(element: HtmlElement, selector: CompoundSelector): boolean {
  if (selector.tag && element.tag !== selector.tag) return false;
  if (selector.id && element.attributes["id"] !== selector.id) return false;
  if (selector.classes.length > 0) {
    const elementClasses = (element.attributes["class"] ?? "").split(/\s+/);
    for (const cls of selector.classes) {
      if (!elementClasses.includes(cls)) return false;
    }
  }
  return true;
}

function getAllElements(root: HtmlElement): HtmlElement[] {
  const result: HtmlElement[] = [];
  function walk(node: HtmlElement) {
    for (const child of node.children) {
      if ("type" in child && child.type === "text") continue;
      const el = child as HtmlElement;
      result.push(el);
      walk(el);
    }
  }
  walk(root);
  return result;
}

function queryDescendants(root: HtmlElement, compounds: CompoundSelector[]): HtmlElement[] {
  if (compounds.length === 0) return [];

  const last = compounds[compounds.length - 1];
  const ancestors = compounds.slice(0, -1);
  const allElements = getAllElements(root);
  const matched: HtmlElement[] = [];

  for (const el of allElements) {
    if (!matchesCompound(el, last)) continue;
    if (ancestors.length === 0) {
      matched.push(el);
      continue;
    }
    let current: HtmlElement | null = el.parentNode;
    let ancestorIdx = ancestors.length - 1;
    while (current && ancestorIdx >= 0) {
      if (matchesCompound(current, ancestors[ancestorIdx])) {
        ancestorIdx--;
      }
      current = current.parentNode;
    }
    if (ancestorIdx < 0) {
      matched.push(el);
    }
  }

  return matched;
}

export function querySelectorAll(root: HtmlElement, selector: string): HtmlElement[] {
  const groups = selector
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const results: HtmlElement[] = [];
  const seen = new Set<HtmlElement>();

  for (const group of groups) {
    const compounds = group.split(/\s+/).map(parseCompoundSelector);
    const matches = queryDescendants(root, compounds);
    for (const el of matches) {
      if (!seen.has(el)) {
        seen.add(el);
        results.push(el);
      }
    }
  }

  return results;
}

// --- Extraction helpers ---

export function getTextContent(element: HtmlElement, skipSelectors: string): string {
  const skipSet = skipSelectors
    ? new Set(querySelectorAll(element, skipSelectors))
    : new Set<HtmlElement>();

  let text = "";
  function walk(node: HtmlElement) {
    for (const child of node.children) {
      if ("type" in child && child.type === "text") {
        text += child.text;
      } else {
        const el = child as HtmlElement;
        if (skipSet.has(el)) continue;
        walk(el);
      }
    }
  }
  walk(element);
  return decodeEntities(text);
}

export function getInnerHTML(element: HtmlElement): string {
  let html = "";
  for (const child of element.children) {
    if ("type" in child && child.type === "text") {
      html += child.text;
    } else {
      html += serializeElement(child as HtmlElement);
    }
  }
  return html;
}

function serializeElement(element: HtmlElement): string {
  const attrs = Object.entries(element.attributes)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("");
  if (VOID_ELEMENTS.has(element.tag)) return `<${element.tag}${attrs}/>`;
  return `<${element.tag}${attrs}>${getInnerHTML(element)}</${element.tag}>`;
}

export function getElementValue(element: HtmlElement): string | undefined {
  if (element.tag === "textarea") return getTextContent(element, "");
  return element.attributes["value"];
}

// --- Text cleanup ---

export function trimValue(s: string): string {
  return s.replace(/^[\s\n]+|[\s\n]+$/g, "");
}

export function cleanUpTextFn(s: string): string {
  return s
    .replace(/^[\s\n]+|[\s\n]+$/g, "")
    .replace(/[\n\r]/g, " ")
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

interface ExtractionRow {
  key: string;
  cssSelector: string;
  returnValue: string;
  attribute?: string;
  skipSelectors?: string;
  returnArray?: boolean;
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
      json: { html: rendered },
      pairedItem: item.pairedItem ?? { item: idx, input: 0 },
    };
  });
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
  element: HtmlElement,
  row: ExtractionRow,
  trim: boolean,
  cleanUp: boolean,
): unknown {
  let value: unknown;

  switch (row.returnValue) {
    case "attribute":
      value = row.attribute ? element.attributes[row.attribute] : undefined;
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

function extractHtmlContent(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
): INodeExecutionData[] {
  const sourceData = ctx.getParam<string>("sourceData", "json");
  const dataPropertyName = ctx.getParam<string>("dataPropertyName", "data");
  const extractionValues =
    ctx.getParam<{ values?: ExtractionRow[] }>("extractionValues", {}) ?? {};
  const rows = extractionValues.values ?? [];
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const trimValues = options.trimValues !== false;
  const cleanUp = options.cleanUpText !== false;
  const continueOnFail = ctx.continueOnFail();
  const output: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    let htmlStrings: string[];

    try {
      if (sourceData === "binary") {
        const bin = item.binary?.[dataPropertyName];
        if (!bin) {
          throw new Error(`No binary data named "${dataPropertyName}" exists!`);
        }
        const text = Buffer.from(bin.data, "base64").toString("utf8");
        htmlStrings = [text];
      } else {
        const value = getNestedValue(item.json, dataPropertyName);
        if (value === undefined) {
          throw new Error(`No property named "${dataPropertyName}" exists!`);
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
        if (row.returnArray) {
          extracted[row.key] = elements.map((el) =>
            extractValue(el, row, trimValues, cleanUp),
          );
        } else {
          extracted[row.key] =
            elements.length > 0
              ? extractValue(elements[0], row, trimValues, cleanUp)
              : undefined;
        }
      }

      output.push({
        json: extracted,
        pairedItem: { item: itemIndex, input: 0 },
      });
    }
  }

  return output;
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

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const capitalize = options.capitalize === true;
  const customStyling = options.customStyling === true;
  const caption = (options.caption as string) ?? "";
  const tableAttributes = (options.tableAttributes as string) ?? "";
  const headerAttributes = (options.headerAttributes as string) ?? "";
  const rowAttributes = (options.rowAttributes as string) ?? "";
  const cellAttributes = (options.cellAttributes as string) ?? "";

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

  const headers = keys.map((k) => (capitalize ? capitalizeHeader(k) : k));

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

  const table = parts.join("");

  return [
    {
      json: { table },
      pairedItem: items.map((_, i) => ({ item: i, input: 0 })),
    },
  ];
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export const htmlExecutor: NodeExecutor = async (ctx) => {
  const items: INodeExecutionData[] = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "generateHtmlTemplate");

  switch (operation) {
    case "generateHtmlTemplate": {
      const template = ctx.getParam<string>("html", "");
      return [generateHtmlTemplate(items, template)];
    }
    case "extractHtmlContent":
      return [extractHtmlContent(ctx, items)];
    case "convertToHtmlTable":
      return [convertToHtmlTable(ctx, ctx.getInputItems(0))];
    default:
      throw new Error(`HTML: unknown operation "${operation}"`);
  }
};