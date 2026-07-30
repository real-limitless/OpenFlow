---
type: n8n-nodes-base.html
displayName: HTML
category: Data Transformation
versions: [1, 1.1, 1.2]
priority: medium
status: specced
---

# HTML

Work with HTML in workflows: generate an HTML template from workflow data,
extract contents from an HTML source, or convert item data into an HTML table.
The HTML node replaces the former HTML Extract node (from version 0.213.0 on).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.html.md | Public docs only |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, `Html.node.json` + `.node.js` schema) | Public descriptor metadata — parameter names, enums, defaults only |

## Wire format

- **Type string:** `n8n-nodes-base.html`
- **Aliases:** `extract`, `template`, `table` (palette / codex search; **descriptor**)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Subtitle:** `={{ $parameter["operation"] }}` (**descriptor**)

## Parameters

`operation` selects the operation. Parameter visibility is governed by
`displayOptions` on `operation` (and, for extract, on `sourceData`/`returnValue`
and `@version`).

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `generateHtmlTemplate` | yes | — | `generateHtmlTemplate` \| `extractHtmlContent` \| `convertToHtmlTable` (**documented** + **descriptor**) |
| html | string | placeholder doc | no* | operation = generateHtmlTemplate | HTML template to render; `noDataExpression` (expressions resolved via `{{ }}`, not handlebars) (**documented** + **descriptor**) |
| sourceData | options | `json` | no* | operation = extractHtmlContent | `json` \| `binary` (**documented** + **descriptor**) |
| dataPropertyName | string | `data` | yes* | operation = extractHtmlContent | JSON property name (string or array of strings) **or** input binary field name, depending on `sourceData` (**documented** + **descriptor**) |
| extractionValues | fixedCollection | `{ values: [{ key:'', cssSelector:'', returnValue:'text', returnArray:false }] }` (v>1); `{}` (v1) | no* | operation = extractHtmlContent | Repeating `values` rows (see below) (**documented** + **descriptor**) |
| options | collection | `{}` | no | operation ∈ extractHtmlContent, convertToHtmlTable | Operation-specific options (see below) (**documented** + **descriptor**) |

\*Visible/required when the parent `displayOptions` show the field.

### `extractionValues.values` row fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| key | string | `''` | yes | — | Key under which the extracted value is saved (**documented** + **descriptor**) |
| cssSelector | string | `''` | yes | — | CSS selector to search for, e.g. `.price` (**documented** + **descriptor**) |
| returnValue | options | `text` | yes | — | `attribute` \| `html` \| `text` \| `value` (**documented** + **descriptor**) |
| attribute | string | `''` | no | returnValue = attribute | Attribute name whose value to return, e.g. `class` (**documented** + **descriptor**) |
| skipSelectors | string | `''` | no | returnValue = text; @version > 1.1 | Comma-separated selectors to skip in text extraction (**documented** + **descriptor**) |
| returnArray | boolean | `false` | no | — | On = return one entry per matched element (array); off = single string (**documented** + **descriptor**) |

### `extractHtmlContent` options

| name | type | default | notes |
|------|------|---------|-------|
| trimValues | boolean | `true` | Remove leading/trailing spaces and newlines from each value (**documented** + **descriptor**) |
| cleanUpText | boolean | `true` | Remove leading/trailing whitespace, strip line breaks, condense consecutive whitespace to a single space (**documented** + **descriptor**) |

### `convertToHtmlTable` options

| name | type | default | notes |
|------|------|---------|-------|
| capitalize | boolean | `false` | Capitalize table headers (split on `_`, title-case each word, join with space) (**documented** + **descriptor**) |
| customStyling | boolean | `false` | On = no default inline styles applied; off = default border/font/padding styles applied (**documented** + **descriptor**) |
| caption | string | `''` | Caption added inside `<caption>` (**documented** + **descriptor**) |
| tableAttributes | string | `''` | Attributes for `<table>` (e.g. `style="padding:10px"`) (**documented** + **descriptor**) |
| headerAttributes | string | `''` | Attributes for `<th>` header cells (**documented** + **descriptor**) |
| rowAttributes | string \| expression | `''` | Attributes for each `<tr>` (evaluated per item) (**documented** + **descriptor**) |
| cellAttributes | string \| expression | `''` | Attributes for each `<td>` (evaluated per item) (**documented** + **descriptor**) |

### Version differences

- **v1:** `extractionValues` defaults to `{}` (empty, user adds rows); JSON
  source reads the property via a sanitized key (no dot-notation traversal);
  `text` returns the element’s concatenated text content. `skipSelectors` is
  unavailable (**descriptor**).
- **v1.1:** `extractionValues` defaults to one pre-filled row; JSON source
  supports dot-notation paths via lodash `get`; `text` still returns
  concatenated text content; `skipSelectors` still unavailable (**descriptor**).
- **v1.2 (current):** `text` converts the element’s HTML to plain text
  (html-to-text), honoring `skipSelectors`; `skipSelectors` becomes available
  (**documented** + **descriptor**).

## Runtime behavior

### generateHtmlTemplate

- For each input item, read the `html` template string.
- Resolve every `{{ … }}` expression occurrence against the current item
  (expressions may reference item data and built-in methods/variables). `<style>`
  and `<script>` content is included verbatim; JavaScript in `<script>` tags is
  **not** executed (**documented**).
- Output one item per input item with `json: { html: <rendered string> }`
  (**inferred** from output shape).
- **Security (XSS):** generating HTML from workflow data can introduce
  cross-site scripting (XSS) if un-trusted input is interpolated into the
  template. This is a documented risk; callers must sanitize un-trusted inputs
  (**documented**).

### extractHtmlContent

- For each input item, obtain the HTML source:
  - **json:** read `item.json[dataPropertyName]` (a string or array of strings).
    v1 uses a plain key lookup; v1.1+ supports dot-notation paths. If the
    property is missing → `NodeOperationError` ("No property named … exists!")
    (**descriptor**).
  - **binary:** read the binary buffer at `item.binary[dataPropertyName]` and
    decode as UTF-8 (**descriptor**).
- Normalize the source to an array (a single string becomes a one-element
  array). For each HTML string, parse it and run every `extractionValues.values`
  row against it:
  - Select elements via `cssSelector`.
  - `returnArray=true`: produce an array with one entry per matched element.
  - `returnArray=false`: produce a single value from the matched set.
  - Return value semantics (**documented** + **descriptor**):
    - `attribute` → the named attribute’s value (e.g. `class`).
    - `html` → the element’s inner/outer HTML (or `undefined` if none).
    - `text` → element text: v≤1.1 concatenated text content; v1.2 html-to-text
      conversion honoring `skipSelectors`.
    - `value` → the value of an `<input>`/`<select>`/`<textarea>`.
  - If the raw value is `undefined`, it is returned as-is (no trim/cleanup).
  - Otherwise apply `trimValues` then `cleanUpText` (both default on).
- Output one item per HTML string per input item, each `json` containing the
  extracted keys; `pairedItem` points at the source item (**inferred**).

### convertToHtmlTable

- Requires at least one input item (no-op on empty input). Collects the union of
  all JSON keys across all input items as column headers (insertion order)
  (**inferred**).
- Emits a single output item `json: { table: <html string> }` whose `pairedItem`
  references every input item (**inferred**).
- Table structure: `<table>` wrapping `<thead>` (one header row of `<th>`) and
  `<tbody>` (one `<tr>` per input item, one `<td>` per header) (**inferred**).
- When `customStyling` is off, default inline styles are applied to the table,
  headers, and cells; when on, only user-supplied attribute strings are applied
  (**documented** + **descriptor**).
- `caption` (if non-empty) adds a `<caption>` element (**documented**).
- `capitalize` title-cases each header (split on `_`) (**documented**).
- Cell rendering: boolean values render as a checked/unchecked
  `<input type="checkbox">`; all other values are stringified into the `<td>`
  (**inferred**).
- `tableAttributes`/`headerAttributes` are resolved once; `rowAttributes`/
  `cellAttributes` are resolved per item (may be expressions) (**descriptor**).

### Errors

- `extractHtmlContent` with a missing JSON property → `NodeOperationError`;
  with `continueOnFail`, the item is emitted as `{ json: { error: <message> } }`
  (**descriptor**).
- Binary source with a missing/invalid binary field → error (assert binary data)
  (**inferred**).
- `convertToHtmlTable` on empty input produces no output item (**inferred**).

### Expressions

- `generateHtmlTemplate`: the `html` template resolves `{{ … }}` expressions
  inline (`noDataExpression` is set, so the field itself is not an expression
  parameter, but embedded `{{ }}` are evaluated) (**documented** + **descriptor**).
- `convertToHtmlTable`: `rowAttributes` and `cellAttributes` are evaluated per
  item and accept expressions (**descriptor**).
- Other string parameters accept expressions where the UI exposes them
  (**inferred**).

## Acceptance tests

### Test: generate HTML template with expression

**Given** input items:

```json
[{ "json": { "name": "Ada" } }]
```

**Parameters:**

```json
{
  "operation": "generateHtmlTemplate",
  "html": "<p>Hello {{ $json.name }}!</p>"
}
```

**Expect** output[0]:

```json
[{ "json": { "html": "<p>Hello Ada!</p>" } }]
```

### Test: extract text content from JSON (v1.2)

**Given** input items:

```json
[{ "json": { "data": "<div><p>Price: $10</p><p>Old: $20</p></div>" } }]
```

**Parameters:**

```json
{
  "operation": "extractHtmlContent",
  "sourceData": "json",
  "dataPropertyName": "data",
  "extractionValues": {
    "values": [
      { "key": "price", "cssSelector": "p", "returnValue": "text", "returnArray": true }
    ]
  },
  "options": { "trimValues": true, "cleanUpText": true }
}
```

**Expect** output[0]:

```json
[{ "json": { "price": ["Price: $10", "Old: $20"] } }]
```

### Test: extract attribute (single value)

**Given** input items:

```json
[{ "json": { "data": "<a href=\"https://example.com\" class=\"link\">link</a>" } }]
```

**Parameters:**

```json
{
  "operation": "extractHtmlContent",
  "sourceData": "json",
  "dataPropertyName": "data",
  "extractionValues": {
    "values": [
      { "key": "url", "cssSelector": "a", "returnValue": "attribute", "attribute": "href", "returnArray": false }
    ]
  },
  "options": {}
}
```

**Expect** output[0]:

```json
[{ "json": { "url": "https://example.com" } }]
```

### Test: convert to HTML table (capitalize + boolean)

**Given** input items:

```json
[
  { "json": { "first_name": "Ada", "active": true } },
  { "json": { "first_name": "Grace", "active": false } }
]
```

**Parameters:**

```json
{
  "operation": "convertToHtmlTable",
  "options": { "capitalize": true, "customStyling": true }
}
```

**Expect** a single output item whose `json.table` contains:
- `<th>First Name</th>` (header title-cased from `first_name`),
- one `<tr>` per input item,
- boolean cells rendered as `<input type="checkbox" checked="checked"/>` (true)
  and `<input type="checkbox" />` (false).

### Test: extract from binary field (v1.2)

**Given** input items:

```json
[{
  "json": {},
  "binary": {
    "data": { "data": "PGgxPlRpdGxlPC9oMT4=", "mimeType": "text/html" }
  }
}]
```

(`PGgxPlRpdGxlPC9oMT4=` is base64 for `<h1>Title</h1>`.)

**Parameters:**

```json
{
  "operation": "extractHtmlContent",
  "sourceData": "binary",
  "dataPropertyName": "data",
  "extractionValues": {
    "values": [
      { "key": "heading", "cssSelector": "h1", "returnValue": "text", "returnArray": false }
    ]
  },
  "options": {}
}
```

**Expect** output[0]:

```json
[{ "json": { "heading": "Title" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations + parameter names/enums/defaults | documented + descriptor | Confirmed by `Html.node.js` schema (v2.15.1) |
| `returnValue` enum `attribute`\|`html`\|`text`\|`value` | documented + descriptor | |
| Default `trimValues`/`cleanUpText` = true | descriptor | Docs describe behavior; defaults from schema |
| v1 vs v1.1 vs v1.2 text/skipSelectors/dot-notation differences | descriptor | v1.2 switches `text` to html-to-text conversion |
| `convertToHtmlTable` default inline styles | inferred | Exact style strings from descriptor execute path; not in public docs |
| Boolean → checkbox rendering | inferred | From descriptor execute path |
| `rowAttributes`/`cellAttributes` per-item expression eval | descriptor | `tableAttributes`/`headerAttributes` resolved once |
| Header column order = insertion-order union of keys | inferred | Set-based collection in descriptor execute path |
| Exact `html-to-text` conversion options beyond `skipSelectors` | gap | Not documented |
| Output `pairedItem` shape | inferred | |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/html.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** HTML parsing/extraction should use a cheerio-equivalent parser
  available to the OpenFlow engine; `text` extraction in v1.2 requires an
  html-to-text conversion step honoring `skipSelectors`. Template rendering
  resolves `{{ … }}` expressions only (no handlebars). Never load third-party
  workflow node packages.