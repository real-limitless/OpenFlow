---
type: n8n-nodes-base.xml
displayName: XML
category: Transform
versions: [1]
priority: medium
status: specced
---

# XML

Convert data between JSON and XML. The node reads a value from a named
property on each item, converts it in the selected direction, and writes the
converted result back to the **same** property.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.xml.md | Public docs only |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, `dist/types/nodes.json` → `xml`) | Public descriptor metadata — parameter names, enums, defaults only |

## Wire format

- **Type string:** `n8n-nodes-base.xml`
- **Aliases:** `Parse` (**descriptor** `codex.alias`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Node version:** `1` (**descriptor**)
- **Group / category:** `transform` / Core Nodes → Data Transformation (**descriptor**)
- **Subtitle expression:** `={{$parameter["mode"]==="jsonToxml" ? "JSON to XML" : "XML to JSON"}}` (**descriptor**)
- **Default node color:** `#333377` (**descriptor**)

## Parameters

`mode` selects the conversion direction. The `options` collection changes its
contents based on `mode` (`displayOptions.show.mode`). `dataPropertyName` is
declared twice (one per mode) with identical wire name and default.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `xmlToJson` | yes | — | `jsonToxml` (JSON to XML) \| `xmlToJson` (XML to JSON) (**documented** labels; wire enum + default **descriptor**) |
| xmlNotice | notice | `""` | no | mode ∈ xmlToJson | UI hint: "If your XML is inside a binary file, use the 'Extract from File' node…" — no wire behavior (**descriptor**) |
| dataPropertyName | string | `data` | yes | mode ∈ jsonToxml | Property holding the JSON value to convert; result written back here (**documented**; wire name + default **descriptor**) |
| dataPropertyName | string | `data` | yes | mode ∈ xmlToJson | Property holding the XML string to convert; result written back here (**documented**; wire name + default **descriptor**) |
| options | collection | `{}` | no | mode ∈ jsonToxml | JSON → XML options (see below) (**descriptor**) |
| options | collection | `{}` | no | mode ∈ xmlToJson | XML → JSON options (see below) (**descriptor**) |

> The docs describe **Mode** and **Property Name** as the parameters, plus an
> **Options** collection whose contents depend on Mode. The wire names `mode`,
> `dataPropertyName`, and `options` come from the **descriptor**.

### JSON → XML options (`options`, mode = `jsonToxml`)

All wire names, types, and defaults are **descriptor**; the behavior labels are
**documented**.

| name (display) | type | default | notes |
|----------------|------|---------|-------|
| allowSurrogateChars (Allow Surrogate Chars) | boolean | `false` | Allow characters from Unicode surrogate blocks |
| attrkey (Attribute Key) | string | `$` | Prefix used to access attributes — object keys named `$` are serialized as element attributes |
| cdata (Cdata) | boolean | `false` | Wrap text nodes in `<![CDATA[ … ]]>` instead of escaping when necessary; does not add CDATA if not required |
| charkey (Character Key) | string | `_` | Prefix used to access character content — object keys named `_` are serialized as element text |
| headless (Headless) | boolean | `false` | Omit the XML declaration (`<?xml …?>`) when on; include it when off |
| rootName (Root Name) | string | `root` | Root element name to use |

### XML → JSON options (`options`, mode = `xmlToJson`)

All wire names, types, and defaults are **descriptor**; the behavior labels are
**documented**.

| name (display) | type | default | notes |
|----------------|------|---------|-------|
| attrkey (Attribute Key) | string | `$` | Prefix used to access attributes — attributes are keyed under `$` (when not merged) |
| charkey (Character Key) | string | `_` | Prefix used to access character content — element text is keyed under `_` |
| explicitArray (Explicit Array) | boolean | `false` | Always put child nodes in an array; when off, an array is created only if there is more than one child |
| explicitRoot (Explicit Root) | boolean | `true` | Include the root node in the resulting object |
| ignoreAttrs (Ignore Attributes) | boolean | `false` | Ignore all XML attributes and only create text nodes |
| mergeAttrs (Merge Attributes) | boolean | `true` | Merge attributes and child elements as properties of the parent; when off, attributes are keyed off a child attribute object (under `attrkey`). Ignored if `ignoreAttrs` is on |
| normalize (Normalize) | boolean | `false` | Trim whitespaces inside text nodes |
| normalizeTags (Normalize Tags) | boolean | `false` | Normalize all tag names to lowercase |
| trim (Trim) | boolean | `false` | Trim whitespace at the beginning and end of text nodes |

> The XML → JSON option names (`attrkey`, `charkey`, `explicitArray`,
> `explicitRoot`, `mergeAttrs`, `normalize`, `normalizeTags`, `trim`) match the
> well-known `xml2js` library option set; the JSON → XML option names match the
> `xmlbuilder2` option set. The docs do not name the libraries — this mapping is
> **inferred** from the option semantics. OpenFlow's executor may use any
> converter that honors the same option contract.

## Runtime behavior

### Input

- One conversion per input item (standard item loop) (**inferred**).
- The value to convert is read from `item.json[dataPropertyName]`
  (default `data`) (**documented** + **descriptor**).
- For `mode = jsonToxml`, the value is a JSON object/value to serialize.
- For `mode = xmlToJson`, the value is an XML string to parse.
- The node does not read from a binary property; if the XML is in a binary
  file, the docs direct users to the Extract from File node first
  (**documented**).

### Output

- Item count is preserved: each input item produces one output item (**inferred**).
- **Zero input items → zero output items** (empty `main` output array). The
  node must short-circuit before reading `dataPropertyName` and must **not**
  throw (**inferred** standard n8n transform pattern; confirmed by engine
  `ensureItems` semantics — an empty item list stays empty).
- The converted result is written back to `item.json[dataPropertyName]` — the
  same property that was read (**documented** + **descriptor**).
- All other existing JSON fields on the item are retained; the node augments
  rather than replaces the item (**inferred** from "property which contains the
  data to convert" being read and overwritten in place).
- No binary data is produced (**inferred**).

### Conversion semantics

- **JSON → XML** (`mode = jsonToxml`): the JSON value is wrapped in a root
  element named `rootName` (default `root`). Object keys become child elements.
  Keys named `attrkey` (default `$`) are serialized as attributes on the
  enclosing element; keys named `charkey` (default `_`) are serialized as text
  content. Unless `headless` is on, an XML declaration is emitted. `cdata`
  wraps text in `<![CDATA[ … ]]>` when escaping would otherwise be required.
  (**documented** option behavior; exact serialization **inferred**)
- **XML → JSON** (`mode = xmlToJson`): the XML string is parsed into a JSON
  object. **Attributes on opening tags (e.g. `<root id="x">`) must be
  emitted** — dropping them is a bug. With `explicitRoot` (default on) the
  root element is the top-level key. Element text is placed under `charkey`
  (default `_`). Attributes are either merged as sibling properties
  (`mergeAttrs` default on → `{ "id": "x", "a": { "_": "1" } }`) or nested
  under `attrkey` (default `$` → `{ "$": { "id": "x" }, "a": { "_": "1" } }`).
  Custom `attrkey`/`charkey` values replace the defaults in both modes. With
  `explicitArray` off (default), child elements become arrays only when
  repeated; on, every child is an array. `ignoreAttrs` drops attributes.
  `normalize`/`trim` control whitespace; `normalizeTags` lowercases tag
  names. (**documented** option behavior; exact shapes **inferred**)

### Errors

- **Empty input (zero items) is not an error** — return an empty output array
  without reading `dataPropertyName` (**inferred**).
- Missing required `dataPropertyName` for the selected `mode` → fail
  (**inferred** standard required-field validation).
- `dataPropertyName` resolving to a missing/`undefined` value, or an
  unparseable XML string (xmlToJson) / non-serializable value (jsonToxml) →
  fail (**inferred**).
- For `xmlToJson`, a non-string value at `dataPropertyName` (e.g. a number)
  → fail with a "must be a string" message (**inferred**).
- `continueOnFail`: a failed item yields an error on the item / empty output
  per engine policy (**inferred**).

### Expressions

The descriptor declares plain types (`string`, `boolean`, `options`,
`collection`) for all parameters — no `stringOrExpression` variants. n8n
string fields generally accept expressions (`{{ … }}`) in the UI, so
`dataPropertyName` and string-valued options are expected to accept
expressions, but this is **inferred** (not declared in the descriptor).

## Acceptance tests

### Test: XML to JSON (basic, default options)

**Given** input items:

```json
[{ "json": { "data": "<root><a>1</a></root>" } }]
```

**Parameters:**

```json
{
  "mode": "xmlToJson",
  "dataPropertyName": "data"
}
```

**Expect** output[0]:

```json
[{ "json": { "data": { "root": { "a": { "_": "1" } } } } }]
```

### Test: JSON to XML (basic, default options, headless)

**Given** input items:

```json
[{ "json": { "data": { "a": "1" } } }]
```

**Parameters:**

```json
{
  "mode": "jsonToxml",
  "dataPropertyName": "data",
  "options": { "headless": true }
}
```

**Expect** output[0]:

```json
[{ "json": { "data": "<root><a>1</a></root>" } }]
```

### Test: XML to JSON — attributes merged (mergeAttrs default true)

**Given** input items:

```json
[{ "json": { "data": "<root id=\"x\"><a>1</a></root>" } }]
```

**Parameters:**

```json
{
  "mode": "xmlToJson",
  "dataPropertyName": "data"
}
```

**Expect** output[0]:

```json
[{ "json": { "data": { "root": { "id": "x", "a": { "_": "1" } } } } }]
```

### Test: XML to JSON — attributes nested (mergeAttrs false)

**Given** input items:

```json
[{ "json": { "data": "<root id=\"x\"><a>1</a></root>" } }]
```

**Parameters:**

```json
{
  "mode": "xmlToJson",
  "dataPropertyName": "data",
  "options": { "mergeAttrs": false }
}
```

**Expect** output[0]:

```json
[{ "json": { "data": { "root": { "$": { "id": "x" }, "a": { "_": "1" } } } } }]
```

### Test: XML to JSON — custom attrkey and charkey (mergeAttrs false)

**Given** input items:

```json
[{ "json": { "data": "<root id=\"x\"><a>1</a></root>" } }]
```

**Parameters:**

```json
{
  "mode": "xmlToJson",
  "dataPropertyName": "data",
  "options": { "attrkey": "@", "charkey": "#", "mergeAttrs": false }
}
```

**Expect** output[0]:

```json
[{ "json": { "data": { "root": { "@": { "id": "x" }, "a": { "#": "1" } } } } }]
```

### Test: empty input produces empty output

**Given** input items:

```json
[]
```

**Parameters:**

```json
{
  "mode": "xmlToJson",
  "dataPropertyName": "data"
}
```

**Expect** output[0]:

```json
[]
```

The node must not throw or read `dataPropertyName` when there are zero input
items.

### Test: JSON to XML — attributes via attrkey, text via charkey

**Given** input items:

```json
[{ "json": { "data": { "a": { "$": { "id": "x" }, "_": "1" } } } }]
```

**Parameters:**

```json
{
  "mode": "jsonToxml",
  "dataPropertyName": "data",
  "options": { "headless": true }
}
```

**Expect** output[0]:

```json
[{ "json": { "data": "<root><a id=\"x\">1</a></root>" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| `mode` enum + default `xmlToJson` | descriptor | Docs list the two modes but not a default |
| Wire names `dataPropertyName`/`options`/`xmlNotice` | descriptor | Docs use display labels ("Property Name", "Options") only |
| Alias `Parse` | descriptor | `codex.alias` |
| All option wire names, types, defaults | descriptor | Confirmed by v2.15.1 `dist/types/nodes.json` |
| `mergeAttrs` default `true` | descriptor | Docs describe the option but not a default |
| `explicitRoot` default `true` | descriptor | Docs describe the option but not a default |
| Read-from / write-back-to same property | documented + inferred | Docs: "property which contains the data to convert"; in-place overwrite inferred |
| Per-item loop / item-count preservation / field retention | inferred | Standard n8n transform pattern |
| Empty input → empty output (no throw) | inferred | Standard n8n transform pattern; `ensureItems` preserves empty input |
| Attribute emission on XML→JSON (mergeAttrs true/false, custom attrkey) | documented + inferred | Docs describe merge/ignore behavior; exact output shapes inferred from option semantics |
| Non-string value at `dataPropertyName` for xmlToJson → error | inferred | Type-validation inferred from string input expectation |
| Underlying converter libraries | inferred | Option names match `xml2js` (xmlToJson) and `xmlbuilder2` (jsonToxml); docs do not name them |
| Exact XML declaration text / whitespace / self-closing tags | inferred | Fixtures use `headless: true` to avoid declaration-format variance; with `headless: false` the declaration string is library-dependent |
| Dot-notation in `dataPropertyName` | inferred (not documented) | Docs say "the name of the property"; no dot-notation mention — treat as a simple key |
| Expression acceptance | inferred | Descriptor declares plain types; n8n string fields generally accept expressions |
| Binary input/output | inferred | No binary parameters; docs redirect binary XML to Extract from File |
| Error message strings | inferred | |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/xml.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Use an XML↔JSON converter honoring the `attrkey`/`charkey`/
  `explicitArray`/`explicitRoot`/`mergeAttrs`/`normalize`/`normalizeTags`/
  `trim` option contract (xmlToJson) and the `allowSurrogateChars`/`attrkey`/
  `cdata`/`charkey`/`headless`/`rootName` contract (jsonToxml) behind the
  executor; never load the `n8n-nodes-base` package. Read
  `item.json[dataPropertyName]`, convert, write back to the same property.
  Preserve all other JSON fields. No credentials required.
  **Critical implementer contract:** (1) attributes on XML opening tags
  **must** be emitted in xmlToJson — `mergeAttrs:true` merges them as sibling
  properties, `mergeAttrs:false` nests them under `attrkey`; custom
  `attrkey`/`charkey` replace defaults. (2) Empty input (zero items) returns
  empty output — do not throw or read `dataPropertyName`.