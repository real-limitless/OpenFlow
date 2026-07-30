---
type: "@n8n/n8n-nodes-langchain.chainSummarization"
displayName: Summarization Chain
category: AI
versions: [1]
priority: medium
status: implemented
---

# Summarization Chain

Cluster **root** node: summarizes multiple documents using a connected chat model. Selects a data source (incoming JSON/binary items or a document-loader sub-node), optionally chunks the text, then runs a summarization strategy (Map Reduce / Refine / Stuff) to produce a single summary. The document-focused sibling of the Basic LLM Chain — **no tool loop, no memory**.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.chainsummarization.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains.md | Public docs only |
| https://js.langchain.com/docs/tutorials/summarization/ | Third-party docs (summarization method semantics) |
| https://js.langchain.com/v0.1/docs/modules/chains/document/map_reduce/ | Third-party docs (Map Reduce) |
| https://js.langchain.com/v0.1/docs/modules/chains/document/refine/ | Third-party docs (Refine) |
| https://js.langchain.com/v0.1/docs/modules/chains/document/stuff/ | Third-party docs (Stuff) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.chainSummarization`
- **Aliases:** (none observed)
- **typeVersion:** `1` (**inferred** — not observed in available public JSON; **gap**)
- **Inputs:**
  - `main` × 1 — workflow items carrying the documents/data to summarize (JSON text or binary file content) (**documented**)
  - `ai_languageModel` × 1 — required chat-model sub-node at **index 0** (**documented** + **inferred** from cluster-node model)
  - `ai_documentLoader` × 0..1 — document-loader sub-node, required when data source is "Use Document Loader" (**documented** + **inferred** channel)
  - `ai_textSplitter` × 0..1 — splitter sub-node, required when chunking strategy is "Advanced" (**documented** + **inferred** channel)
- **Outputs:** `main` × 1
- **Credentials:** none on the chain root (model credentials live on the sub-node) (**documented** pattern)
- **Not supported:** `ai_tool` and `ai_memory` — chains explicitly do **not** support tools or memory (**documented** agents-vs-chains distinction)

Cluster topology: sub-nodes connect **into** the chain on AI channels; the chain's `main` output continues the workflow (**documented** cluster-node model).

## Parameters

Wire names **inferred** from UI labels + chainLlm/agent parity; the `@n8n/n8n-nodes-langchain` package descriptor was not in the available corpus, so exact JSON keys are a **gap**. UI labels and defaults are from public docs.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| dataType | options / string | — | yes | — | **Data to Summarize**. Enum: "Use Node Input (JSON)" / "Use Node Input (Binary)" / "Use Document Loader" (**documented**; wire name + enum values **inferred**). |
| chunking | options / string | — | when `dataType` is JSON or Binary | show when data source is Node Input | **Chunking Strategy**. "Simple (Define Below)" / "Advanced" (**documented**; wire name **inferred**). |
| charactersPerChunk | number | — | when `chunking` is Simple | show when chunking = Simple | **Characters Per Chunk** — max characters per chunk (**documented**; wire name **inferred**). |
| chunkOverlap | number | — | no | show when chunking = Simple | **Chunk Overlap (Characters)** — character overlap between adjacent chunks (**documented**; wire name **inferred**). |
| summarizationMethod | options / string | `map_reduce` (**inferred** — docs call Map Reduce "recommended") | no | under "Summarization Method and Prompts" option | **Summarization Method**. `map_reduce` / `refine` / `stuff` (**documented** labels; wire values **inferred**). |
| individualSummaryPrompt | string | built-in example (**documented**) | no | under "Summarization Method and Prompts" option | **Individual Summary Prompts** — per-chunk prompt; **must** include `{text}` placeholder (**documented**; wire name **inferred**). |
| finalPrompt | string | built-in example (**documented**) | no | under "Summarization Method and Prompts" option | **Final Prompt to Combine** — combine step prompt; **must** include `{text}` placeholder (**documented**; wire name **inferred**). |

### Data source detail (documented UI)

| Data to Summarize | Source | Chunking config |
|-------------------|--------|-----------------|
| Use Node Input (JSON) | Text fields of incoming workflow items | Simple (chars/overlap) or Advanced (splitter sub-node) |
| Use Node Input (Binary) | Binary file content of incoming items | Simple (chars/overlap) or Advanced (splitter sub-node) |
| Use Document Loader | Documents from a connected document-loader sub-node | (splitter optional via Advanced) |

### Summarization methods (documented + third-party LangChain docs)

| Method | Semantics | When to use |
|--------|-----------|-------------|
| Map Reduce (recommended) | **Map**: summarize each chunk independently. **Reduce**: combine the per-chunk summaries into a final summary. | Large document sets exceeding a single context window. |
| Refine | Process documents/chunks sequentially; start with an initial summary and iteratively **refine** it with each new chunk's content. | Produces more context-aware summaries; slower (sequential). |
| Stuff | Place **all** documents into a single prompt and request one summary. | Small document sets that fit within the model context window. |

`individualSummaryPrompt` applies to the per-chunk (map) step; `finalPrompt` applies to the combine (reduce) step. Both **must** contain the `{text}` placeholder (**documented**).

## Runtime behavior

### OpenFlow implementer contract (MUST)

Independent behavioral contract for `langchain-chain-summarization.ts`. Paraphrased from public docs; OpenFlow baselines marked where docs are silent. **Do not** load third-party packages.

1. **Resolve AI handles** from cluster connections (engine-supplied; channel names **inferred** from cluster-node model + chainLlm parity):
   - Primary model: `ai_languageModel[0]` — required; missing → "A Chat Model sub-node must be connected" (**documented** pattern + **inferred**).
   - Document loader: `ai_documentLoader[0]` when `dataType` is "Use Document Loader" (**documented** + **inferred**).
   - Text splitter: `ai_textSplitter[0]` when `chunking` is "Advanced" (**documented** + **inferred**).
   - **No** `ai_tool` / `ai_memory` channels (**documented**).
2. **Resolve documents** per the data source:
   - "Use Node Input (JSON)" → extract text from incoming item JSON fields (**documented**; exact field selection **inferred** — likely all string values or a designated text field).
   - "Use Node Input (Binary)" → extract text from incoming item binary content (**documented**; decoding **inferred**).
   - "Use Document Loader" → invoke the document-loader sub-node handle to obtain documents (**documented** + **inferred**).
3. **Chunk documents** (when `dataType` is JSON or Binary):
   - `chunking` = "Simple" → split text into chunks of `charactersPerChunk` with `chunkOverlap` character overlap (**documented**).
   - `chunking` = "Advanced" → delegate splitting to the `ai_textSplitter` sub-node handle (**documented**).
   - "Use Document Loader" path: chunking is optional via the splitter sub-node (**inferred**).
4. **Run summarization strategy** against the chat-model handle:
   - `map_reduce` → summarize each chunk (map), then combine summaries (reduce) (**documented** + third-party).
   - `refine` → sequentially refine a running summary with each chunk (**documented** + third-party).
   - `stuff` → single model call with all documents in one prompt (**documented** + third-party).
   - Custom prompts (`individualSummaryPrompt` / `finalPrompt`) override the built-in defaults; both must contain `{text}` (**documented**).
5. **Output:** set `json.output` to the final summary string. May mirror to `text` for Chat Trigger compatibility (**inferred** from chainLlm/Chat Trigger parity).

### Input

1. Resolve the **document set** as in the implementer contract (per data source).
2. Require a connected **Chat Model** on `ai_languageModel` index 0.
3. Optional **document loader** on `ai_documentLoader` when `dataType` is "Use Document Loader".
4. Optional **text splitter** on `ai_textSplitter` when `chunking` is "Advanced".

### Output

- One main-branch item per execution containing the final summary.
- Final summary field **`output`** (primary); may mirror to **`text`** for Chat Trigger compatibility (**inferred** from chainLlm parity).

### Errors

| Condition | Behavior |
|-----------|----------|
| No chat model connected | Node error (**documented** pattern) |
| No documents / empty input | Fail — nothing to summarize (**inferred**) |
| Custom prompt missing `{text}` placeholder | Fail — placeholder required (**documented**) |
| Model/provider failures | Fail the item/node unless workflow-level retry / continue-on-fail is set (**inferred**) |
| `continueOnFail` | Standard: emit error on item / continue (**inferred**) |

### Expressions

- `individualSummaryPrompt` and `finalPrompt` may accept `{{ … }}` / leading `=` expression forms; evaluate via `ctx.evaluate` (**inferred** from SDK parity).
- `charactersPerChunk` / `chunkOverlap` may accept expressions (**inferred**).

## Acceptance tests

Fixtures for `batch-queue-langchain-chain-summarization.test.ts` (and equivalent). Shape assertions; model content is mock-driven.

### Test: stuff method — small document set

**Given** input items:

```json
[{ "json": { "text": "Document one. Document two." } }]
```

**Parameters:**

```json
{
  "dataType": "json",
  "summarizationMethod": "stuff"
}
```

**Cluster (logical):** chat model on `ai_languageModel` index 0.

**Expect** output[0] (shape; content model-dependent):

```json
[{ "json": { "output": "<non-empty summary string>" } }]
```

### Test: map reduce — chunked documents

**Given** input items:

```json
[
  { "json": { "text": "Chunk A content." } },
  { "json": { "text": "Chunk B content." } }
]
```

**Parameters:**

```json
{
  "dataType": "json",
  "chunking": "simple",
  "charactersPerChunk": 100,
  "chunkOverlap": 10,
  "summarizationMethod": "map_reduce"
}
```

**Expect** output[0]:

```json
[{ "json": { "output": "<non-empty combined summary string>" } }]
```

Model invoked for the map step (per chunk) and the reduce step (combine).

### Test: refine method — sequential refinement

**Given** input items:

```json
[
  { "json": { "text": "First passage." } },
  { "json": { "text": "Second passage." } }
]
```

**Parameters:**

```json
{
  "dataType": "json",
  "summarizationMethod": "refine"
}
```

**Expect** output[0]:

```json
[{ "json": { "output": "<non-empty refined summary string>" } }]
```

Model invoked sequentially, refining the running summary with each chunk.

### Test: document loader data source

**Given** no `main` input documents and `dataType` = "Use Document Loader", with a document-loader sub-node on `ai_documentLoader` returning two documents.

**Parameters:**

```json
{
  "dataType": "documentLoader",
  "summarizationMethod": "stuff"
}
```

**Expect** output[0]:

```json
[{ "json": { "output": "<non-empty summary string>" } }]
```

### Test: advanced chunking via splitter sub-node

**Given** input `[{ "json": { "text": "Long text..." } }]` and a text-splitter sub-node on `ai_textSplitter`.

**Parameters:**

```json
{
  "dataType": "json",
  "chunking": "advanced",
  "summarizationMethod": "map_reduce"
}
```

**Expect:** documents are split by the splitter sub-node handle (not by `charactersPerChunk`); output[0] contains a non-empty summary.

### Test: missing chat model

**Given** input `[{ "json": { "text": "Hello" } }]` and **no** `ai_languageModel` connection.

**Expect:** execution error indicating a Chat Model sub-node must be connected (**documented** pattern).

### Test: custom prompt missing {text} placeholder

**Given** parameters:

```json
{
  "dataType": "json",
  "summarizationMethod": "map_reduce",
  "individualSummaryPrompt": "Summarize this without placeholder."
}
```

**Expect:** error — the `{text}` placeholder is required (**documented**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root Summarization Chain node |
| No tools, no memory | documented | Chains explicitly lack tool/memory support |
| Data source modes (JSON/Binary/Document Loader) | documented | UI labels; wire name `dataType` + enum values inferred |
| Chunking strategy (Simple/Advanced) | documented | UI labels; wire names `chunking`/`charactersPerChunk`/`chunkOverlap` inferred |
| Summarization methods (Map Reduce/Refine/Stuff) | documented + third-party | UI labels + LangChain semantics; wire values `map_reduce`/`refine`/`stuff` inferred |
| Map Reduce = recommended default | documented | Docs call it "recommended"; default wire value inferred |
| Custom prompts + `{text}` placeholder | documented | Wire names `individualSummaryPrompt`/`finalPrompt` inferred |
| Connection channels | inferred | `ai_languageModel` from cluster model; `ai_documentLoader`/`ai_textSplitter` inferred from data-source/chunking behavior |
| Output field `output` / `text` | inferred | From chainLlm/Chat Trigger parity; not confirmed for summarization |
| typeVersion | gap | Not observed in available public JSON |
| Exact JSON field for JSON data source text | gap | Docs say "Node Input (JSON)" but not which field(s) are read |
| Binary decoding details | gap | Docs say "Node Input (Binary)" but not which mime types / encoding |
| Multi-item batching semantics | gap | OpenFlow: process all input items as the document set |
| Exact error strings | inferred | "A Chat Model sub-node must be connected" from pattern |

## OpenFlow mapping

- **Definition group:** `ai` (new) or `core` until an AI group exists
- **Executor file:** `src/lib/engine/executors/langchain-chain-summarization.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; model/loader/splitter supplied via OpenFlow AI sub-node runtime — **do not** load `@n8n/n8n-nodes-langchain` packages
- **Implement priority:** (1) resolve documents per data source, (2) chunk (simple/advanced), (3) run summarization strategy (map_reduce/refine/stuff), (4) custom prompts with `{text}`, (5) `output` field
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-langchain-chain-summarization.test.ts` — cover stuff/map_reduce/refine, document loader, advanced splitter, missing model, missing `{text}` placeholder