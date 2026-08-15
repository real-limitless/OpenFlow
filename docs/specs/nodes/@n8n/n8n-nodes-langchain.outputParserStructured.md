---
type: "@n8n/n8n-nodes-langchain.outputParserStructured"
displayName: Structured Output Parser
category: AI
versions: [1.2, 1.3]
priority: medium
status: specced
---

# Structured Output Parser

Cluster **sub-node**: provides a structured-output parser handle to a root AI
node (AI Agent, LLM Chain) on the `ai_outputParser` channel. It coerces the
root node's final text answer into a JSON object that conforms to a schema the
user defines — either generated from a JSON example or written by hand as a
JSON Schema — so downstream nodes can rely on stable field names and types.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.outputparserstructured.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.outputparserstructured/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://js.langchain.com/docs/concepts/output_parsers | Third-party docs (related resource linked from public docs) |
| https://json-schema.org/learn/miscellaneous-examples | Third-party docs (linked from public docs) |
| Public workflow export JSON (n8n template gallery API) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.outputParserStructured`
- **Aliases:** (none observed in public exports)
- **typeVersion:** `1.2`, `1.3` observed in public templates (**public JSON**);
  no per-version delta documented (**gap**)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** +
  cluster docs)
- **Outputs:**
  - `ai_outputParser` × 1 — connects **into** a root node's output-parser
    input (**public JSON** channel name; confirmed in-repo in the AI Agent spec
    + `langchain-agent.ts` `ai_outputParser` branch)
- **Credentials:** none (**documented** — parsing is local, no service auth)

Cluster topology: this node is attached as a **sub-node** of a root AI node.
The root exposes an **output parser** attachment point only after the user
enables **Require Specific Output Format** (`hasOutputParser`) on the root
(**documented** common issues). The root drives the conversation; this node
owns only the schema + parse call (**documented** cluster-node model +
**public JSON**).

## Parameters

UI labels from **public docs**; wire names from **public workflow JSON**.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| schemaType | options / string | Generate from JSON Example (omitted) (**public JSON** — templates using the example mode omit this key) | no | — | UI: **Schema Type**. Values: `manual` = **Define using JSON Schema** (**public JSON**); the default (omitted) = **Generate from JSON Example** (**public JSON** + **documented**). |
| jsonSchemaExample | string | — | when `schemaType` is not `manual` | show when Schema Type is "Generate from JSON Example" | UI: **JSON Example** — a JSON object whose property **names and types** are used to auto-generate the schema; actual values are ignored (**documented**). n8n treats every field as **mandatory** when generating from an example (**documented**). **OpenFlow:** also accepts a **root JSON array** (common in public templates); schema is `{ type: "array", items: <derived from first element> }` (**public JSON** interop). |
| inputSchema | string | — | when `schemaType` is `manual` | show when Schema Type is "Define using JSON Schema" | UI: **JSON Schema** — a hand-written JSON Schema string (**documented**). `$ref` references are **not supported** (**documented**). |
| autoFix | boolean | `false` when omitted (**inferred**) | no | — | UI label not documented (**gap**). When `true`, invalid model output is auto-corrected before parsing (**inferred** from **public JSON** — template sets `autoFix: true` alongside `jsonSchemaExample`; not described on the docs page). |

No operation/resource selector — the docs page lists only the schema input
(**documented**).

## Runtime behavior

### Role

1. Expose a **parser handle** on output channel **`ai_outputParser`** for the
   parent root to call. This node does **not** emit normal `main` items by
   itself in the cluster pattern (**public JSON** / cluster model).
2. Build a schema from the user input:
   - **Generate from JSON Example** (`schemaType` omitted): parse
     `jsonSchemaExample` as JSON, derive a schema from the property names and
     types, and treat **every** field as **required** (**documented**). Values
     in the example are ignored — only names + types matter (**documented**).
   - **Define using JSON Schema** (`schemaType: "manual"`): use `inputSchema`
     as the JSON Schema verbatim (**documented**). `$ref` is unsupported
     (**documented**).
3. As a **sub-node**, any expression resolves against the **first** input item
   only (**documented** sub-node parameter resolution).

### Parser handle contract (parent-invoked)

The parent root (AI Agent / LLM Chain) drives parsing through the handle.
Interface is **inferred** from documented behavior + the in-repo
`OutputParserHandle` contract (`langchain-agent.ts`); OpenFlow baselines are
marked.

- **`parse(text: string): unknown`** — the root calls this with the final
  assistant text after its loop completes. The handle coerces the text into a
  JSON object conforming to the schema and returns it (**documented** "return
  fields based on a JSON Schema" + in-repo agent contract: `output =
  parserHandle.parse(finalText)`).
- The returned structured object replaces the plain string the root would
  otherwise emit as `output` (**documented** + in-repo agent: `output` is set
  to the parse result when a parser is connected).
- **Auto-fix** (`autoFix: true`): when the model output fails schema
  validation, the parser attempts to correct it (likely via a follow-up LLM
  call) before failing (**inferred** from **public JSON** + the sibling
  Auto-fixing Output Parser docs; exact mechanism is a **gap** — OpenFlow
  baseline: re-prompt or best-effort repair, then re-validate).

### Scope

- The parser structures the **final output** from AI agents / chains only. It
  is **not** intended to structure intermediary output passed to other AI tools
  or stages (**documented** common issues).
- For intermediary formatting, n8n recommends putting the response structure in
  the agent's **System Message** instead (**documented** common issues).
- Structured output parsing is **often not reliable** when working with agents.
  n8n recommends using a separate **LLM Chain** to receive agent data and parse
  it, rather than parsing directly in the agent workflow (**documented** common
  issues).

### Output

When used only as a parser sub-node:

- Connection graph output: `ai_outputParser` → parent.
- No `main`-branch items are produced by this node; the parent incorporates
  the parsed result into its own `main` output (e.g. agent `output`)
  (**public JSON** / cluster model + in-repo agent contract).

### Errors

| Condition | Behavior |
|-----------|----------|
| Model output can't be parsed as JSON / doesn't conform to the schema | Fail the item/node; with `autoFix`, attempt repair first (**inferred** from documented "validate" role + **public JSON** `autoFix`) |
| `jsonSchemaExample` is not valid JSON | Configuration / parse error at setup (**inferred**) |
| `inputSchema` is not valid JSON Schema or uses `$ref` | Configuration error; `$ref` unsupported (**documented**) |
| No root node consuming the handle | Sub-node has no effect on `main` (**inferred** cluster model) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `jsonSchemaExample` and `inputSchema` may be expression strings
  (`={{ … }}`); templates store them as literal JSON strings, sometimes with a
  leading `=` (**public JSON** — e.g. `inputSchema: "={ … }"`).
- Sub-node rule: multi-item expressions always use the **first** item
  (**documented**).

## Acceptance tests

### Test: wire shape — JSON example mode

**Parameters:**

```json
{
  "jsonSchemaExample": "{\n  \"name\": \"Alice\",\n  \"age\": 30\n}"
}
```

**Cluster:** connect this node's `ai_outputParser` → AI Agent `ai_outputParser`
(with `hasOutputParser: true` on the agent).

**Expect:** parent can call `parse(text)`; a valid JSON string like
`{"name":"Bob","age":25}` returns `{ "name": "Bob", "age": 25 }`; both fields
are **required** because the schema was generated from an example
(**documented** mandatory-field rule).

### Test: wire shape — JSON Schema mode

**Parameters:**

```json
{
  "schemaType": "manual",
  "inputSchema": "{\n  \"type\": \"object\",\n  \"properties\": {\n    \"sentiment\": { \"type\": \"string\", \"enum\": [\"pos\",\"neg\",\"neu\"] }\n  },\n  \"required\": [\"sentiment\"]\n}"
}
```

**Expect:** `parse('{"sentiment":"pos"}')` returns `{ "sentiment": "pos" }`;
`parse('{"sentiment":"bad"}')` fails validation (enum violation)
(**documented** JSON Schema conformance).

### Test: $ref unsupported

**Parameters:**

```json
{
  "schemaType": "manual",
  "inputSchema": "{\n  \"$ref\": \"#/definitions/Foo\",\n  \"definitions\": { \"Foo\": { \"type\": \"object\" } }\n}"
}
```

**Expect:** configuration / parse error — `$ref` is not supported
(**documented**).

### Test: example values ignored, types used

**Parameters:**

```json
{
  "jsonSchemaExample": "{\n  \"city\": \"Tokyo\",\n  \"population\": 13960000,\n  \"isCapital\": true\n}"
}
```

**Expect:** the generated schema requires `city` (string), `population`
(number), `isCapital` (boolean); the literal values `Tokyo` / `13960000` /
`true` are **not** enforced — only names + types (**documented**).

### Test: parse result becomes agent output

**Given** a mock agent whose final text is `{"ok": true}` and a parser handle
whose `parse` returns `{ "ok": true }`.

**Parameters (agent):**

```json
{
  "promptType": "define",
  "text": "Return structured data.",
  "hasOutputParser": true,
  "options": { "enableStreaming": false }
}
```

**Expect** output[0]:

```json
[{ "json": { "output": { "ok": true } } }]
```

`output` is the **structured object**, not the raw string (**documented** +
in-repo agent contract: `output = parserHandle.parse(finalText)`).

### Test: autoFix attempts repair

**Parameters:**

```json
{
  "autoFix": true,
  "jsonSchemaExample": "{\n  \"caption\": \"x\",\n  \"textospeech\": \"y\"\n}"
}
```

**Given** model output that is slightly malformed (e.g. missing a field or
extra prose around the JSON).

**Expect:** with `autoFix: true`, the parser attempts to correct the output
before failing; if repair succeeds, returns the conforming object; if it
cannot, fails (**inferred** from **public JSON** `autoFix` + sibling
Auto-fixing Output Parser behavior).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Schema Type (two modes) | documented | Primary docs page |
| `schemaType` wire name + `manual` value | public JSON | Templates with `inputSchema` set `schemaType: "manual"` |
| `jsonSchemaExample` wire name | public JSON | Templates in example mode use this key |
| `inputSchema` wire name | public JSON | Templates in JSON Schema mode use this key |
| Example mode is the default (omitted `schemaType`) | public JSON | Templates using `jsonSchemaExample` omit `schemaType` |
| Wire value for example mode (non-default explicit) | gap | Not observed; default-omitted is sufficient |
| Every field mandatory when generated from example | documented | Primary docs page |
| Example values ignored; only names + types used | documented | Primary docs page |
| Root array as `jsonSchemaExample` | public JSON | Docs say object; templates use `[{...}]`; OpenFlow accepts both |
| `$ref` unsupported in JSON Schema | documented | Primary docs page |
| Channel name `ai_outputParser` | public JSON + in-repo | Confirmed in template exports + `langchain-agent.ts` |
| Parser handle `parse(text)` contract | inferred / OpenFlow contract | In-repo `OutputParserHandle.parse`; docs describe behavior, not the interface |
| `autoFix` parameter | public JSON | Present in templates; not on the docs page |
| `autoFix` mechanism (LLM repair) | inferred | Sibling Auto-fixing Output Parser docs + `autoFix` flag |
| typeVersion 1.2 / 1.3 | public JSON | No per-version delta documented |
| Structures final output only, not intermediary | documented | Common-issues page |
| Not reliable with agents; use LLM Chain instead | documented | Common-issues page |
| Sub-node first-item expression rule | documented | Parameter-resolution hint on primary page |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| Output field name on root (`output`) | documented + in-repo | Agent spec + `langchain-agent.ts` |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster sub-nodes)
- **Executor file:** `src/lib/engine/executors/langchain-output-parser-structured.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.outputParserStructured` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a parser handle on
  `ai_outputParser` whose `json` carries a `parse(text: string): unknown`
  function (matching the in-repo `OutputParserHandle` contract in
  `langchain-agent.ts`). The function builds a schema from `jsonSchemaExample`
  (example mode, all fields required) or `inputSchema` (JSON Schema mode, no
  `$ref`), coerces the text into a conforming JSON object, and returns it.
  When `autoFix` is true, attempt repair of invalid output before failing. Do
  **not** load `@n8n/nodes-langchain` packages.
- **Parent contract:** the root node (AI Agent / LLM Chain) calls
  `parserHandle.parse(finalText)` and sets `output` to the structured result;
  see `langchain-agent.ts:312-315`.