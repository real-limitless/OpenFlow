---
type: n8n-nodes-base.htmlExtract
displayName: HTML Extract
category: Core Nodes
versions: [1]
priority: medium
status: specced
---

# HTML Extract

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.html/ | Public docs only |

Note: The HTML Extract node was merged into the unified HTML node as of n8n v0.213.0. The older standalone extract node is documented here for backwards compatibility; the OpenFlow executor may implement this as a dedicated Extract operation under a combined HTML node or as a standalone node.

## Wire format

- **Type string:** `n8n-nodes-base.htmlExtract`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| sourceData | select: JSON, Binary | JSON | yes | | Where the HTML source comes from |
| jsonProperty | string | | yes | sourceData = JSON | Name of the input JSON property containing HTML (string or array of strings) |
| inputBinaryField | string | | yes | sourceData = Binary | Name of the input binary field containing the HTML file |
| extractionValues | array | [] | yes | | List of extraction rules; each entry is an object |
| extractionValues[].key | string | | yes | | Key to save the extracted value under in the output |
| extractionValues].cssSelector | string | | yes | — |
| extractionValues[].returnValue | select: Attribute, HTML, Text, Value | Text | yes | | Type of content to extract per matched element |
| extractionValues[].attribute | string | | conditionally | returnValue = Attribute | Name of the attribute whose value to return (e.g. `href`, `class`) |
| extractionValues[].skipSelectors | string | | no | returnValue = Text | Comma-separated CSS selectors whose text content should be excluded |
| extractionValues[].returnArray | boolean | false | no | | true = always return an array even for a single match; false = return a single string when only one element matches |

### Options

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| trimValues | boolean | false | no | Remove leading/trailing whitespace and newlines from each extracted value |
| cleanUpText | boolean | false | no | Collapse consecutive whitespace into single space and strip leading/trailing whitespace and newlines |

## Runtime behavior

### Input

Accepts items with either:
- A **JSON** property containing an HTML string (or array of HTML strings) at a named path, or
- A **binary** property referencing an uploaded `.html` file.

Each input item is processed independently — extraction rules are applied to each item's HTML source separately.

### Output

For each input item, the node attaches an `htmlExtract` object keyed by the extraction rule `key` values. The value is either a single string (default) or an array of strings (when `returnArray` is true or multiple elements match).

Output shape per item:

```json
{
  "json": {
    "htmlExtract": {
      "title": "Example Domain",
      "links": ["https://example.com/1", "https://example.com/2"]
    }
  }
}
```

All original input properties are preserved on the output item. The extracted data is merged as a new `htmlExtract` property.

### Errors

- If the HTML source is empty, malformed, or the JSON/binary property does not exist on the input, the node may throw and fail the item (or, with `continueOnFail`, emit the original item with an error property).
- If a CSS selector matches no elements in the document, the corresponding key is omitted from `htmlExtract` for that item (or set to `null`).

### Expressions

All string parameters accept expression strings. The `jsonProperty`, `inputBinaryField`, and `extractionValues[].cssSelector` parameters are the most common targets for dynamic values.

## Acceptance tests

### Test: basic text extraction

**Given** input items:

```json
[{
  "json": {
    "html": "<html><body><h1>Hello World</h1><p class=\"desc\">A description.</p></body></html>"
  }
}]
```

**Parameters:**
```json
{
  "sourceData": "JSON",
  "jsonProperty": "html",
  "extractionValues": [
    { "key": "heading", "cssSelector": "h1", "returnValue": "Text" },
    { "key": "description", "cssSelector": "p.desc", "returnValue": "Text" }
  ]
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "html": "<html><body><h1>Hello World</h1><p class=\"desc\">A description.</p></body></html>",
    "htmlExtract": {
      "heading": "Hello World",
      "description": "A description."
    }
  }
}]
```

### Test: attribute extraction

**Given** input items:

```json
[{
  "json": {
    "page": "<a href=\"/home\" class=\"nav\">Home</a><a href=\"/about\">About</a>"
  }
}]
```

**Parameters:**
```json
{
  "sourceData": "JSON",
  "jsonProperty": "page",
  "extractionValues": [
    { "key": "linkHref", "cssSelector": "a.nav", "returnValue": "Attribute", "attribute": "href" }
  ]
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "page": "<a href=\"/home\" class=\"nav\">Home</a><a href=\"/about\">About</a>",
    "htmlExtract": {
      "linkHref": "/home"
    }
  }
}]
```

### Test: multiple matches as array

**Given** input items:

```json
[{
  "json": {
    "list": "<ul><li>A</li><li>B</li><li>C</li></ul>"
  }
}]
```

**Parameters:**
```json
{
  "sourceData": "JSON",
  "jsonProperty": "list",
  "extractionValues": [
    { "key": "items", "cssSelector": "li", "returnValue": "Text", "returnArray": true }
  ]
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "list": "<ul><li>A</li><li>B</li><li>C</li></ul>",
    "htmlExtract": {
      "items": ["A", "B", "C"]
    }
  }
}]
```

### Test: binary source

**Given** input items with a binary property:

```json
[{
  "json": {},
  "binary": {
    "myFile": {
      "data": "PGh0bWw+PGJvZHk+PHA+SGVsbG88L3A+PC9ib2R5PjwvaHRtbD4=",
      "mimeType": "text/html",
      "fileName": "page.html"
    }
  }
}]
```

**Parameters:**
```json
{
  "sourceData": "Binary",
  "inputBinaryField": "myFile",
  "extractionValues": [
    { "key": "par", "cssSelector": "p", "returnValue": "Text" }
  ]
}
```

**Expect** output[0] includes `json.htmlExtract.par` equal to `"Hello"`.

### Test: options — cleanUpText

**Given** input items:

```json
[{
  "json": {
    "html": "<div>  Lots   of   spaces   and\nnewlines  </div>"
  }
}]
```

**Parameters:**
```json
{
  "sourceData": "JSON",
  "jsonProperty": "html",
  "extractionValues": [
    { "key": "cleaned", "cssSelector": "div", "returnValue": "Text" }
  ],
  "options": {
    "cleanUpText": true
  }
}
```

**Expect** `json.htmlExtract.cleaned` equal to `"Lots of spaces and newlines"` (whitespace collapsed, trimmed).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation name | documented | Public n8n docs confirm Extract HTML Content as a child of the unified HTML node; type string confirmed from corpus metadata |
| Parameter shapes | documented | Public docs cover Source Data, Extraction Values (key, CSS selector, return value, attribute, skip selectors, return array), and options (trim, clean up text) |
| `cleanUpText` vs `trimValues` distinction | documented | Both appear in public docs |
| Skip Selectors behavior | inferred | Public docs mention comma-separated selectors to skip; exact interaction with nested elements is not detailed |
| Output envelope | inferred | Node attaches extracted values under a known key; the exact key `htmlExtract` is inferred from the Extract HTML Content context; original input properties preserved |
| Binary + binary encoding | documented | Source Data selects between JSON and Binary; binary field name is configurable |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/htmlExtract.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
