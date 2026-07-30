import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

// ---------------------------------------------------------------------------
// Markdown -> HTML  (Showdown-compatible subset)
// ---------------------------------------------------------------------------

interface MdToHtmlOptions {
  noHeaderId: boolean;
  strikethrough: boolean;
  headerLevelStart: number;
  prefixHeaderId: string;
  openLinksInNewWindow: boolean;
  simpleLineBreaks: boolean;
  tasklists: boolean;
  tables: boolean;
  completeHTMLDocument: boolean;
}

function readMdToHtmlOptions(raw: Record<string, unknown>): MdToHtmlOptions {
  return {
    noHeaderId: raw.noHeaderId === true,
    strikethrough: raw.strikethrough === true,
    headerLevelStart: Number(raw.headerLevelStart ?? 1) || 1,
    prefixHeaderId: typeof raw.prefixHeaderId === "string" ? raw.prefixHeaderId : "section",
    openLinksInNewWindow: raw.openLinksInNewWindow === true,
    simpleLineBreaks: raw.simpleLineBreaks === true,
    tasklists: raw.tasklists === true,
    tables: raw.tables === true,
    completeHTMLDocument: raw.completeHTMLDocument === true,
  };
}

function makeHeaderId(text: string, prefix: string): string {
  const slug = text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return prefix ? `${prefix}${slug}` : slug;
}

function mdInline(s: string, opts: MdToHtmlOptions): string {
  let r = s;
  r = r.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  r = r.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  r = r.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  if (opts.strikethrough) {
    r = r.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  }
  r = r.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  r = r.replace(/_([^_]+)_/g, "<em>$1</em>");
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
    const target = opts.openLinksInNewWindow ? ' target="_blank"' : "";
    return `<a href="${href}"${target}>${text}</a>`;
  });
  r = r.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  return r;
}

function markdownToHtml(md: string, rawOpts: Record<string, unknown>): string {
  const opts = readMdToHtmlOptions(rawOpts);
  const lines = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)(?:\s+#+\s*)?$/);
    if (heading) {
      const level = Math.min(6, heading[1].length + opts.headerLevelStart - 1);
      const text = mdInline(heading[2], opts);
      if (opts.noHeaderId) {
        html.push(`<h${level}>${text}</h${level}>`);
      } else {
        html.push(`<h${level} id="${makeHeaderId(heading[2], opts.prefixHeaderId === "section" ? "" : opts.prefixHeaderId)}">${text}</h${level}>`);
      }
      i++;
      continue;
    }

    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line) && opts.tasklists) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[i])) {
        const checked = /\[[xX]\]/.test(lines[i]);
        const content = lines[i].replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "");
        items.push(
          `<li><input type="checkbox" disabled="disabled"${checked ? ' checked="checked"' : ""}/> ${mdInline(content, opts)}</li>`,
        );
        i++;
      }
      html.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${mdInline(lines[i].replace(/^\s*[-*+]\s+/, ""), opts)}</li>`);
        i++;
      }
      html.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${mdInline(lines[i].replace(/^\s*\d+\.\s+/, ""), opts)}</li>`);
        i++;
      }
      html.push(`<ol>\n${items.join("\n")}\n</ol>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      html.push(`<blockquote>\n${mdInline(quoteLines.join(" "), opts)}\n</blockquote>`);
      continue;
    }

    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const cls = lang ? ` class="${lang} language-${lang}"` : "";
      html.push(`<pre><code${cls}>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    if (opts.tables && /\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const headerCells = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const thead = `<thead>\n<tr>${headerCells.map((c) => `<th>${mdInline(c, opts)}</th>`).join("")}</tr>\n</thead>`;
      const tbody = `<tbody>\n${rows
        .map((row) => `<tr>${row.map((c) => `<td>${mdInline(c, opts)}</td>`).join("")}</tr>`)
        .join("\n")}\n</tbody>`;
      html.push(`<table>\n${thead}\n${tbody}\n</table>`);
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^```/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    const joined = opts.simpleLineBreaks ? para.join("<br>\n") : para.join("\n");
    html.push(`<p>${mdInline(joined, opts)}</p>`);
  }

  const body = html.join("\n");
  if (opts.completeHTMLDocument) {
    return `<!DOCTYPE html>\n<html>\n<head>\n</head>\n<body>\n${body}\n</body>\n</html>`;
  }
  return body;
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

// ---------------------------------------------------------------------------
// HTML -> Markdown  (node-html-markdown-compatible subset)
// ---------------------------------------------------------------------------

interface HtmlToMdOptions {
  bulletMarker: string;
  codeFence: string;
  emDelimiter: string;
  strongDelimiter: string;
  codeBlockStyle: string;
  maxConsecutiveNewlines: number;
}

function readHtmlToMdOptions(raw: Record<string, unknown>): HtmlToMdOptions {
  return {
    bulletMarker: typeof raw.bulletMarker === "string" && raw.bulletMarker ? raw.bulletMarker : "*",
    codeFence: typeof raw.codeFence === "string" ? raw.codeFence : "```",
    emDelimiter: typeof raw.emDelimiter === "string" && raw.emDelimiter ? raw.emDelimiter : "_",
    strongDelimiter: typeof raw.strongDelimiter === "string" && raw.strongDelimiter ? raw.strongDelimiter : "**",
    codeBlockStyle: typeof raw.codeBlockStyle === "string" ? raw.codeBlockStyle : "fence",
    maxConsecutiveNewlines: Number(raw.maxConsecutiveNewlines ?? 3) || 3,
  };
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

interface HtmlNode {
  type: "text" | "elem";
}
interface HtmlText extends HtmlNode {
  type: "text";
  text: string;
}
interface HtmlElem extends HtmlNode {
  type: "elem";
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}
function isElem(n: HtmlNode): n is HtmlElem {
  return n.type === "elem";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)));
}

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)'|\s*=\s*([^\s>]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

function parseHtmlToTree(html: string): HtmlElem {
  const root: HtmlElem = { type: "elem", tag: "#root", attrs: {}, children: [] };
  const stack: HtmlElem[] = [root];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      const text = html.slice(lastIndex, match.index);
      stack[stack.length - 1].children.push({ type: "text", text });
    }
    const isClosing = match[0][1] === "/";
    const tag = match[1].toLowerCase();
    const attrStr = match[2] ?? "";

    if (isClosing) {
      for (let j = stack.length - 1; j > 0; j--) {
        if (stack[j].tag === tag) {
          stack.length = j;
          break;
        }
      }
    } else {
      const attrs = parseAttrs(attrStr);
      const selfClosing = attrStr.trimEnd().endsWith("/") || VOID_TAGS.has(tag);
      const el: HtmlElem = { type: "elem", tag, attrs, children: [] };
      stack[stack.length - 1].children.push(el);
      if (!selfClosing) stack.push(el);
    }
    lastIndex = tagRegex.lastIndex;
  }
  if (lastIndex < html.length) {
    stack[stack.length - 1].children.push({ type: "text", text: html.slice(lastIndex) });
  }
  return root;
}

const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "header", "footer", "main", "aside",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
  "pre", "table", "tr", "hr", "br",
]);

function serializeNodes(nodes: HtmlNode[], opts: HtmlToMdOptions): string {
  let out = "";
  for (const node of nodes) {
    if (isElem(node)) {
      out += serializeElem(node, opts);
    } else {
      out += decodeEntities(node.text);
    }
  }
  return out;
}

function serializeElem(el: HtmlElem, opts: HtmlToMdOptions): string {
  switch (el.tag) {
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
      const level = Number(el.tag[1]);
      return `${"#".repeat(level)} ${serializeNodes(el.children, opts).trim()}\n\n`;
    }
    case "p": {
      const inner = serializeNodes(el.children, opts).trim();
      return inner ? `${inner}\n\n` : "";
    }
    case "br":
      return "\n";
    case "hr":
      return "---\n\n";
    case "strong": case "b":
      return `${opts.strongDelimiter}${serializeNodes(el.children, opts)}${opts.strongDelimiter}`;
    case "em": case "i":
      return `${opts.emDelimiter}${serializeNodes(el.children, opts)}${opts.emDelimiter}`;
    case "del": case "s": case "strike":
      return `~~${serializeNodes(el.children, opts)}~~`;
    case "code":
      return `\`${serializeNodes(el.children, opts)}\``;
    case "pre": {
      const code = el.children.find((c) => isElem(c) && c.tag === "code");
      const content = serializeNodes(code ? code.children : el.children, opts);
      if (opts.codeBlockStyle === "indented") {
        return content
          .split("\n")
          .map((l) => `    ${l}`)
          .join("\n") + "\n\n";
      }
      return `${opts.codeFence}\n${content}\n${opts.codeFence}\n\n`;
    }
    case "a": {
      const href = el.attrs.href ?? "";
      const text = serializeNodes(el.children, opts);
      return `[${text}](${href})`;
    }
    case "img": {
      const src = el.attrs.src ?? "";
      const alt = el.attrs.alt ?? "";
      return `![${alt}](${src})`;
    }
    case "li":
      return `${opts.bulletMarker} ${serializeNodes(el.children, opts).trim()}\n`;
    case "ul": case "ol":
      return `${serializeNodes(el.children, opts)}\n`;
    case "blockquote": {
      const inner = serializeNodes(el.children, opts).trim();
      return inner
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n") + "\n\n";
    }
    case "input": {
      const checked = el.attrs.checked !== undefined;
      return `[${checked ? "x" : " "}] `;
    }
    default:
      return serializeNodes(el.children, opts);
  }
}

function collapseNewlines(s: string, max: number): string {
  const cap = Math.max(1, max);
  const pattern = new RegExp(`\\n{${cap + 1},}`, "g");
  return s.replace(pattern, "\n".repeat(cap));
}

function htmlToMarkdown(html: string, rawOpts: Record<string, unknown>): string {
  const opts = readHtmlToMdOptions(rawOpts);
  const root = parseHtmlToTree(html);
  let out = serializeNodes(root.children, opts);
  out = collapseNewlines(out, opts.maxConsecutiveNewlines);
  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

// ---------------------------------------------------------------------------
// destinationKey dot-path writer
// ---------------------------------------------------------------------------

function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (current[key] == null || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export const markdownExecutor: NodeExecutor = async (ctx) => {
  const rawItems = ctx.getInputItems(0);
  if (rawItems.length === 0) return [[]];
  const items: INodeExecutionData[] = ensureItems(rawItems);
  const mode = ctx.getParam<string>("mode", "htmlToMarkdown");
  const destinationKey = ctx.getParam<string>("destinationKey", "data");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  if (!destinationKey) {
    throw new Error("Markdown: destinationKey is required");
  }

  const source =
    mode === "markdownToHtml"
      ? ctx.getParam<string>("markdown", "")
      : ctx.getParam<string>("html", "");

  const convert =
    mode === "markdownToHtml"
      ? (s: string) => markdownToHtml(s, options)
      : (s: string) => htmlToMarkdown(s, options);

  const out: INodeExecutionData[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json: Record<string, unknown> = { ...item.json };
    setNested(json, destinationKey, convert(source));
    out.push({
      json,
      pairedItem: item.pairedItem ?? { item: i, input: 0 },
    });
  }
  return [out];
};