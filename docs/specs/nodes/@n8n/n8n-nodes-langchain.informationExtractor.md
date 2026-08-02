---
type: "@n8n/n8n-nodes-langchain.informationExtractor"
displayName: Information Extractor
category: AI
versions: [1, 1.1, 1.2]
priority: medium
status: specced
---

# Information Extractor

Cluster **root node** that extracts structured information from free-form text.
It pairs a user-defined output schema with a connected language model sub-node:
the model is instructed to read the input text and return a JSON object that
conforms to the schema, so downstream nodes can rely on stable field names and
types instead of parsing prose.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.information-extractor/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://json-schema.org/learn/miscellaneous-examples | Third-party docs (linked from public docs) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.informationExtractor`
- **Aliases:** (none)
- **Inputs:**
  - `main` × 1 — receives the items whose data is to be extracted
  - `ai_languageModel` × 1 (required, max 1) — the language model sub-node that performs the extraction
- **Outputs:** `main` × 1
- **Credentials:** none (credentials live on the connected `ai_languageModel` sub-node)
- **Cluster role:** Root node (typeVersion `1.2` current; `1`/`1.1` earlier)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `text` | `string` (expression) | `''` | yes | — | The input text to extract information from; typically an expression over the incoming item (e.g. a chat input or a previous node's text field). |
| `schemaType` | `options` | `fromAttributes` | yes | — | How the desired output structure is described: `fromAttributes` (From Attribute Descriptions), `fromJson` (Generate From JSON Example), `manual` (Define using JSON Schema). |
| `attributes` | `fixedCollection` | `{}` | when `schemaType === 'fromAttributes'` | `{ show: { schemaType: ['fromAttributes'] } }` | List of attribute definitions; each entry provides the attribute's name/type and a natural-language description of what to extract into it. |
| `jsonSchemaExample` | `json` | `{}` | when `schemaType === 'fromJson'` | `{ show: { schemaType: ['fromJson'] } }` | An example JSON object used to generate the schema. Only the property names and types are used; the literal values are ignored. Every generated field is treated as required. |
| `inputSchema` | `json` | `{}` | when `schemaType === 'manual'` | `{ show: { schemaType: ['manual'] } }` | A hand-written JSON Schema document that fully defines the output object. |
| `systemPrompt` | `string` | (default prompt) | no | — | Optional custom system prompt for the extraction task. When set, n8n still automatically appends the format-specification instructions to the prompt. |

## Runtime behavior

### Input

- Consumes items on `main`; each item is processed independently.
- The `text` parameter is resolved per item (expression support). An empty or
  missing resolved text is a configuration error.
- The `ai_languageModel` connection is **required**: without a connected model
  sub-node the node cannot run.

### Schema construction

The node builds an output schema from the chosen `schemaType`:

- **From Attribute Descriptions** — the attribute list (name/type + description)
  is turned into an object schema with one property per attribute.
- **Generate From JSON Example** — the example object's property names and
  types are used; values are ignored; every field becomes **required**.
- **Define using JSON Schema** — the `inputSchema` document is used verbatim.

### Output

- One output item per input item on `main`.
- At the outcome level each output carries the **structured extraction object**
  (a JSON object whose keys match the schema) rather than free-form model text.
  OpenFlow baseline wrapper (chain-root convention): the object is exposed as
  `json.output` on an item with `pairedItem` pointing back to the source item.

### Errors

- No `ai_languageModel` sub-node connected → throw.
- `text` resolves to empty / missing → throw.
- `jsonSchemaExample` is not valid JSON, or `inputSchema` is not valid JSON
  Schema → configuration error.
- Model response does not conform to the generated schema (unparsable or
  missing required fields) → validation/parse error.
- `continueOnFail` is supported per standard n8n conventions; on failure the
  node emits an error item `{ json: { error: <message> } }` instead of throwing.

### Expressions

- `text` supports full n8n expression syntax, resolved against the current item.
- Free-text inputs (attribute descriptions, `systemPrompt`, schema strings)
  accept expression strings; resolution follows standard n8n semantics.

## Acceptance tests

### Test: from-attribute-descriptions

**Given** input items:

```json
[{ "json": { "doc": "Acme Inc. was founded in 1999 in San Jose, California." } }]
```

**Parameters:**

```json
{
  "text": "={{ $json.doc }}",
  "schemaType": "fromAttributes",
  "attributes": [
    { "name": "companyName", "description": "The company name mentioned in the text" },
    { "name": "foundingYear", "description": "The year the company was founded, as a number" },
    { "name": "headquarters", "description": "The city and state where the company is based" }
  ]
}
```

**Sub-nodes connected:** `ai_languageModel` → a configured chat model.

**Expect** output[0] contains a structured object with `companyName` (string),
`foundingYear` (number), and `headquarters` (string) populated from the text:

```json
[{ "json": { "output": { "companyName": "Acme Inc.", "foundingYear": 1999, "headquarters": "San Jose, California" } }, "pairedItem": { "item": 0 } }]
```

### Test: generate-schema-from-json-example

**Given** input items:

```json
[{ "json": { "doc": "Order #1042 shipped to Berlin on 2026-07-15." } }]
```

**Parameters:**

```json
{
  "text": "={{ $json.doc }}",
  "schemaType": "fromJson",
  "jsonSchemaExample": "{\n  \"orderId\": \"A-0001\",\n  \"destination\": \"Athens\",\n  \"shippedOn\": \"2026-01-01\"\n}"
}
```

**Expect** the schema is generated from the property names and types only
(`orderId` string, `destination` string, `shippedOn` string) — the example
values (`A-0001`, `Athens`, `2026-01-01`) are ignored. All three fields are
required. Output[0] is a structured object with those three keys populated from
the input text.

### Test: define-using-json-schema

**Parameters:**

```json
{
  "text": "={{ $json.doc }}",
  "schemaType": "manual",
  "inputSchema": "{\n  \"type\": \"object\",\n  \"properties\": {\n    \"sentiment\": { \"type\": \"string\", \"enum\": [\"positive\", \"negative\", \"neutral\"] }\n  },\n  \"required\": [\"sentiment\"]\n}"
}
```

**Expect** output[0] is a structured object with a `sentiment` key whose value
is one of `positive` / `negative` / `neutral`. The `jsonSchemaExample` and
`attributes` inputs are ignored in this mode.

### Test: empty-text throws

**Given** input items:

```json
[{ "json": { "doc": "" } }]
```

**Parameters:**

```json
{
  "text": "={{ $json.doc }}",
  "schemaType": "fromAttributes",
  "attributes": [{ "name": "any", "description": "whatever" }]
}
```

**Sub-nodes connected:** `ai_languageModel` → a configured chat model.

**Expect** the node throws (no extraction performed); with `continueOnFail: true`
it emits `{ "json": { "error": "..." } }` instead.

### Test: missing-model throws

**Given** input items:

```json
[{ "json": { "doc": "Some text." } }]
```

**Parameters:**

```json
{ "text": "={{ $json.doc }}", "schemaType": "fromJson", "jsonSchemaExample": "{\"field\": \"x\"}" }
```

**Sub-nodes connected:** none (`ai_languageModel` unconnected).

**Expect** the node throws a configuration error indicating a language model is
required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Wire type string, root-node role, `ai_languageModel` required input, `main` in/out | documented | Public docs classify it under cluster root nodes; type string confirmed from public descriptor |
| `text` and `schemaType` parameters | documented | Public docs page |
| Schema Type modes (`fromAttributes`, `fromJson`, `manual`) | documented | Public docs page |
| JSON-example mode: names + types only, values ignored, all fields required | documented | Public docs page |
| JSON Schema mode uses verbatim JSON Schema | documented | Public docs page; links to json-schema.org |
| System Prompt Template option; format instructions auto-appended | documented | Public docs page |
| Exact wire names for attributes list, `jsonSchemaExample`, `inputSchema` | inferred | Public docs describe the fields; exact wire keys follow n8n conventions (not independently published) |
| Output wrapper (`json.output` + `pairedItem`) | inferred | Chain-root convention used by sibling Basic LLM Chain spec; not documented for this node |
| One output item per input item | inferred | Standard chain-root behavior |
| Error texts and `continueOnFail` error-item shape | inferred | Standard n8n conventions; not documented for this node |
| Per-version (1 / 1.1 / 1.2) behavior deltas | inferred | No public delta documentation |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster root nodes)
- **Executor file:** `src/lib/engine/executors/langchain-information-extractor.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.informationExtractor` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** resolve `text` per input item, build the output schema from
  `schemaType`, invoke the connected `ai_languageModel` with the default/custom
  system prompt plus appended format instructions, parse the model reply into a
  JSON object conforming to the schema, and emit it as `json.output` on the
  corresponding `main` item. Do **not** load `@n8n/nodes-langchain` packages.
