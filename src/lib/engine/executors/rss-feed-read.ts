import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "@/lib/expressions/evaluate";

/**
 * RSS Feed Read — reads entries from a public RSS 2.0 / Atom feed URL and
 * emits one workflow item per feed entry. Implemented clean-room from
 * docs/specs/nodes/n8n-nodes-base.rssFeedRead.md + the OpenFlow SDK only.
 */
export const rssFeedReadExecutor: NodeExecutor = async (ctx) => {
  const rawItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    rawItems.length === 0 ? [{ json: {} }] : ensureItems(rawItems);

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const url = resolveString(ctx.getParam("url", ""), item, i);
      if (typeof url !== "string" || url.trim() === "") {
        throw new Error("RSS Feed Read: url is required");
      }

      const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
      const ignoreSSL = resolveBool(options.ignoreSSL, item, i);
      const customFields = resolveString(options.customFields, item, i);

      const xml = await fetchFeed(url, ignoreSSL);
      const entries = parseFeed(xml);
      const requested = parseCustomFields(typeof customFields === "string" ? customFields : "");

      for (const entry of entries) {
        out.push({
          json: projectEntry(entry.fields, requested),
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
      }
    } catch (err) {
      if (ctx.continueOnFail()) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

// ---------------------------------------------------------------------------
// Parameter / expression resolution
// ---------------------------------------------------------------------------

function resolveString(raw: unknown, item: INodeExecutionData, idx: number): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("{{") || raw.startsWith("=")) {
    const result = evaluateExpression(raw, { json: item.json, itemIndex: idx });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveBool(raw: unknown, item: INodeExecutionData, idx: number): boolean {
  const v = resolveString(raw, item, idx);
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  return Boolean(v);
}

function parseCustomFields(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// HTTP fetch
// ---------------------------------------------------------------------------

async function fetchFeed(url: string, ignoreSSL: boolean): Promise<string> {
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (ignoreSSL) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText ?? ""}`.trim());
    }
    return await res.text();
  } finally {
    if (ignoreSSL) {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  }
}

// ---------------------------------------------------------------------------
// Entry projection
// ---------------------------------------------------------------------------

const DEFAULT_KEYS = [
  "title",
  "link",
  "content",
  "contentSnippet",
  "pubDate",
  "isoDate",
  "creator",
  "author",
  "guid",
  "id",
] as const;

function projectEntry(
  entry: Record<string, unknown>,
  customFields: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of DEFAULT_KEYS) {
    const v = entry[key];
    if (v !== undefined && v !== null && v !== "") out[key] = v;
  }
  for (const name of customFields) {
    const v = entry[name];
    if (v !== undefined && v !== null && v !== "") out[name] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Feed parsing (RSS 2.0 + Atom, plus RDF/RSS 1.0)
// ---------------------------------------------------------------------------

interface FeedEntry {
  fields: Record<string, unknown>;
}

function parseFeed(xml: string): FeedEntry[] {
  const root = new XmlParser(xml).parse();
  if (!root) return [];

  const rootName = root.name.toLowerCase();

  if (rootName === "rss") {
    const channel = findChild(root, "channel");
    if (!channel) return [];
    return findChildren(channel, "item").map(rssItemToEntry);
  }

  if (rootName === "feed") {
    return findChildren(root, "entry").map(atomEntryToEntry);
  }

  // RDF (RSS 1.0): <rdf:RDF> with <item> children
  if (rootName === "rdf:rdf") {
    return findChildren(root, "item").map(rssItemToEntry);
  }

  // Fallback: search anywhere for <item> or <entry>
  const items = findAll(root, "item");
  if (items.length > 0) return items.map(rssItemToEntry);
  const entries = findAll(root, "entry");
  if (entries.length > 0) return entries.map(atomEntryToEntry);

  return [];
}

function rssItemToEntry(node: XmlNode): FeedEntry {
  const fields: Record<string, unknown> = {};

  const title = childText(node, "title");
  if (title) fields.title = title;

  const link = childText(node, "link");
  if (link) fields.link = link;

  const description = childText(node, "description");
  const encoded = childText(node, "content:encoded", "encoded");
  if (encoded) fields.content = encoded;
  else if (description) fields.content = description;
  if (description) fields.contentSnippet = stripHtml(description);

  const pubDate = childText(node, "pubDate");
  if (pubDate) {
    fields.pubDate = pubDate;
    const iso = toIso(pubDate);
    if (iso) fields.isoDate = iso;
  }

  const creator = childText(node, "dc:creator", "creator");
  if (creator) fields.creator = creator;

  const author = childText(node, "author");
  if (author) fields.author = author;

  const guid = childText(node, "guid");
  if (guid) fields.guid = guid;

  // Preserve all raw child fields for customFields lookups.
  collectRaw(node, fields);

  return { fields };
}

function atomEntryToEntry(node: XmlNode): FeedEntry {
  const fields: Record<string, unknown> = {};

  const title = childText(node, "title");
  if (title) fields.title = title;

  const link = atomLink(node);
  if (link) fields.link = link;

  const content = childText(node, "content");
  const summary = childText(node, "summary");
  if (content) fields.content = content;
  else if (summary) fields.content = summary;
  if (summary) fields.contentSnippet = stripHtml(summary);
  else if (content) fields.contentSnippet = stripHtml(content);

  const published = childText(node, "published");
  const updated = childText(node, "updated");
  const date = published || updated;
  if (date) {
    fields.pubDate = date;
    const iso = toIso(date);
    if (iso) fields.isoDate = iso;
  }

  const authorName = atomAuthor(node);
  if (authorName) {
    fields.creator = authorName;
    fields.author = authorName;
  }

  const id = childText(node, "id");
  if (id) fields.id = id;

  collectRaw(node, fields);

  return { fields };
}

function atomLink(entry: XmlNode): string | undefined {
  // Prefer rel="alternate" or no rel; fall back to first link href.
  const links = findChildren(entry, "link");
  if (links.length === 0) return undefined;
  const alternate = links.find((l) => !l.attrs.rel || l.attrs.rel === "alternate") ?? links[0];
  return alternate.attrs.href || childText(entry, "link");
}

function atomAuthor(entry: XmlNode): string | undefined {
  const author = findChild(entry, "author");
  if (!author) return undefined;
  return childText(author, "name") || undefined;
}

function collectRaw(node: XmlNode, fields: Record<string, unknown>): void {
  for (const child of node.children) {
    const local = localName(child.name);
    if (child.text && !(local in fields)) {
      fields[local] = child.text;
    }
    if (child.name && !(child.name in fields) && child.text) {
      fields[child.name] = child.text;
    }
  }
}

function toIso(dateStr: string): string | undefined {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// XML tree helpers
// ---------------------------------------------------------------------------

function findChild(node: XmlNode, ...names: string[]): XmlNode | undefined {
  return node.children.find((c) => matchesName(c.name, names));
}

function findChildren(node: XmlNode, ...names: string[]): XmlNode[] {
  return node.children.filter((c) => matchesName(c.name, names));
}

function findAll(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const stack = [node];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of cur.children) {
      if (matchesName(c.name, [name])) out.push(c);
      stack.push(c);
    }
  }
  return out;
}

function childText(node: XmlNode, ...names: string[]): string | undefined {
  const child = findChild(node, ...names);
  if (!child) return undefined;
  return child.text || undefined;
}

function matchesName(tag: string, names: string[]): boolean {
  const lower = tag.toLowerCase();
  const local = localName(tag).toLowerCase();
  return names.some((n) => lower === n.toLowerCase() || local === localName(n).toLowerCase());
}

function localName(tag: string): string {
  const idx = tag.indexOf(":");
  return idx === -1 ? tag : tag.slice(idx + 1);
}

// ---------------------------------------------------------------------------
// Minimal XML parser (recursive descent)
// ---------------------------------------------------------------------------

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

class XmlParser {
  private pos = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input.trim();
  }

  parse(): XmlNode | null {
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;
      if (this.startsWith("<?")) this.skipUntil("?>");
      else if (this.startsWith("<!--")) this.skipUntil("-->");
      else if (this.startsWith("<!")) this.skipUntil(">");
      else if (this.input[this.pos] === "<") return this.parseElement();
      else this.pos++;
    }
    return null;
  }

  private parseElement(): XmlNode | null {
    if (this.input[this.pos] !== "<") return null;
    this.pos++;
    const name = this.parseName();
    const attrs = this.parseAttributes();
    this.skipWhitespace();

    if (this.input[this.pos] === "/" && this.input[this.pos + 1] === ">") {
      this.pos += 2;
      return { name, attrs, children: [], text: "" };
    }
    if (this.input[this.pos] === ">") this.pos++;

    const children: XmlNode[] = [];
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
        this.skipUntil("-->");
        continue;
      }
      if (this.startsWith("<?")) {
        this.skipUntil("?>");
        continue;
      }
      if (this.input[this.pos] === "<") {
        const child = this.parseElement();
        if (child) children.push(child);
        continue;
      }
      text += this.parseText();
    }

    return { name, attrs, children, text: text.trim() };
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
    const end = this.input.indexOf("]]>", this.pos);
    if (end === -1) {
      const rest = this.input.substring(this.pos);
      this.pos = this.input.length;
      return rest;
    }
    const content = this.input.substring(this.pos, end);
    this.pos = end + 3;
    return content;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private startsWith(s: string): boolean {
    return this.input.substring(this.pos, this.pos + s.length) === s;
  }

  private skipUntil(token: string): void {
    const end = this.input.indexOf(token, this.pos);
    this.pos = end !== -1 ? end + token.length : this.input.length;
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
