import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

export const xmlExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  if (inputItems.length === 0) {
    return [[]];
  }
  const items: INodeExecutionData[] = ensureItems(inputItems);
  const mode = ctx.getParam<string>("mode", "xmlToJson");
  const dataPropertyName = ctx.getParam<string>("dataPropertyName", "data");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  return [
    items.map((item, idx) => {
      const json = { ...item.json };
      const value = json[dataPropertyName];

      if (value === undefined || value === null) {
        throw new Error(`XML node: property "${dataPropertyName}" is missing or undefined`);
      }

      if (mode === "jsonToxml") {
        json[dataPropertyName] = jsonToXml(value, options);
      } else {
        if (typeof value !== "string") {
          throw new Error(
            `XML node: property "${dataPropertyName}" must be a string for xmlToJson mode`,
          );
        }
        json[dataPropertyName] = xmlToJson(value, options);
      }

      return {
        json,
        binary: item.binary,
        pairedItem: item.pairedItem ?? { item: idx, input: 0 },
      };
    }),
  ];
};

// ---------------------------------------------------------------------------
// JSON → XML serialization
// ---------------------------------------------------------------------------

interface JsonToXmlOptions {
  attrkey: string;
  charkey: string;
  headless: boolean;
  rootName: string;
  cdata: boolean;
  allowSurrogateChars: boolean;
}

function jsonToXml(value: unknown, rawOptions: Record<string, unknown>): string {
  const options: JsonToXmlOptions = {
    attrkey: (rawOptions.attrkey as string) ?? "$",
    charkey: (rawOptions.charkey as string) ?? "_",
    headless: (rawOptions.headless as boolean) ?? false,
    rootName: (rawOptions.rootName as string) ?? "root",
    cdata: (rawOptions.cdata as boolean) ?? false,
    allowSurrogateChars: (rawOptions.allowSurrogateChars as boolean) ?? false,
  };

  let xml = "";
  if (!options.headless) {
    xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
  }
  xml += serializeElement(
    options.rootName,
    value,
    options.attrkey,
    options.charkey,
    options.cdata,
    options.allowSurrogateChars,
  );
  return xml;
}

function serializeElement(
  tag: string,
  value: unknown,
  attrkey: string,
  charkey: string,
  cdata: boolean,
  allowSurrogateChars: boolean,
): string {
  if (value === null || value === undefined) {
    return `<${tag}/>`;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `<${tag}>${escapeXmlText(String(value), cdata, allowSurrogateChars)}</${tag}>`;
  }

  if (Array.isArray(value)) {
    return value
      .map((v) => serializeElement(tag, v, attrkey, charkey, cdata, allowSurrogateChars))
      .join("");
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const attrs = obj[attrkey];
    const text = obj[charkey];

    let attrStr = "";
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
        attrStr += ` ${k}="${escapeAttr(String(v))}"`;
      }
    }

    const childParts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k === attrkey || k === charkey) continue;
      childParts.push(serializeElement(k, v, attrkey, charkey, cdata, allowSurrogateChars));
    }

    let textContent = "";
    if (text !== undefined && text !== null) {
      textContent = escapeXmlText(String(text), cdata, allowSurrogateChars);
    }

    if (childParts.length === 0 && textContent === "") {
      return `<${tag}${attrStr}/>`;
    }

    return `<${tag}${attrStr}>${textContent}${childParts.join("")}</${tag}>`;
  }

  return `<${tag}>${escapeXmlText(String(value), cdata, allowSurrogateChars)}</${tag}>`;
}

function escapeXmlText(s: string, useCdata: boolean, _allowSurrogateChars: boolean): string {
  if (/[<>&]/.test(s)) {
    if (useCdata) {
      return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
    }
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  return s;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ---------------------------------------------------------------------------
// XML → JSON parsing
// ---------------------------------------------------------------------------

interface ParsedNode {
  tag: string;
  attributes: Record<string, string>;
  children: ParsedNode[];
  text: string;
}

interface XmlToJsonOptions {
  attrkey: string;
  charkey: string;
  explicitArray: boolean;
  explicitRoot: boolean;
  ignoreAttrs: boolean;
  mergeAttrs: boolean;
  normalize: boolean;
  normalizeTags: boolean;
  trim: boolean;
}

function xmlToJson(xmlString: string, rawOptions: Record<string, unknown>): unknown {
  const options: XmlToJsonOptions = {
    attrkey: (rawOptions.attrkey as string) ?? "$",
    charkey: (rawOptions.charkey as string) ?? "_",
    explicitArray: (rawOptions.explicitArray as boolean) ?? false,
    explicitRoot: (rawOptions.explicitRoot as boolean) ?? true,
    ignoreAttrs: (rawOptions.ignoreAttrs as boolean) ?? false,
    mergeAttrs: (rawOptions.mergeAttrs as boolean) ?? true,
    normalize: (rawOptions.normalize as boolean) ?? false,
    normalizeTags: (rawOptions.normalizeTags as boolean) ?? false,
    trim: (rawOptions.trim as boolean) ?? false,
  };

  const parser = new XmlParser(xmlString);
  const root = parser.parse();

  if (!root) return {};

  const inner = nodeToJson(root, options);

  if (options.explicitRoot) {
    const rootKey = options.normalizeTags ? root.tag.toLowerCase() : root.tag;
    return { [rootKey]: inner };
  }

  return inner;
}

function nodeToJson(node: ParsedNode, opts: XmlToJsonOptions): unknown {
  const obj: Record<string, unknown> = {};

  // Attributes
  if (!opts.ignoreAttrs && Object.keys(node.attributes).length > 0) {
    if (opts.mergeAttrs) {
      for (const [k, v] of Object.entries(node.attributes)) {
        const key = opts.normalizeTags ? k.toLowerCase() : k;
        obj[key] = v;
      }
    } else {
      const attrObj: Record<string, string> = {};
      for (const [k, v] of Object.entries(node.attributes)) {
        const key = opts.normalizeTags ? k.toLowerCase() : k;
        attrObj[key] = v;
      }
      obj[opts.attrkey] = attrObj;
    }
  }

  // Text content
  let text = node.text;
  if (opts.trim) text = text.trim();
  if (opts.normalize) text = text.trim().replace(/\s+/g, " ");

  const hasChildren = node.children.length > 0;
  const hasText = text.length > 0;

  // Only add charkey for meaningful text.
  // Whitespace-only text between child elements is ignored.
  if (hasText && (!hasChildren || text.trim().length > 0)) {
    obj[opts.charkey] = text;
  }

  // Children
  for (const child of node.children) {
    const childKey = opts.normalizeTags ? child.tag.toLowerCase() : child.tag;
    const childObj = nodeToJson(child, opts);

    if (opts.explicitArray) {
      const existing = obj[childKey];
      if (Array.isArray(existing)) {
        existing.push(childObj);
      } else {
        obj[childKey] = [childObj];
      }
    } else {
      if (childKey in obj) {
        const existing = obj[childKey];
        if (Array.isArray(existing)) {
          existing.push(childObj);
        } else {
          obj[childKey] = [existing, childObj];
        }
      } else {
        obj[childKey] = childObj;
      }
    }
  }

  return obj;
}

// ---------------------------------------------------------------------------
// Minimal XML parser (recursive descent)
// ---------------------------------------------------------------------------

class XmlParser {
  private pos = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input.trim();
  }

  parse(): ParsedNode | null {
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;

      if (this.startsWith("<?")) {
        this.skipProcessingInstruction();
      } else if (this.startsWith("<!--")) {
        this.skipComment();
      } else if (this.startsWith("<!DOCTYPE")) {
        this.skipDoctype();
      } else if (this.input[this.pos] === "<") {
        return this.parseElement();
      } else {
        this.pos++;
      }
    }
    return null;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private startsWith(s: string): boolean {
    return this.input.substring(this.pos, this.pos + s.length) === s;
  }

  private skipProcessingInstruction(): void {
    const end = this.input.indexOf("?>", this.pos);
    this.pos = end !== -1 ? end + 2 : this.input.length;
  }

  private skipComment(): void {
    const end = this.input.indexOf("-->", this.pos);
    this.pos = end !== -1 ? end + 3 : this.input.length;
  }

  private skipDoctype(): void {
    const end = this.input.indexOf(">", this.pos);
    this.pos = end !== -1 ? end + 1 : this.input.length;
  }

  private parseElement(): ParsedNode | null {
    if (this.input[this.pos] !== "<") return null;
    this.pos++;

    const tag = this.parseName();
    const attributes = this.parseAttributes();

    this.skipWhitespace();

    // Self-closing
    if (this.input[this.pos] === "/" && this.input[this.pos + 1] === ">") {
      this.pos += 2;
      return { tag, attributes, children: [], text: "" };
    }

    if (this.input[this.pos] === ">") this.pos++;

    const children: ParsedNode[] = [];
    let text = "";

    while (this.pos < this.input.length) {
      if (this.startsWith("</")) {
        this.pos += 2;
        this.parseName();
        this.skipWhitespace();
        if (this.input[this.pos] === ">") this.pos++;
        break;
      }

      if (this.startsWith("<![CDATA[")) {
        text += this.parseCdata();
        continue;
      }

      if (this.startsWith("<!--")) {
        this.skipComment();
        continue;
      }

      if (this.startsWith("<?")) {
        this.skipProcessingInstruction();
        continue;
      }

      if (this.input[this.pos] === "<") {
        const child = this.parseElement();
        if (child) children.push(child);
        continue;
      }

      text += this.parseText();
    }

    return { tag, attributes, children, text };
  }

  private parseName(): string {
    const start = this.pos;
    while (this.pos < this.input.length && /[^\s/>=]/.test(this.input[this.pos])) {
      this.pos++;
    }
    return this.input.substring(start, this.pos);
  }

  private parseAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {};

    while (this.pos < this.input.length) {
      this.skipWhitespace();

      if (
        this.input[this.pos] === ">" ||
        (this.input[this.pos] === "/" && this.input[this.pos + 1] === ">")
      ) {
        break;
      }

      const name = this.parseName();
      this.skipWhitespace();

      if (this.input[this.pos] === "=") {
        this.pos++;
        this.skipWhitespace();
        attrs[name] = this.parseAttrValue();
      }
    }

    return attrs;
  }

  private parseAttrValue(): string {
    const quote = this.input[this.pos];
    if (quote !== '"' && quote !== "'") {
      const start = this.pos;
      while (this.pos < this.input.length && /[^\s>]/.test(this.input[this.pos])) {
        this.pos++;
      }
      return decodeEntities(this.input.substring(start, this.pos));
    }

    this.pos++;
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      this.pos++;
    }
    const value = this.input.substring(start, this.pos);
    if (this.pos < this.input.length) this.pos++;
    return decodeEntities(value);
  }

  private parseText(): string {
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "<") {
      this.pos++;
    }
    return decodeEntities(this.input.substring(start, this.pos));
  }

  private parseCdata(): string {
    this.pos += 9; // skip <![CDATA[
    const start = this.pos;
    const end = this.input.indexOf("]]>", this.pos);
    if (end === -1) {
      this.pos = this.input.length;
      return this.input.substring(start);
    }
    const content = this.input.substring(start, end);
    this.pos = end + 3;
    return content;
  }
}

function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}
