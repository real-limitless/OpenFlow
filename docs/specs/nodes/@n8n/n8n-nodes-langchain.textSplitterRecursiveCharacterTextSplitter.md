---
type: "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter"
displayName: Recursive Character Text Splitter
category: AI
versions: [1]
priority: medium
status: specced
---

# Recursive Character Text Splitter

Cluster **sub-node**: splits document text recursively by a hierarchy of separators
(paragraphs → sentences → words → characters) to keep related content together as
long as possible. Connects to a parent root node (Vector Store Insert Documents,
Summarization Chain, Default Data Loader, etc.) on the `ai_textSplitter` channel
when **Advanced** chunking is selected.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.textsplitterrecursivecharactertextsplitter.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://js.langchain.com/docs/concepts/text_splitters | Third-party docs (related resource linked from public docs) |
| https://v03.api.js.langchain.com/classes/langchain.text_splitter.RecursiveCharacterTextSplitter.html | Third-party docs (API reference linked from public docs) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter`
- **Aliases:** (none observed)
- **typeVersion:** `1` (**inferred** — not observed in available public JSON; **gap**)
- **Inputs:**
  - No `main` input of its own in the cluster pattern (sub-node). It operates on
    the input items available to the parent root node (**inferred** from cluster-node model).
  - `ai_textSplitter` × 0..1 — this node **provides** the splitter handle on this
    channel for the parent root to consume (**inferred** from chainSummarization / Default Data Loader parity).
- **Outputs:**
  - `ai_textSplitter` × 1 — exposes a text-splitter handle for the parent root
    to invoke (**inferred** channel name from cluster-node model).
- **Credentials:** none (**documented** — text splitting is stateless; any service
  credentials live on the parent root or other sub-nodes)

Cluster topology: this node is attached as a **sub-node** of a root (Vector Store
Insert Documents, Summarization Chain, Default Data Loader, etc.). The parent
drives chunking by invoking the `ai_textSplitter` handle; this node implements
the recursive character splitting logic and returns chunked documents.

## Parameters

UI labels from **public docs**; wire names **inferred** from camelCase convention
+ chainSummarization/Default Data Loader parity. The `@n8n/n8n-nodes-langchain`
package descriptor was **not** in the available corpus (`n8n-nodes-base@2.15.1`
contains no langchain descriptors), so exact JSON keys are a **gap**.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| chunkSize | number | `1000` (**inferred** from Default Data Loader "Simple" splitter docs) | no | — | **Chunk Size** — maximum characters per chunk. Maps to LangChain `chunkSize`. |
| chunkOverlap | number | `200` (**inferred** from Default Data Loader "Simple" splitter docs) | no | — | **Chunk Overlap** — character overlap between adjacent chunks. Maps to LangChain `chunkOverlap`. |
| separators | string[] | `["\n\n", "\n", " ", ""]` (**inferred** from LangChain RecursiveCharacterTextSplitter defaults) | no | under **Node Options** | **Separators** — hierarchy of separators to try in order (paragraph, sentence, word, character). Overrides the built-in default hierarchy. |
| keepSeparator | boolean | `true` (**inferred** from LangChain default) | no | under **Node Options** | **Keep Separator** — whether to keep the separator in the resulting chunks (append to the end of the previous chunk). |

No operation/resource selector — the docs page lists only the parameters above
(**documented**).

## Runtime behavior

### Role

1. Expose a **text-splitter handle** on output channel **`ai_textSplitter`**
   for the parent root to call. The parent (Vector Store Insert Documents,
   Summarization Chain with Advanced chunking, Default Data Loader with Custom
   splitter, etc.) invokes the handle to obtain chunked documents
   (**documented** cluster-node model + **inferred** from sibling sub-node specs).
2. **Split text** using LangChain's `RecursiveCharacterTextSplitter` algorithm:
   - Try separators in order: first `\n\n` (paragraphs), then `\n` (lines), then
     ` ` (words), then `""` (characters) (**documented** "recursively to keep all
     paragraphs, sentences then words together as long as possible" + third-party
     LangChain API semantics).
   - Respect `chunkSize` (max characters per chunk) and `chunkOverlap` (overlap
     between chunks) (**documented** "Chunk Size" / "Chunk Overlap" parameters).
   - If `keepSeparator` is true, include the matched separator at the end of
     each chunk except the last (**inferred** from LangChain default behavior).
3. **Return** an ordered list of document chunks with `{ pageContent, metadata }`
   shape to the parent (**inferred** LangChain document convention).

### Text-splitter handle contract (parent-invoked)

The parent root drives chunking through the handle. Interface is **inferred**
from documented behavior + the RAG/summarization patterns; OpenFlow baselines
are marked.

- **Split:** when the parent needs chunks (e.g. Summarization Chain with
  Advanced chunking, Default Data Loader with Custom splitter, Vector Store
  Insert Documents), it invokes the handle with a list of input documents
  (`{ pageContent, metadata }`). The handle splits each document's
  `pageContent` per the configured parameters and returns the chunked documents
  with original metadata preserved (plus chunk index if applicable) (**documented**
  behavior + **inferred** handle call site).
- **No `main` output:** this node does not emit normal `main` items by itself in
  the cluster pattern; the parent incorporates the chunked documents into its
  own processing (**inferred** from cluster model).

### Output

When used as a text-splitter sub-node:

- Connection graph output: `ai_textSplitter` → parent.
- No `main`-branch items are produced by this node; the parent consumes the
  chunks and continues the workflow on its own `main` output (**inferred**
  cluster model).

### Errors

| Condition | Behavior |
|-----------|----------|
| `chunkSize` <= 0 | Node error — chunk size must be positive (**inferred** OpenFlow baseline) |
| `chunkOverlap` >= `chunkSize` | Node error — overlap must be less than chunk size (**inferred** OpenFlow baseline) |
| Empty input documents | Return empty chunk list (no error) (**inferred** OpenFlow baseline) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `chunkSize`, `chunkOverlap` may accept `{{ … }}` / leading `=` expression
  forms; evaluate via `ctx.evaluate` (**inferred** from SDK parity).
- Sub-node rule: multi-item expressions always use the **first** item
  (**documented** parameter-resolution hint on primary page).

## Acceptance tests

Fixtures for `batch-queue-langchain-text-splitter-recursive-character.test.ts`
(and equivalent). Shape assertions; parent consumption is mock-driven.

### Test: basic split — single document

**Given** parent invokes the handle with one document:

```json
{
  "documents": [{ "pageContent": "Paragraph one.\n\nParagraph two.\n\nParagraph three.", "metadata": { "source": "test" } }]
}
```

**Parameters:**

```json
{
  "chunkSize": 100,
  "chunkOverlap": 20,
  "separators": ["\n\n", "\n", " ", ""],
  "keepSeparator": true
}
```

**Expect:** handle returns chunks split at paragraph boundaries first
(`\n\n`), each chunk ≤ 100 chars, with 20-char overlap; metadata preserved;
separator kept at end of chunks.

### Test: chunk size smaller than paragraph

**Given** parent invokes with a long paragraph:

```json
{
  "documents": [{ "pageContent": "This is a very long paragraph without any double newlines that should force splitting at single newlines or spaces.", "metadata": {} }]
}
```

**Parameters:**

```json
{
  "chunkSize": 50,
  "chunkOverlap": 10
}
```

**Expect:** handle splits at `\n` (not present), then at ` ` (spaces) to respect
chunk size; chunks ≤ 50 chars with 10-char overlap.

### Test: default separators (no custom separators param)

**Given** parent invokes with document containing multiple separator levels:

```json
{
  "documents": [{ "pageContent": "Para 1.\n\nPara 2.\nLine A\nLine B", "metadata": {} }]
}
```

**Parameters:**

```json
{
  "chunkSize": 1000,
  "chunkOverlap": 200
}
```

**Expect:** uses built-in default separators `["\n\n", "\n", " ", ""]`; splits
at `\n\n` first, then `\n`, etc.; chunks respect size/overlap.

### Test: keepSeparator false

**Given** parent invokes:

```json
{
  "documents": [{ "pageContent": "Para 1.\n\nPara 2.", "metadata": {} }]
}
```

**Parameters:**

```json
{
  "chunkSize": 1000,
  "chunkOverlap": 0,
  "keepSeparator": false
}
```

**Expect:** chunks do **not** include the `\n\n` separator at the end.

### Test: error on invalid chunkOverlap >= chunkSize

**Given** parent invokes with any document.

**Parameters:**

```json
{
  "chunkSize": 100,
  "chunkOverlap": 100
}
```

**Expect:** execution error — overlap must be less than chunk size.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & sub-node role | documented | Primary docs page + cluster-node model |
| Parameters: Chunk Size / Chunk Overlap | documented | Exact UI labels; wire names inferred |
| Default chunkSize=1000, chunkOverlap=200 | inferred | From Default Data Loader "Simple" splitter docs stating these exact values |
| Separators parameter | gap | Not on n8n docs page; inferred from LangChain API default |
| keepSeparator parameter | gap | Not on n8n docs page; inferred from LangChain API default |
| Channel name `ai_textSplitter` | inferred | From chainSummarization/Default Data Loader parity |
| Input documents = parent's data | inferred | "Use all the node's input data" + cluster sub-node model |
| Document shape `{ pageContent, metadata }` | inferred | LangChain document convention (related resource) |
| Handle call site (parent-invoked split) | inferred / OpenFlow contract | Docs describe behavior, not exact interface |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |
| Exact error strings | gap | Not documented; OpenFlow baselines used |
| Expression support on parameters | inferred | From SDK parity |
| Separators default array exact values | inferred | From LangChain RecursiveCharacterTextSplitter source default |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster sub-nodes)
- **Executor file:** `src/lib/engine/executors/langchain-text-splitter-recursive-character.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter` in
  `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a text-splitter handle on
  `ai_textSplitter` that accepts a list of documents, splits each document's
  `pageContent` using the recursive character algorithm with configured
  `chunkSize`, `chunkOverlap`, `separators`, `keepSeparator`, and returns
  chunked documents with metadata preserved; resolve expressions against the
  first item (sub-node rule); do **not** load `@n8n/nodes-langchain` packages.
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-langchain-text-splitter-recursive-character.test.ts`
  — cover basic split, paragraph/line/word/char fallback, overlap behavior,
  keepSeparator toggle, invalid params error