---
type: n8n-nodes-base.markdown
displayName: Markdown
category: Transform
versions: [1]
priority: medium
status: specced
---

# Markdown

Convert data between Markdown and HTML. The node reads a source string per item,
runs it through a converter, and writes the result to a destination field
(supporting dot-notation nesting).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.markdown.md | Public docs only |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, `dist/types/nodes.json` → `markdown`) | Public descriptor metadata — parameter names, enums, defaults only |

## Wire format

- **Type string:** `n8n-nodes-base.markdown`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Node version:** `1` (`nodeVersion` 1.0) (**descriptor**)
- **Group / category:** `output` / Core Nodes → Data Transformation (**descriptor**)
- **Subtitle expression:** `={{$parameter["mode"]=="markdownToHtml" ? "Markdown to HTML" : "HTML to Markdown"}}` (**descriptor**)

## Parameters

`mode` selects the conversion direction. The source field (`html` vs `markdown`)
and the `options` collection both change their contents based on `mode`
(`displayOptions.show.mode`).

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `htmlToMarkdown` | yes | — | `markdownToHtml` \| `htmlToMarkdown` (**documented** labels; wire enum + default **descriptor**) |
| html | string | `""` | yes | mode ∈ htmlToMarkdown | The HTML to convert to Markdown (**documented**; wire name **descriptor**) |
| markdown | string | `""` | yes | mode ∈ markdownToHtml | The Markdown to convert to HTML (**documented**; wire name **descriptor**) |
| destinationKey | string | `data` | yes | mode ∈ markdownToHtml, htmlToMarkdown | Output field; nested fields via dots, e.g. `level1.level2.newKey` (**documented**; default **descriptor**) |
| options | collection | `{}` | no | mode ∈ htmlToMarkdown | HTML → Markdown options (see below) (**descriptor**) |
| options | collection | `{}` | no | mode ∈ markdownToHtml | Markdown → HTML options (see below) (**descriptor**) |

> The docs describe the source field as “HTML or Markdown” (name changes with
> Mode) and “Destination Key”. The wire names `html`, `markdown`,
> `destinationKey`, and `mode` come from the **descriptor**.

### HTML → Markdown options (`options`, mode = `htmlToMarkdown`)

Backed by the `node-html-markdown` converter (**documented**). All wire names,
types, and defaults are **descriptor**.

| name (display) | type | default | notes |
|----------------|------|---------|-------|
| bulletMarker (Bullet Marker) | string | `*` | Unordered-list bullet character |
| codeFence (Code Block Fence) | string | `` ``` `` | Code-block fence string |
| emDelimiter (Emphasis Delimiter) | string | `_` | `<em>` delimiter |
| strongDelimiter (Strong Delimiter) | string | `**` | `<strong>` delimiter |
| codeBlockStyle (Style For Code Block) | options | `fence` | `fence` \| `indented` |
| maxConsecutiveNewlines (Max Consecutive New Lines) | number | `3` | Max consecutive newlines allowed |
| useLinkReferenceDefinitions (Place URLs At The Bottom) | boolean | `false` | Move URLs to bottom; use link reference definitions |
| keepDataImages (Keep Images With Data) | boolean | `false` | Keep `data:` URI images (up to 1MB each) |
| ignore (Ignored Elements) | string | `""` | Comma-separated elements to ignore (with children) |
| blockElements (Treat As Blocks) | string | `""` | Comma-separated elements to surround with blank lines |
| globalEscape (Global Escape Pattern) | fixedCollection (single) | `{}` | `{value:{pattern, replacement}}`; overrides default escape settings |
| lineStartEscape (Line Start Escape Pattern) | fixedCollection (single) | `{}` | `{value:{pattern, replacement}}`; overrides default line-start escape |
| textReplace (Text Replacement Pattern) | fixedCollection (multi) | `[]` | `[{values:{pattern, replacement}}]`; user-defined regex replacements |

### Markdown → HTML options (`options`, mode = `markdownToHtml`)

Backed by the `Showdown` converter (with GitHub Flavored Markdown extensions
available) (**documented**). All wire names, types, and defaults are
**descriptor**.

| name (display) | type | default | notes |
|----------------|------|---------|-------|
| openLinksInNewWindow (Add Blank To Links) | boolean | `false` | Add `target="_blank"` to `<a>` |
| simplifiedAutoLink (Automatic Linking to URLs) | boolean | `false` | Auto-link bare URLs |
| excludeTrailingPunctuationFromURLs (Exclude Trailing Punctuation From URLs) | boolean | `false` | Only with simplifiedAutoLink |
| backslashEscapesHTMLTags (Backslash Escapes HTML Tags) | boolean | `false` | Escape `\<` `\>` |
| completeHTMLDocument (Complete HTML Document) | boolean | `false` | Emit `<!DOCTYPE>`, `<html>`, `<head>`, `<body>` |
| encodeEmails (Encode Emails) | boolean | `true` | Encode ASCII emails as decimal entities |
| ghCodeBlocks (GitHub Code Blocks) | boolean | `true` | GFM code-block style |
| ghCompatibleHeaderId (GitHub Compatible Header IDs) | boolean | `false` | GFM-style header IDs |
| ghMentions (GitHub Mentions) | boolean | `false` | Link `@name` to GitHub |
| ghMentionsLink (GitHub Mention Link) | string | `https://github.com/{u}` | Template for `@mentions`; `{u}` → username |
| tasklists (GitHub Task Lists) | boolean | `false` | GFM task-list syntax |
| strikethrough (Strikethrough) | boolean | `false` | `~~text~~` syntax |
| tables (Tables Support) | boolean | `false` | Markdown table syntax |
| tablesHeaderId (Tables Header ID) | boolean | `false` | Add ID to table header cells |
| customizedHeaderId (Customized Header ID) | boolean | `false` | Use `{id}` after heading text |
| headerLevelStart (Header Level Start) | number | `1` | Treat `#` as `<h{N}>` start level |
| prefixHeaderId (Prefix Header ID) | string | `section` | Prefix added to generated header IDs |
| rawHeaderId (Raw Header ID) | boolean | `false` | Replace spaces/`'`/`"` in header IDs with `-` |
| rawPrefixHeaderId (Raw Prefix Header ID) | boolean | `false` | Do not modify the prefix |
| noHeaderId (No Header ID) | boolean | `false` | Disable automatic header-ID generation |
| requireSpaceBeforeHeadingText (Mandatory Space Before Header) | boolean | `false` | Require space between `#` and text |
| literalMidWordAsterisks (Middle Word Asterisks) | boolean | `false` | Treat mid-word `*` as literal |
| literalMidWordUnderscores (Middle Word Underscores) | boolean | `false` | Treat mid-word `_` as literal |
| simpleLineBreaks (Simple Line Breaks) | boolean | `false` | Single newline → `<br>` (GitHub-style) |
| smartIndentationFix (Smart Indentation Fix) | boolean | `false` | Fix ES6 template-string indentation in code |
| disableForced4SpacesIndentedSublists (Spaces Indented Sublists) | boolean | `false` | Allow 2–3 space sublist indent |
| splitAdjacentBlockquotes (Split Adjacent Blockquotes) | boolean | `false` | Split adjacent `>` blocks |
| parseImgDimensions (Parse Image Dimensions) | boolean | `false` | Image dimensions in Markdown syntax |
| emoji (Emoji Support) | boolean | `false` | `:smile:` → emoji |

## Runtime behavior

### Input

- One conversion per input item (standard item loop) (**inferred**).
- The source string is read from the `html` parameter (mode = `htmlToMarkdown`)
  or the `markdown` parameter (mode = `markdownToHtml`) (**documented** +
  **descriptor**).
- The node does not read from a binary property; conversion is on the text
  content of the parameter (**inferred** — no binary input parameters exist).

### Output

- Item count is preserved: each input item produces one output item (**inferred**).
- The converted text is written to `item.json[destinationKey]`. `destinationKey`
  supports dot notation for nested fields (e.g. `level1.level2.newKey` creates
  nested objects) (**documented** + **descriptor**).
- All other existing JSON fields on the item are retained; the node augments
  rather than replaces the item (**inferred** from “put the output in a field”).
- No binary data is produced (**inferred**).

### Conversion engines

- **HTML → Markdown** uses `node-html-markdown` (**documented**). The
  `htmlToMarkdown` options map to that library’s options.
- **Markdown → HTML** uses `Showdown`, with several options extending Markdown
  toward GitHub Flavored Markdown (**documented**). The `markdownToHtml` options
  map to Showdown options.

### Errors

- Missing required `html` / `markdown` / `destinationKey` for the selected
  `mode` → fail (**inferred** standard required-field validation).
- `destinationKey` empty or resolving to an invalid path → fail (**inferred**).
- `continueOnFail`: a failed item yields an error on the item / empty output per
  engine policy (**inferred**).

### Expressions

The descriptor declares plain types (`string`, `number`, `boolean`, `options`,
`collection`) for all parameters — no `stringOrExpression` / `numberOrExpression`
variants. n8n string fields generally accept expressions (`{{ … }}`) in the UI,
so `html`, `markdown`, `destinationKey`, and string-valued options are expected
to accept expressions, but this is **inferred** (not declared in the descriptor).

## Acceptance tests

### Test: Markdown to HTML (paragraph with strong)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "mode": "markdownToHtml",
  "markdown": "Hello **world**",
  "destinationKey": "data"
}
```

**Expect** output[0]:

```json
[{ "json": { "data": "<p>Hello <strong>world</strong></p>" } }]
```

### Test: HTML to Markdown (heading + emphasis)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "mode": "htmlToMarkdown",
  "html": "<h1>Title</h1>\n<p>Hello <em>there</em></p>",
  "destinationKey": "data"
}
```

**Expect** output[0]:

```json
[{ "json": { "data": "# Title\n\nHello _there_" } }]
```

### Test: Destination Key dot notation

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "mode": "markdownToHtml",
  "markdown": "# Hi",
  "destinationKey": "out.html",
  "options": { "noHeaderId": true }
}
```

**Expect** output[0]:

```json
[{ "json": { "out": { "html": "<h1>Hi</h1>" } } }]
```

### Test: Per-item, item count preserved

**Given** input items:

```json
[{ "json": {} }, { "json": {} }]
```

**Parameters:**

```json
{
  "mode": "markdownToHtml",
  "markdown": "- a",
  "destinationKey": "data",
  "options": { "noHeaderId": true }
}
```

**Expect** output (2 items, each converted):

```json
[
  { "json": { "data": "<ul>\n<li>a</li>\n</ul>" } },
  { "json": { "data": "<ul>\n<li>a</li>\n</ul>" } }
]
```

### Test: Option effect — strikethrough

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "mode": "markdownToHtml",
  "markdown": "~~done~~",
  "destinationKey": "data",
  "options": { "strikethrough": true }
}
```

**Expect** output[0]:

```json
[{ "json": { "data": "<p><del>done</del></p>" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| `mode` enum + default `htmlToMarkdown` | descriptor | Docs list the two modes but not a default |
| Wire names `html`/`markdown`/`destinationKey`/`options` | descriptor | Docs use display labels only |
| All option wire names, types, defaults | descriptor | Confirmed by v2.15.1 `dist/types/nodes.json` |
| `prefixHeaderId` default | descriptor vs docs | Descriptor default = `section`; docs table says “None”. Wire default treated as `section` |
| `ghMentionsLink` default | descriptor vs docs | Descriptor default = `https://github.com/{u}`; docs table says “Disabled” (feature is off via `ghMentions=false`) |
| Converter libraries | documented | HTML→MD: `node-html-markdown`; MD→HTML: `Showdown` (+ GFM extensions) |
| Per-item loop / item-count preservation / field augmentation | inferred | Docs say “put the output in a field”; exact retained-field set inferred |
| Expression acceptance | inferred | Descriptor declares plain types; n8n string fields generally accept expressions |
| Exact output whitespace / attributes | inferred | Fixtures reflect Showdown / node-html-markdown behavior; minor whitespace may vary by library version |
| Binary input/output | inferred | No binary parameters exist; conversion is text-only |
| Error message strings | inferred | |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/markdown.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Use a Markdown→HTML converter (Showdown-compatible) and an
  HTML→Markdown converter (node-html-markdown-compatible) behind the executor;
  never load the `n8n-nodes-base` package. Map the `options` collection to the
  underlying converter options per `mode`. Resolve `destinationKey` with
  dot-notation nesting. No credentials required.