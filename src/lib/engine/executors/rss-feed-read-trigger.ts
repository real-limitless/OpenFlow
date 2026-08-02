import { evaluateExpression } from "@/lib/expressions/evaluate";
import type { INodeExecutionData, NodeExecutor } from "@/sdk";

const pollStates = new Map<string, Set<string>>();

export function _clearPollStatesForTest(): void {
  pollStates.clear();
}

function getSeenKeys(nodeId: string): Set<string> {
  let seen = pollStates.get(nodeId);
  if (!seen) {
    seen = new Set();
    pollStates.set(nodeId, seen);
  }
  return seen;
}

export const rssFeedReadTriggerExecutor: NodeExecutor = async (ctx) => {
  const feedUrl = ctx.getParam<string>("feedUrl", "");
  if (!feedUrl || (typeof feedUrl === "string" && feedUrl.trim() === "")) {
    throw new Error("feedUrl is required");
  }

  const url = resolveString(feedUrl);
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("feedUrl is required");
  }

  const xml = await fetchFeed(url);
  const entries = parseFeed(xml);
  if (entries.length === 0) return [[]];

  const seen = getSeenKeys(ctx.node.id ?? "default");

  const out: INodeExecutionData[] = [];
  for (const entry of entries) {
    const key = entry.guid || entry.link || entry.title || JSON.stringify(entry.fields);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      json: {
        title: entry.fields.title,
        link: entry.fields.link,
        description: entry.fields.description,
        content: entry.fields.content,
        contentSnippet: entry.fields.contentSnippet,
        pubDate: entry.fields.pubDate,
        isoDate: entry.fields.isoDate,
        creator: entry.fields.creator,
        author: entry.fields.author,
        categories: entry.fields.categories,
        guid: entry.fields.guid,
        enclosure: entry.fields.enclosure,
      },
    });
  }

  return [out];
};

function resolveString(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("{{") || raw.startsWith("=")) {
    const result = evaluateExpression(raw, { json: {}, itemIndex: 0 });
    return result.ok ? result.value : raw;
  }
  return raw;
}

async function fetchFeed(url: string): Promise<string> {
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
}

interface ParsedEntry {
  guid?: string;
  link?: string;
  title?: string;
  fields: Record<string, unknown>;
}

function parseFeed(xml: string): ParsedEntry[] {
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
  if (rootName === "rdf:rdf") {
    return findChildren(root, "item").map(rssItemToEntry);
  }
  const items = findAll(root, "item");
  if (items.length > 0) return items.map(rssItemToEntry);
  const entries = findAll(root, "entry");
  if (entries.length > 0) return entries.map(atomEntryToEntry);
  return [];
}

function rssItemToEntry(node: XmlNode): ParsedEntry {
  const fields: Record<string, unknown> = {};
  fields.title = childText(node, "title") || undefined;
  fields.link = childText(node, "link") || undefined;
  const description = childText(node, "description");
  const encoded = childText(node, "content:encoded", "encoded");
  if (encoded) fields.content = encoded;
  else if (description) fields.content = description;
  if (description) fields.contentSnippet = stripHtml(description);
  fields.pubDate = childText(node, "pubDate") || undefined;
  fields.creator = childText(node, "dc:creator", "creator") || undefined;
  fields.author = childText(node, "author") || undefined;
  fields.guid = childText(node, "guid") || undefined;
  const categories = findChildren(node, "category").map((c) => c.text).filter(Boolean);
  if (categories.length > 0) fields.categories = categories;
  const enclosure = findChild(node, "enclosure");
  if (enclosure?.attrs?.url) fields.enclosure = enclosure.attrs.url;
  return {
    guid: fields.guid as string | undefined,
    link: fields.link as string | undefined,
    title: fields.title as string | undefined,
    fields,
  };
}

function atomEntryToEntry(node: XmlNode): ParsedEntry {
  const fields: Record<string, unknown> = {};
  fields.title = childText(node, "title") || undefined;
  fields.link = atomLink(node) || undefined;
  const content = childText(node, "content");
  const summary = childText(node, "summary");
  if (content) fields.content = content;
  else if (summary) fields.content = summary;
  if (summary) fields.contentSnippet = stripHtml(summary);
  else if (content) fields.contentSnippet = stripHtml(content);
  const published = childText(node, "published");
  const updated = childText(node, "updated");
  const date = published || updated;
  if (date) fields.pubDate = date;
  const authorName = atomAuthor(node);
  if (authorName) {
    fields.creator = authorName;
    fields.author = authorName;
  }
  const id = childText(node, "id");
  if (id) fields.id = id;
  return {
    guid: (id || fields.link) as string | undefined,
    link: fields.link as string | undefined,
    title: fields.title as string | undefined,
    fields,
  };
}

function atomLink(entry: XmlNode): string | undefined {
  const links = findChildren(entry, "link");
  if (links.length === 0) return undefined;
  const alt = links.find((l) => !l.attrs.rel || l.attrs.rel === "alternate") ?? links[0];
  return alt.attrs.href || childText(entry, "link") || undefined;
}

function atomAuthor(entry: XmlNode): string | undefined {
  const author = findChild(entry, "author");
  if (!author) return undefined;
  return childText(author, "name") || undefined;
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
  return child?.text || undefined;
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
      if (this.startsWith("<![CDATA[")) { text += this.parseCdata(); continue; }
      if (this.startsWith("<!--")) { this.skipUntil("-->"); continue; }
      if (this.startsWith("<?")) { this.skipUntil("?>"); continue; }
      if (this.input[this.pos] === "<") { const child = this.parseElement(); if (child) children.push(child); continue; }
      text += this.parseText();
    }
    return { name, attrs, children, text: text.trim() };
  }

  private parseName(): string {
    const start = this.pos;
    while (this.pos < this.input.length && /[^\s/>=]/.test(this.input[this.pos])) this.pos++;
    return this.input.substring(start, this.pos);
  }

  private parseAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {};
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.input[this.pos] === ">" || (this.input[this.pos] === "/" && this.input[this.pos + 1] === ">")) break;
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
      while (this.pos < this.input.length && /[^\s>]/.test(this.input[this.pos])) this.pos++;
      return decodeEntities(this.input.substring(start, this.pos));
    }
    this.pos++;
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== quote) this.pos++;
    const value = this.input.substring(start, this.pos);
    if (this.pos < this.input.length) this.pos++;
    return decodeEntities(value);
  }

  private parseText(): string {
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "<") this.pos++;
    return decodeEntities(this.input.substring(start, this.pos));
  }

  private parseCdata(): string {
    this.pos += 9;
    const end = this.input.indexOf("]]>", this.pos);
    if (end === -1) { const rest = this.input.substring(this.pos); this.pos = this.input.length; return rest; }
    const content = this.input.substring(this.pos, end);
    this.pos = end + 3;
    return content;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) this.pos++;
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
