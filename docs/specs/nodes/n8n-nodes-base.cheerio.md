---
type: n8n-nodes-base.cheerio
displayName: HTML (Cheerio)
category: Core Nodes
versions: [1]
priority: medium
status: specced
---

# HTML (Cheerio)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.html/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.html.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.cheerio`
- **Aliases:** `n8n-nodes-base.htmlExtract`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

### Operation (mode selector)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | string: `extractHtmlContent` / `generateHtmlTemplate` / `convertToHtmlTable` | `extractHtmlContent` | yes | Selects the node's mode of operation |

### Extract HTML Content

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| sourceData | string: `json` / `binary` | `json` | yes | Where to read the HTML source |
| jsonProperty | string | `data` | only when sourceData=json | JSON key on input item containing HTML string |
| inputBinaryField | string | `data` | only when sourceData=binary | Binary field name on input item containing .html file |
| extractionValues | array of extraction specs | `[]` | no | Each spec: key (output name), cssSelector (CSS query), returnValue (`text` / `html` / `attribute` / `value`), attributeName (only when returnValue=attribute), skipSelectors (comma-separated, only text mode) |
| returnArray | boolean | false | no | If true, results are returned as arrays even for single matches |
| trimValues | boolean | true | no | Strip whitespace from extracted values |
| cleanUpText | boolean | true | no | Collapse whitespace and strip leading/trailing whitespace |

### Generate HTML Template

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| template | string | (none) | yes | HTML template with `{{ }}` expression placeholders |

### Convert to HTML Table

No required parameters.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| capitalizeHeaders | boolean | true | no | Automatically capitalize table header text |
| customStyling | boolean | false | no | Enable custom HTML attribute styling |
| caption | string | (none) | no | Table caption text |
| tableAttributes | string | (none) | no | Raw HTML attributes for `<table>` |
| headerAttributes | string | (none) | no | Raw HTML attributes for `<th>` |
| rowAttributes | string | (none) | no | Raw HTML attributes for `<tr>` |
| cellAttributes | string | (none) | no | Raw HTML attributes for `<td>` |

## Runtime behavior

### Input (Extract HTML Content)

Each input item is expected to carry either a JSON string property (default `data`) or a binary `.html` file (default binary field `data`) containing the HTML to parse. The same extraction rules apply to every item; one output item is produced per input item.

### Input (Generate HTML Template)

Input item data can be referenced via expressions inside the template. The node renders the template for each item independently.

### Input (Convert to HTML Table)

Input items are converted into `<tr>` rows; property names become `<th>` headers in the first row.

### Output

- **Extract HTML Content:** One output item per input item. Each output item contains a `data` sub-object with keys matching the user-defined extraction key names and their extracted values (string or string-array depending on `returnArray`). The original input JSON is preserved under the root alongside `data`.
- **Generate HTML Template:** One output item per input item. The item's `json.data` property contains the rendered HTML string.
- **Convert to HTML Table:** A single output item containing the HTML table as a string under `json.data`.

### Expressions

All string parameters accept expression syntax (`{{ }}`). Template parameter for Generate HTML Template uses `{{ }}` for expression interpolation within HTML content.

### Errors

- If the HTML source is missing or unreadable from the input, the node throws a descriptive error.
- Invalid CSS selectors produce a parsing error from the underlying selector engine.
- If `continueOnFail` is set, the node outputs an error item for the failing input rather than stopping.

## Acceptance tests

### Test: extract text from HTML

**Given** input items:

```json
[{ "json": { "data": "<div class=\"content\"><p>Hello world</p></div>" } }]
```

**Parameters:**

```json
{
  "operation": "extractHtmlContent",
  "sourceData": "json",
  "jsonProperty": "data",
  "extractionValues": [
    { "key": "paragraph", "cssSelector": ".content p", "returnValue": "text" }
  ]
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "data": "<div class=\"content\"><p>Hello world</p></div>",
    "paragraph": "Hello world"
  }
}]
```

### Test: extract attribute from HTML

**Given** input items:

```json
[{ "json": { "html": "<a href=\"/page\" class=\"link\">click</a>" } }]
```

**Parameters:**

```json
{
  "operation": "extractHtmlContent",
  "sourceData": "json",
  "jsonProperty": "html",
  "extractionValues": [
    { "key": "href", "cssSelector": "a", "returnValue": "attribute", "attributeName": "href" }
  ]
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "html": "<a href=\"/page\" class=\"link\">click</a>",
    "href": "/page"
  }
}]
```

### Test: generate HTML template

**Given** input items:

```json
[{ "json": { "name": "Alice" } }]
```

**Parameters:**

```json
{
  "operation": "generateHtmlTemplate",
  "template": "<h1>Hello {{ $json.name }}</h1>"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "name": "Alice",
    "data": "<h1>Hello Alice</h1>"
  }
}]
```

### Test: convert to HTML table

**Given** input items:

```json
[
  { "json": { "product": "Widget", "price": 9.99 } },
  { "json": { "product": "Gadget", "price": 24.99 } }
]
```

**Parameters:**

```json
{
  "operation": "convertToHtmlTable",
  "capitalizeHeaders": true
}
```

**Expect** output[0] contains `json.data` as an HTML table string with `Product` and `Price` headers and two data rows.

### Test: extract with returnArray on multiple matches

**Given** input items:

```json
[{ "json": { "html": "<ul><li>A</li><li>B</li><li>C</li></ul>" } }]
```

**Parameters:**

```json
{
  "operation": "extractHtmlContent",
  "sourceData": "json",
  "jsonProperty": "html",
  "extractionValues": [
    { "key": "items", "cssSelector": "li", "returnValue": "text" }
  ],
  "returnArray": true
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "html": "<ul><li>A</li><li>B</li><li>C</li></ul>",
    "items": ["A", "B", "C"]
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation names and parameters | Documented | Public docs page covers all three operations and their parameters |
| CSS selector semantics | Documented | Standard CSS selector syntax, delegated to underlying selector engine (Cheerio) |
| Binary input field semantics | Documented | Source Data toggle between JSON and Binary is public |
| skipSelectors behavior | Documented | Only applicable to Text return value |
| Error behavior on malformed HTML | Inferred | Node should gracefully handle missing elements (empty extraction) but throw on unreadable input |
| Explicit type string `n8n-nodes-base.cheerio` | Inferred (alias) | Canonical type is `n8n-nodes-base.htmlExtract`; cheerio type is an alias used for the factory job |
| Default values for trimValues/cleanUpText | Inferred from common defaults | Public docs describe the option but not default |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/htmlExtract.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
