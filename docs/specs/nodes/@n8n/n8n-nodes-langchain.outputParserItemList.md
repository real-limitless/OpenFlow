---
type: "@n8n/n8n-nodes-langchain.outputParserItemList"
displayName: Item List Output Parser
category: AI
versions: [1]
priority: medium
status: specced
---

# Item List Output Parser

Cluster **sub-node**: provides an output-parser handle to a root AI node (AI
Agent, Basic LLM Chain, etc.) on the `ai_outputParser` channel. It turns the
root node's final text answer into a **list of items** with a user-specified
maximum length and separator, so downstream nodes can iterate over the parsed
elements instead of a single blob of text.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.outputparseritemlist.md | Public docs only |
| https://docs.n8n.io/llms.txt (index entry confirming the canonical page path) | Public docs only |
| https://n8n.io/integrations/item-list-output-parser/ (integration page listing public templates; none observed to contain this node — see Gaps) | Public docs only |
| https://reference.langchain.com/javascript/langchain-core/output_parsers/CustomListOutputParser/parse | Third-party docs (related resource linked from public docs; describes split-by-separator list parsing) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.outputParserItemList`
- **Aliases:** (none observed)
- **typeVersion:** `1` (**inferred** — no version observed in available public
  sources; sibling parsers are ≥ 1.2; treat as single-version, **gap**)
- **Inputs:** none on `main` (sub-node; no main-item pipeline of its own)
  (**inferred** from the cluster sub-node model, matching the in-repo
  `outputParserStructured` definition)
- **Outputs:**
  - `ai_outputParser` × 1 — connects **into** a root node's output-parser
    input (**confirmed** in-repo via the sibling spec + `langchain-agent.ts`
    `ai_outputParser` branch + `core.ts` `outputParserStructured` definition;
    channel name is shared by all output-parser sub-nodes)
- **Credentials:** none (**documented** — parsing is local, no service auth)

Cluster topology: this node is attached as a **sub-node** of a root AI node.
The root exposes an output-parser attachment point after the user enables
**Require Specific Output Format** on the root (see the Basic LLM Chain spec —
`requireSpecificOutputFormat` / `hasOutputParser`). The root drives the model
call; this node owns only the list-splitting step (**documented** cluster-node
model + in-repo root specs).

## Parameters

UI labels and semantics from **public docs**. Wire names are **inferred** from
the camelCase convention used across the langchain sub-nodes plus the
LangChain `ItemListOutputParser` (`length` / `separator`) semantics; the
`@n8n/n8n-nodes-langchain` package descriptor was **not** in the available
corpus (`n8n-nodes-base@2.15.1` contains no langchain descriptors) and no
public workflow JSON using this node was found, so exact JSON keys are a
**gap**.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| numberOfItems | number / expression | `-1` (**inferred**) | no | — | UI: **Number of Items**. Maximum number of items to return. `-1` = unlimited (**documented** semantics; default value **inferred**). |
| separator | options / string | newline (`\n`) (**documented** default) | no | — | UI: **Separator**. The delimiter used to split the model output into separate items. Defaults to a new line (**documented**). |

No operation/resource selector — the docs page lists only these two options
(**documented**).

## Runtime behavior

### Role

1. Expose a **parser handle** on output channel **`ai_outputParser`** for the
   parent root to call. This node does **not** emit normal `main` items by
   itself in the cluster pattern (**inferred** cluster model; consistent with
   the in-repo `outputParserStructured` executor).
2. As a **sub-node**, any expression in `numberOfItems` / `separator`
   resolves against the **first** input item only (**documented** sub-node
   parameter resolution).

### Parser handle contract (parent-invoked)

The parent root (AI Agent / LLM Chain) drives parsing through the handle.
Interface is **inferred** from documented behavior + the in-repo
`OutputParserHandle` contract (`langchain-output-parser-structured.ts:3`);
OpenFlow baselines are marked.

- **`parse(text: string): string[]`** — the root calls this with the final
  assistant text after its model call / loop completes. The handle splits the
  text on the configured `separator` and returns the resulting list of items,
  capped at `numberOfItems` entries (or uncapped when `-1`)
  (**documented** "return a list of items with a specific length and
  separator" + third-party LangChain list-parser semantics).
- The returned list replaces the plain string the root would otherwise emit as
  `output` (**inferred** from the sibling `outputParserStructured` contract,
  where `output = parserHandle.parse(finalText)`; in-repo
  `langchain-agent.ts` `ai_outputParser` branch).
- **Length enforcement:** when the text splits into more items than
  `numberOfItems` (and it is not `-1`), the list is truncated to the first
  `numberOfItems` entries (**inferred** from "maximum items to return"). When
  the text yields fewer items than configured, the available items are
  returned (**inferred**).
- **Separator semantics:** the separator is a literal delimiter; the default
  newline corresponds to one item per line of model output (**documented**
  default + LangChain list-parser behavior). Item contents keep any surrounding
  text on the same line; empty lines produce empty-string items (**inferred**
  from naive split behavior — **gap**).

### Output

When used only as a parser sub-node:

- Connection graph output: `ai_outputParser` → parent.
- No `main`-branch items are produced by this node; the parent incorporates
  the parsed list into its own `main` output (e.g. root `output` becomes the
  array) (**inferred** cluster model + sibling parser contract).

### Errors

| Condition | Behavior |
|-----------|----------|
| `numberOfItems` is not `-1` and the split text yields fewer items than the count | Not documented for this node (**gap**); third-party LangChain list parsers throw on count mismatch (**inferred** — OpenFlow baseline: return the items that exist rather than throw, but flag for review) |
| `numberOfItems` resolves to a non-integer / invalid value | Configuration / evaluation error (**inferred**) |
| `separator` resolves to an empty string | Split degenerates to per-character items (**inferred** from naive split; **gap** — OpenFlow baseline: treat as configuration error) |
| Model text is empty | Empty output; likely a single empty-string item or an empty list (**gap**) |
| No root node consuming the handle | Sub-node has no effect on `main` (**inferred** cluster model) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `numberOfItems` and `separator` may be expression strings (`={{ … }}`)
  (**inferred** from sibling sub-node conventions).
- Sub-node rule: multi-item expressions always use the **first** item
  (**documented**).

## Acceptance tests

### Test: default newline split

**Parameters:**
```json
{
  "numberOfItems": -1,
  "separator": "\n"
}
```

**Cluster:** connect this node's `ai_outputParser` → Basic LLM Chain
(`requireSpecificOutputFormat: true`).

**Expect:** parent can call `parse("one\ntwo\nthree")`; result is
`["one", "two", "three"]` (**documented** default newline separator).

### Test: custom separator

**Parameters:**
```json
{
  "numberOfItems": -1,
  "separator": ", "
}
```

**Expect:** `parse("red, green, blue")` returns
`["red", "green", "blue"]` (**documented** configurable separator).

### Test: capped length

**Parameters:**
```json
{
  "numberOfItems": 2,
  "separator": "\n"
}
```

**Expect:** `parse("a\nb\nc\nd")` returns `["a", "b"]` — truncated to the
maximum of 2 items (**documented** "maximum items to return").

### Test: unlimited length

**Parameters:**
```json
{
  "numberOfItems": -1,
  "separator": "\n"
}
```

**Expect:** `parse("a\nb\nc")` returns `["a", "b", "c"]` — `-1` disables the
cap (**documented**).

### Test: parse result becomes root output

**Given** a mock root whose final text is `"alpha\nbeta"` and a parser handle
whose `parse` returns `["alpha", "beta"]`.

**Parameters (root):**
```json
{
  "promptType": "define",
  "text": "Return two lines.",
  "requireSpecificOutputFormat": true
}
```

**Expect** output[0]:
```json
[{ "json": { "output": ["alpha", "beta"] } }]
```

`output` is the **list**, not the raw string (**inferred** from the sibling
`outputParserStructured` contract: `output = parserHandle.parse(finalText)`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, "list of items with a specific length and separator" | documented | Primary docs page |
| **Number of Items** option (maximum, `-1` = unlimited) | documented | UI label + semantics; wire name `numberOfItems` inferred |
| **Separator** option (defaults to new line) | documented | UI label + default; wire name `separator` inferred; exact separator value (`"\n"` vs literal newline) not confirmed |
| Sub-node first-item expression rule | documented | Parameter-resolution hint on primary page |
| `ai_outputParser` channel name | confirmed in-repo + sibling spec | Shared by all output-parser sub-nodes |
| Parser handle `parse(text): string[]` contract | inferred / OpenFlow contract | Docs describe behavior, not the interface |
| Default `numberOfItems` value | inferred | Docs only state `-1` = unlimited; default not stated |
| Fewer items than count / empty text / empty separator behavior | gap | Not documented for this node |
| typeVersion | gap | Not observed in any public source |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| Wire key names (`numberOfItems`, `separator`) | inferred | Corpus (n8n-nodes-base@2.15.1) has no langchain descriptors; no public template using this node was found despite integration-page tags |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster sub-nodes)
- **Executor file:** `src/lib/engine/executors/langchain-output-parser-item-list.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.outputParserItemList` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES` (mirroring the
  `outputParserStructured` registration at `node-runtime.ts:382`)
- **Runtime note:** executor should register/provide a parser handle on
  `ai_outputParser` whose `json` carries a `parse(text: string): string[]`
  function matching the in-repo `OutputParserHandle` contract
  (`langchain-output-parser-structured.ts:3`). `parse` splits `text` on
  `separator` (default newline) and returns the items, truncated to
  `numberOfItems` entries (or uncapped when `-1`). Resolve expressions against
  the first item (sub-node rule). Do **not** load `@n8n/nodes-langchain`
  packages.
- **Parent contract:** the root node (AI Agent / LLM Chain) calls
  `parserHandle.parse(finalText)` and sets `output` to the resulting list; see
  `langchain-agent.ts` `ai_outputParser` branch.
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-langchain-output-parser-item-list.test.ts`
  — cover newline split, custom separator, capped length, `-1` unlimited, and
  parse-result-as-root-output
