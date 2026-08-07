---
type: n8n-nodes-base.x
displayName: XML (Parse)
category: Transform
versions: [1]
priority: medium
status: specced
---

# XML (Parse)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.xml/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.x`
- **Aliases:** `Parse`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options: `xmlToJson` \| `jsonToxml` | `xmlToJson` | yes | — | Conversion direction |
| dataPropertyName | string | `data` | yes | — | Name of the item property holding the source text to convert |
| options | collection | `{}` | no | — | Per-mode conversion options |

### Options (shared — both modes)

| name | type | default | notes |
|------|------|---------|-------|
| attrkey | string | `$` | Prefix used by the conversion engine to access XML attributes in the output object |
| charkey | string | `_` | Prefix used to access XML character/text content in the output object |

### Options (JSON to XML mode only)

| name | type | default | notes |
|------|------|---------|-------|
| allowSurrogateChars | boolean | `false` | Allow Unicode surrogate block characters in output |
| cdata | boolean | `false` | Wrap text nodes in `<![CDATA[...]]>` when necessary |
| headless | boolean | `false` | Omit the XML declaration header (`<?xml version="1.0"?>`) |
| rootName | string | `root` | Name of the root XML element |

### Options (XML to JSON mode only)

| name | type | default | notes |
|------|------|---------|-------|
| explicitArray | boolean | `false` | Always place child nodes in an array; otherwise array only for multiple children |
| explicitRoot | boolean | `true` | Include the root XML element as a named key in the output object |
| ignoreAttrs | boolean | `false` | Discard all XML attributes, producing text-only nodes |
| mergeAttrs | boolean | `true` | Merge attributes and child elements into the same parent object rather than a nested attribute key |
| normalize | boolean | `false` | Trim whitespace inside text node values |
| normalizeTags | boolean | `false` | Lowercase all XML tag names in the output |
| trim | boolean | `false` | Trim leading/trailing whitespace from text node values |

## Runtime behavior

### Input

- Accepts items on `main[0]`.
- Reads the source string from the item property named by `dataPropertyName` (default `data`).
- For `xmlToJson` mode the source is an XML string; for `jsonToxml` the source is a JSON string.

### Output

- Emits one output item per input item on `main[0]`.
- The converted data is written to the same `dataPropertyName` property on the output item.
- All other item properties pass through unchanged.

### Errors

- If `dataPropertyName` is missing or empty on an input item, the node should throw a descriptive error.
- If the source string is not valid XML/JSON, the node should throw a parse error.
- If `continueOnFail` is enabled, the failing item is omitted from output instead.

### Expressions

- `dataPropertyName` accepts expression strings.
- `mode` accepts expression strings.
- Options values accept expression strings.

## Acceptance tests

### Test: XML to JSON conversion

**Given** input items:

```json
[{
  "json": {
    "data": "<root><item id=\"1\">hello</item></root>"
  }
}]
```

**Parameters:**

```json
{
  "mode": "xmlToJson",
  "dataPropertyName": "data",
  "options": {}
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "data": {
      "root": {
        "item": [
          {
            "_": "hello",
            "$": { "id": "1" }
          }
        ]
      }
    }
  }
}]
```

### Test: JSON to XML conversion

**Given** input items:

```json
[{
  "json": {
    "data": {
      "root": {
        "item": [
          { "_": "hello", "$": { "id": "1" } }
        ]
      }
    }
  }
}]
```

**Parameters:**

```json
{
  "mode": "jsonToxml",
  "dataPropertyName": "data",
  "options": {}
}
```

**Expect** output[0] to contain `data` with an XML string matching `<root><item id=\"1\">hello</item></root>`.

### Test: Headless JSON to XML

**Given** input items:

```json
[{
  "json": {
    "data": { "person": { "name": "Alice" } }
  }
}]
```

**Parameters:**

```json
{
  "mode": "jsonToxml",
  "dataPropertyName": "data",
  "options": {
    "headless": true,
    "rootName": "person"
  }
}
```

**Expect** output[0].json.data to be `<person><name>Alice</name></person>` (no XML declaration).

### Test: Property passthrough

**Given** input items:

```json
[{
  "json": {
    "data": "<a>b</a>",
    "originalId": 42
  }
}]
```

**Parameters:**

```json
{
  "mode": "xmlToJson",
  "dataPropertyName": "data"
}
```

**Expect** output[0].json to contain both `data` (the converted object) and `originalId` (unchanged, 42).

### Test: Invalid source error

**Given** input items:

```json
[{
  "json": {
    "data": "not xml content"
  }
}]
```

**Parameters:**

```json
{
  "mode": "xmlToJson",
  "dataPropertyName": "data"
}
```

**Expect** an error to be thrown (or item dropped if `continueOnFail`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Mode options and defaults | documented | Full parameter set from public docs and published JSON descriptor |
| Output shape conventions | inferred | Based on standard XML-JSON conversion library (xml2js) conventions; actual key names depend on options |
| Error behavior | inferred | Standard n8n error-throwing pattern; `continueOnFail` is a platform-wide setting |
| Property passthrough | inferred | Standard n8n behavior for transform nodes |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/xml.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
