---
type: "@n8n/n8n-nodes-langchain.chainRetrievalQa"
displayName: Question and Answer Chain
category: AI
versions: [1]
priority: medium
status: specced
---

# Question and Answer Chain

Cluster **root** node: Retrieval-Augmented Generation (RAG). Resolves a user
question, retrieves relevant document chunks via a connected **retriever**
(vector-store retriever or Workflow Retriever), then makes a single LLM call
with the retrieved context to produce a grounded answer. The retrieval-enabled
sibling of the Basic LLM Chain — **adds a required retriever; still no tool
loop, no memory**.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.chainretrievalqa.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.chainretrievalqa/common-issues.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/what-chains-do.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/retrieve-relevant-context.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger.md | Public docs only (`chatInput`, `output` / `text`) |
| https://js.langchain.com/docs/tutorials/rag/ | Third-party protocol docs (RAG pattern) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.chainRetrievalQa`
- **Aliases:** (none observed)
- **typeVersion:** `1` placeholder — **not observed** in available public JSON (**gap**)
- **Inputs:**
  - `main` × 1 — workflow items carrying the user question (or prior-node data used by expressions)
  - `ai_languageModel` × 1 — required chat-model sub-node at **index 0** (**inferred** from chainLlm parity; the chain calls an LLM)
  - `ai_retriever` × 1 — **required** retriever sub-node (**documented** — "A Retriever sub-node must be connected"). May be a vector-store retriever or the Workflow Retriever node (**documented**).
  - `ai_outputParser` × 0..1 — optional output-parser sub-node when `hasOutputParser` is true (**inferred** from chainLlm parity; not documented for this node — **gap**)
- **Outputs:** `main` × 1
- **Credentials:** none on the chain root (model/retriever credentials live on the sub-nodes) (**documented** pattern)
- **Not supported:** `ai_tool` and `ai_memory` — chains explicitly do **not** support tools or memory (**documented**)

Cluster topology: sub-nodes connect **into** the chain on AI channels; the chain's `main` output continues the workflow (**documented** cluster-node model).

## Parameters

Wire names **inferred** from chainLlm/agent parity + common-issues confirmation; UI labels and defaults from public docs. The main docs page labels the user-facing parameter **"Query"** ("The question you want to ask"); the common-issues page confirms the underlying **Prompt** selector with "Define below" / "Connected Chat Trigger Node" / `chatInput` — the same prompt mechanism as the Basic LLM Chain.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| promptType | options / string | `auto` when omitted (**inferred**) | no | — | UI: **Prompt**. `define` = "Define below" (**inferred** wire name from chainLlm parity); auto / "Connected Chat Trigger Node" reads input field `chatInput` (**documented** common-issues). Docs page calls this parameter **Query**. |
| text | string | — | when `promptType` is `define` | show when prompt is "Define below" | **The question text** — static text or expression; evaluate with `ctx.evaluate` **per input item** (**documented** common-issues "Text" field + **inferred** wire name). |
| hasOutputParser | boolean | `false` when omitted | no | — | **Require Specific Output Format**; when true, connect an output-parser sub-node on `ai_outputParser` and apply it to the final answer (**inferred** from chainLlm parity; not documented for this node — **gap**). |

## Runtime behavior

### OpenFlow implementer contract (MUST)

Independent behavioral contract for `langchain-chain-retrieval-qa.ts`. Paraphrased from public docs; OpenFlow baselines marked where docs are silent. **Do not** load third-party packages.

1. **Per-item loop (batching):** iterate over `ctx.getInputItems(0)` and process **one retrieve + model call per main input item** in order; emit one main output item per successful item. Multi-item semantics are a **gap** in public docs → OpenFlow baseline.
2. **Resolve query per item:**
   - `promptType` omitted / auto / "Connected Chat Trigger Node" → `String(item.json.chatInput ?? "")`; empty/null → error "No prompt specified" (**documented** common-issues).
   - `promptType === "define"` → `await ctx.evaluate(params.text)` with **item-scoped** expressions; null/empty → error (**documented** common-issues).
3. **Resolve AI handles** from cluster connections (engine-supplied; channel names **documented** for `ai_retriever`, **inferred** for the rest from chainLlm parity):
   - Primary model: `ai_languageModel[0]` — required; missing → "A Chat Model sub-node must be connected" (**inferred** from chainLlm parity).
   - Retriever: `ai_retriever[0]` — **required**; missing → "A Retriever sub-node must be connected" (**documented** common-issues). The retriever may back onto a vector store or the Workflow Retriever node (**documented**).
   - Output parser: optional `ai_outputParser[0]` when `hasOutputParser` (**inferred** from chainLm parity).
   - **No** `ai_tool` / `ai_memory` channels — chains do not support tools or memory (**documented**).
4. **Retrieve relevant documents:** use the resolved query to retrieve relevant document chunks from the retriever handle (similarity search over a vector store, or documents returned by the Workflow Retriever) (**documented** — RAG). The retriever decides the chunk count / limit / metadata inclusion.
5. **Build prompt:** combine the retrieved documents as **context** with the user query into a prompt for the LLM (**documented** — RAG grounds the response in retrieved knowledge). The exact prompt template (how context chunks are formatted and the system instruction wording) is **not documented** — **gap**; OpenFlow may use a standard "use the following context to answer the question" template.
6. **Single model call:** invoke the chat-model handle **once** with the built prompt (retrieval context + query). No tool loop, no iteration (**documented** — chain vs agent distinction).
7. **Output parser:** when `hasOutputParser` is true and `ai_outputParser[0]` exists, run the final assistant text through the parser handle and set `output` to the structured result; otherwise `output` is the assistant string (**inferred** from chainLlm parity).
8. **Output:** set `json.output` to the final answer text (or structured result when parsed). May mirror to `text` for Chat Trigger compatibility (**documented** Chat Trigger contract + **inferred** for chain).

### Input

1. Resolve the **user query** as in the implementer contract (per item).
2. Require a connected **Chat Model** on `ai_languageModel` index 0.
3. Require a connected **Retriever** on `ai_retriever` index 0 (vector-store retriever or Workflow Retriever).
4. Optional **output parser** on `ai_outputParser` when `hasOutputParser` is true.

### Output

- One main-branch item per successful retrieve + model call for the processed input item.
- Final answer field **`output`** (primary); may mirror to **`text`** for Chat Trigger compatibility (**documented** Chat Trigger contract + **inferred** for chain).
- When `hasOutputParser` is on, `output` may be structured (object/array) rather than a plain string (**inferred** from chainLlm parity).

### Errors

| Condition | Behavior |
|-----------|----------|
| No retriever connected | Node error — "A Retriever sub-node must be connected" (**documented**) |
| No chat model connected | Node error (**inferred** from chainLlm parity) |
| Empty/null query (`chatInput` or `text`) | Fail — "No prompt specified" (**documented** common-issues) |
| Model/provider failures | Fail the item/node unless workflow-level retry / continue-on-fail is set (**inferred**) |
| `continueOnFail` | Standard: emit error on item / continue (**inferred**) |

### Expressions

- `text` uses `{{ … }}` / leading `=` expression form; evaluate via `ctx.evaluate` **per item** (**inferred** + OpenFlow SDK).
- Query auto mode depends on upstream `chatInput`, not an expression on the chain.

## Acceptance tests

Fixtures for `batch-queue-langchain-chain-retrieval-qa.test.ts` (and equivalent). Shape assertions; model/retriever content is mock-driven.

### Test: auto query from chatInput — happy path

**Given** input items:

```json
[{ "json": { "chatInput": "What is in the documents?" } }]
```

**Parameters:**

```json
{}
```

**Cluster (logical):** chat model on `ai_languageModel` index 0; retriever on `ai_retriever` index 0 returning one chunk `{ "pageContent": "Cats are mammals." }`.

**Expect** output[0] (shape; content model-dependent):

```json
[{ "json": { "output": "<non-empty assistant string grounded in retrieved context>" } }]
```

### Test: define query — happy path

**Given** input items:

```json
[{ "json": { "question": "Summarize the policy." } }]
```

**Parameters:**

```json
{
  "promptType": "define",
  "text": "={{ $json.question }}"
}
```

**Cluster (logical):** model + retriever returning one chunk.

**Expect** output[0]:

```json
[{ "json": { "output": "<non-empty assistant string>" } }]
```

### Test: missing retriever

**Given** input `[{ "json": { "chatInput": "Hi" } }]`, a chat model on `ai_languageModel`, and **no** `ai_retriever` connection.

**Expect:** execution error — "A Retriever sub-node must be connected" (**documented**).

### Test: missing chat model

**Given** input `[{ "json": { "chatInput": "Hi" } }]`, a retriever on `ai_retriever`, and **no** `ai_languageModel` connection.

**Expect:** execution error indicating a Chat Model sub-node must be connected (**inferred** from chainLlm parity).

### Test: null query

**Given** input `[{ "json": {} }]`

**Parameters:**

```json
{
  "promptType": "define",
  "text": "={{ $json.missing }}"
}
```

**Expect:** error — "No prompt specified" (**documented** common-issues).

### Test: retrieved context passed to model

**Given** a mock retriever on `ai_retriever` returning chunks `[{ "pageContent": "The sky is blue." }]`, a mock model that echoes the last context chunk, and input `[{ "json": { "chatInput": "What color is the sky?" } }]`.

**Expect:** the model invoke receives the retrieved chunk content as context **before** the query; `output` reflects the grounded answer (**documented** RAG).

### Test: multi-item batching

**Given** input items:

```json
[
  { "json": { "chatInput": "first" } },
  { "json": { "chatInput": "second" } }
]
```

**Parameters:** `{}` with a mock model that echoes the user text and a mock retriever returning an empty chunk list.

**Expect** output length **2**, one retrieve + call per item, order preserved:

```json
[
  { "json": { "output": "first" } },
  { "json": { "output": "second" } }
]
```

Model invoked twice (once per item); retriever queried twice (once per item). `text` expressions re-resolved per item when `promptType` is `define`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root Question and Answer Chain node |
| Retriever required (`ai_retriever`) | documented | "A Retriever sub-node must be connected" (common-issues) |
| Retriever = vector store OR Workflow Retriever | documented | "What chains do" page |
| RAG: retrieve → context → LLM | documented | RAG pattern; grounds response in retrieved knowledge |
| No tools, no memory | documented | Chains explicitly lack tool/memory support |
| Prompt modes + `chatInput` | documented | Common-issues: "Define below" + "Text" / "Connected Chat Trigger Node" + `chatInput` |
| Docs page labels param "Query" | documented | "The question you want to ask" |
| Wire `promptType` / `text` | inferred | From chainLlm/agent parity + common-issues "Text" field |
| `promptType` default `auto` | inferred | Omitted in available public JSON |
| `hasOutputParser` + apply parser | inferred | chainLlm parity; not documented for this node |
| `messages` (chat messages) | gap | Not documented for this node; likely absent — retriever provides context instead |
| Connection channels | documented + inferred | `ai_retriever` documented; `ai_languageModel`, `ai_outputParser` inferred from chainLlm parity |
| Output field `output` / `text` | documented (Chat Trigger) + inferred | Chat Trigger contract; chain-specific confirmation is inferred |
| Single model call (no loop) | documented | Chain vs agent distinction |
| Exact prompt template (context formatting) | gap | Not documented; OpenFlow may use a standard RAG template |
| typeVersion | gap | Not observed in available public JSON |
| Multi-item batching | gap | OpenFlow: one retrieve + call per item |
| Exact error strings | documented | "No prompt specified"; "A Retriever sub-node must be connected" |

## OpenFlow mapping

- **Definition group:** `ai` (new) or `core` until an AI group exists
- **Executor file:** `src/lib/engine/executors/langchain-chain-retrieval-qa.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; model/retriever supplied via OpenFlow AI sub-node runtime — **do not** load `@n8n/n8n-nodes-langchain` packages
- **Implement priority:** (1) per-item loop + query `ctx.evaluate`, (2) retriever-required check, (3) retrieve docs → context, (4) single model call (no loop), (5) `hasOutputParser` apply, (6) `output` field
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-langchain-chain-retrieval-qa.test.ts` — cover auto/define query, missing retriever, missing model, null query, retrieved-context-in-invoke, multi-item batching