---
type: "@n8n/n8n-nodes-langchain.outputParserAutofixing"
displayName: Auto-fixing Output Parser
category: AI
versions: [1]
priority: medium
status: specced
---

# Auto-fixing Output Parser

Cluster **sub-node**: wraps another output parser and delegates parsing to it.
If that inner parser fails, this node calls out to a **separate LLM** to fix the
error and then retries the inner parser with the corrected output
(**documented**). It exposes the combined parser handle to a root AI node
(AI Agent, LLM Chain) on the `ai_outputParser` channel, so root nodes can force
a specific output format while tolerating the occasional invalid model answer.

Unlike the Structured Output Parser (whose optional `autoFix` repair mechanism
is unspecified), the Auto-fixing Output Parser is defined by its repair loop and
**requires** an LLM connection to work at all (**documented** + **public JSON**).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.outputparserautofixing.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://js.langchain.com/docs/concepts/output_parsers | Third-party docs (related resource linked from public docs) |
| https://api.n8n.io/api/workflows/1957 (n8n template "Force AI to use a specific output format") | Public workflow JSON |
| n8n template gallery API export (workflow 3891, visual reference library) | Public workflow JSON |
| CORPUS_DIR (`/tmp/openflow-factory-run-20260730-213027/@n8n_n8n-nodes-langchain.outputParserAutofixing`) | Useless for this node — it is the `n8n-nodes-base@2.15.1` package (no langchain descriptors); its `docs/page.md` is a 404 page redirecting to the sub-node docs URL above |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.outputParserAutofixing`
- **Aliases:** (none observed in public exports)
- **typeVersion:** `1` observed in public templates (**public JSON**); no other
  version documented (**gap**)
- **Inputs:**
  - `ai_outputParser` × 1 — the **inner/wrapped parser** handle (another
    output-parser sub-node, e.g. Structured Output Parser) that does the actual
    parsing (**public JSON** topology: autofixing parser connects to a separate
    parser sub-node upstream)
  - `ai_languageModel` × 1 — the LLM used to fix invalid output when the inner
    parser fails (**public JSON** topology + **documented** "calls out to
    another LLM")
  - none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster
    docs)
- **Outputs:**
  - `ai_outputParser` × 1 — connects **into** a root node's output-parser input
    (e.g. `hasOutputParser` on the root); the handle is the wrap-then-fix
    composite (**public JSON** channel name; confirmed in-repo in
    `langchain-agent.ts` `ai_outputParser` branch)
- **Credentials:** none (**inferred** — no auth needed for the LLM call; the
  LLM sub-node owns its own credentials)

Cluster topology: this node sits **between** an inner parser sub-node and a
root AI node on the `ai_outputParser` channel. The root exposes its output
parser attachment point only after the user enables **Require Specific Output
Format** (`hasOutputParser`) on the root (**documented** common issues for the
parser family). The inner parser owns the schema; this node owns only the
repair loop; the fixer LLM owns the correction (**documented** + **public
JSON**).

## Parameters

UI labels from **public docs**; wire names from **public workflow JSON**.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| options.prompt | string | See default template below (**public JSON** — identical string in two independent template exports) | no | — | UI: **Prompt**. The repair message template sent to the fixer LLM. Placeholders are substituted with the original format instructions, the failed completion, and the parse error (**public JSON**). |

Default repair template (verbatim from **public JSON**, identical in templates
1957 and 3891):

```
Instructions:
{instructions}

Completion:
{completion}

Above, the Completion did not satisfy the constraints given in the Instructions.
Error:
{error}
```

No operation/resource selector and no node-level parameters other than the
repair prompt — the parse target is the connected inner parser, and the fixer
is the connected LLM (**documented** + **public JSON**).

## Runtime behavior

### Role

1. Expose a **parser handle** on output channel **`ai_outputParser`** for the
   parent root to call. This node does **not** emit normal `main` items by
   itself in the cluster pattern (**public JSON** / cluster model).
2. On parse, **delegate** to the inner parser connected on its
   `ai_outputParser` input (**documented** "wraps another output parser").
3. If the inner parser succeeds, return its result (**documented** wrap
   behavior).
4. If the inner parser fails, **call out to another LLM** (the
   `ai_languageModel` input) to fix the errors, then retry the inner parser
   with the corrected output (**documented**).
5. As a **sub-node**, any expression resolves against the **first** input item
   only (**documented** sub-node parameter resolution).

### Parser handle contract (parent-invoked)

The parent root (AI Agent / LLM Chain) drives parsing through the handle.
Interface is **inferred** from documented behavior + the in-repo
`OutputParserHandle` contract (`langchain-agent.ts`); OpenFlow baselines are
marked.

- **`parse(text: string): unknown`** — the root calls this with the final
  assistant text after its loop completes. The handle runs the repair loop
  described below and returns the structured result (**documented** + in-repo
  agent contract: `output = parserHandle.parse(finalText)`).
- The returned object replaces the plain string the root would otherwise emit
  as `output` (**documented** + in-repo agent contract).
- Repair loop (**documented** steps, **public JSON** placeholders):
  1. Call `innerParserHandle.parse(text)`.
  2. On success → return the inner result.
  3. On error → build the repair prompt from `options.prompt`, substituting
     `{instructions}` (the format instructions of the wrapped parser),
     `{completion}` (the failed output), and `{error}` (the parse error)
     (**public JSON** placeholder set).
  4. Send the prompt to the fixer LLM on `ai_languageModel`; the LLM returns a
     corrected completion.
  5. Retry `innerParserHandle.parse(correctedCompletion)`.
  6. Success → return; failure → fail the parse (**inferred** — the docs
     describe one repair pass; single retry matches the LangChain
     `AutoFixOutputParser` default `maxRetries = 1`, which the default prompt
     mirrors).

### Errors

| Condition | Behavior |
|-----------|----------|
| No inner parser connected on `ai_outputParser` input | Configuration error at parse time — there is nothing to delegate to (**inferred** cluster model; parsing is defined relative to the wrapped parser) |
| No fixer LLM connected on `ai_languageModel` input | First attempt runs; if the inner parser fails, repair is impossible → fail the item/node (**inferred** — the node is defined by its fix behavior) |
| Inner parser rejects the model output | Trigger the repair loop (**documented**) |
| Fixer LLM returns output that still fails the inner parser | Fail the item/node (**inferred** single-retry loop) |
| Fixer LLM errors (rate limit, auth, network) | Propagate the LLM error (**inferred** standard LLM sub-node error handling) |
| No root node consuming the handle | Sub-node has no effect on `main` (**inferred** cluster model) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `options.prompt` may be an expression string (`={{ … }}`); templates store
  the literal default (**public JSON**).
- Sub-node rule: multi-item expressions always use the **first** item
  (**documented**).

## Acceptance tests

### Test: wire shape — happy path (no repair)

**Parameters:** (none beyond the default; `options.prompt` omitted)

```json
{ "options": {} }
```

**Cluster:** Structured Output Parser (JSON Schema mode) → Auto-fixing Output
Parser `ai_outputParser` → AI Agent `ai_outputParser` (with
`hasOutputParser: true` on the agent); Auto-fixing `ai_languageModel` → mock
LLM.

**Expect:** parent can call `parse(text)`; a valid completion such as
`{"name":"Bob","age":25}` returns `{ "name": "Bob", "age": 25 }`. The fixer LLM
receives **zero** calls (first-attempt success).

### Test: wire shape — repair on invalid output

**Given** the inner Structured parser rejects a completion (e.g. invalid JSON).

**Expect:** `parse(invalid)` returns the parsed value of the fixer's corrected
completion. The fixer LLM receives exactly **one** message whose text contains
the `{instructions}`, the failed `{completion}`, and the `{error}` substitutions
(assert the prompt content).

### Test: default repair prompt substitution

**Parameters:**

```json
{
  "options": {
    "prompt": "Instructions:\n{instructions}\n\nCompletion:\n{completion}\n\nAbove, the Completion did not satisfy the constraints given in the Instructions.\nError:\n{error}"
  }
}
```

**Given** a failing inner parser and a mock fixer LLM.

**Expect:** the message sent to the fixer LLM equals the parameter with
`{instructions}` replaced by the wrapped parser's format instructions,
`{completion}` replaced by the rejected output, and `{error}` replaced by the
inner parser's error message. A non-default `prompt` parameter is honored
verbatim (this fixture exercises an explicit value).

### Test: repair exhausted

**Given** the fixer LLM returns output that the inner parser still rejects.

**Expect:** `parse(text)` throws the inner parser's final error; no second
repair attempt is made (single-retry loop).

### Test: no fixer LLM connected

**Parameters:**

```json
{ "options": {} }
```

**Cluster:** inner parser only (no `ai_languageModel` connection).

**Expect:** `parse(valid)` succeeds via the inner parser; `parse(invalid)` fails
because repair cannot run — the item/node errors rather than silently passing
the unparsed text.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, wrap-then-fix behavior | documented | Primary docs page |
| Requires a separate LLM to fix errors | documented | "it calls out to another LLM to fix any errors" |
| Channel names `ai_outputParser` (input + output) and `ai_languageModel` (input) | public JSON | Template 1957 topology: fixer LLM + inner parser + root chainLlm |
| `options.prompt` wire name | public JSON | Templates 1957 + 3891 |
| Default repair prompt text + `{instructions}`/`{completion}`/`{error}` placeholders | public JSON | Identical string in two independent template exports; mirrors LangChain `AutoFixOutputParser` default |
| typeVersion `1` | public JSON | No other version documented |
| How `{instructions}` is populated | inferred | Format instructions of the wrapped parser (e.g. generated JSON Schema) |
| Number of repair attempts (single retry) | inferred | Docs describe one fix pass; matches LangChain `maxRetries = 1` default |
| Other `options.*` members (e.g. retry count) | gap | Only `prompt` observed in public exports |
| Sub-node first-item expression rule | documented | Parameter-resolution hint on primary page |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| Credentials | inferred | None — the fixer LLM sub-node carries its own credentials |
| Output field name on root (`output`) | documented + in-repo | Agent spec + `langchain-agent.ts` |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster sub-nodes)
- **Executor file:** `src/lib/engine/executors/langchain-output-parser-autofixing.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.outputParserAutofixing` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** the executor registers/provides a parser handle on
  `ai_outputParser` whose `json` carries a `parse(text: string): unknown`
  function (matching the in-repo `OutputParserHandle` contract in
  `langchain-agent.ts`). `parse` resolves the **inner parser** handle from the
  `ai_outputParser` input and delegates; on failure it substitutes
  `{instructions}` / `{completion}` / `{error}` into `options.prompt`, invokes
  the LLM resolved from the `ai_languageModel` input, re-parses the corrected
  completion, and returns the result or throws. Do **not** load
  `@n8n/nodes-langchain` packages.
- **Parent contract:** the root node (AI Agent / LLM Chain) calls
  `parserHandle.parse(finalText)` and sets `output` to the structured result;
  see `langchain-agent.ts:312-315`.
