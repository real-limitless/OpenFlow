---
type: @n8n/n8n-nodes-langchain.textSplitterTokenSplitter
displayName: Token Splitter
category: Transform
versions: [1]
priority: medium
status: specced
---

# Token Splitter

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.textsplittertokensplitter/ | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.textSplitterTokenSplitter`
- **Aliases:** (none)
- **Inputs:** `[]` (no main input ports — this is a sub-node that supplies an `ai_textSplitter` connection)
- **Outputs:** `[AiTextSplitter]` (single output of type `AiTextSplitter`)
- **Output names:** `['Text Splitter']`
- **Credentials:** (none — this node requires no external credentials)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `chunkSize` | number | `1000` | no | Maximum number of tokens per chunk. The text is first tokenized via BPE (default `cl100k_base` encoding), split into chunks of this size, then each chunk is decoded back to text. |
| `chunkOverlap` | number | `0` | no | Number of tokens shared between consecutive chunks to preserve context across boundaries. |

Note: The underlying LangChain `TokenTextSplitter` supports additional properties (`encodingName`, `allowedSpecial`, `disallowedSpecial`), but n8n's node UI exposes only `chunkSize` and `chunkOverlap`. The encoding defaults to `cl100k_base` and is not configurable from the node.

## Runtime behavior

### Input

This node has **no main input ports**. It acts as a sub-node connected via the `ai_textSplitter` channel to a root node (e.g., Vector Store, Chain, or Agent root node). The root node invokes this text splitter when it needs to split documents into chunks.

### Output

Produces a single output of type `AiTextSplitter` that wraps a LangChain [`TokenTextSplitter`](https://js.langchain.com/docs/concepts/text_splitters/) instance. The splitter internally tokenizes input text using the `cl100k_base` BPE encoding (same encoding used by GPT-4 / text-embedding-3-*), groups tokens into chunks of at most `chunkSize` tokens with `chunkOverlap` overlapping tokens between consecutive chunks, then decodes each token group back into text.

The root node that consumes this splitter receives the split result as an array of `Document` objects (each containing a `pageContent` string and optional `metadata`).

### Errors

- Invalid parameter values (e.g., negative `chunkSize`, negative `chunkOverlap`, `chunkOverlap` >= `chunkSize`) should be surfaced as configuration errors at workflow validation/execution time.
- If the underlying `TokenTextSplitter` throws during splitting (e.g., on un-decodable token sequences), the error propagates to the calling root node.
- No `continueOnFail` behavior applies since this is a sub-node without main input items.

### Expressions

Both parameters (`chunkSize`, `chunkOverlap`) accept n8n expressions. As a sub-node, expressions resolve against the **first item** of the calling root node's input, not per-item.

## Acceptance tests

### Test: basic token-based splitting

**Given** a root node connected to this Token Splitter with default parameters (chunkSize: 1000, chunkOverlap: 0)

**Parameters:**
```json
{
  "chunkSize": 1000,
  "chunkOverlap": 0
}
```

**Expect** the text splitter to tokenize input text, produce chunks of at most 1000 tokens each, and decode each chunk back into readable text with no overlap.

---

### Test: chunk overlap for context preservation

**Given** a root node connected to this Token Splitter with `chunkSize: 500` and `chunkOverlap: 50`

**Parameters:**
```json
{
  "chunkSize": 500,
  "chunkOverlap": 50
}
```

**Expect** consecutive chunks to share exactly 50 tokens worth of decoded text, preserving context across chunk boundaries. The last ~50 tokens of chunk N appear at the beginning of chunk N+1.

---

### Test: splitting preserves semantic content

**Given** a root node connected to this Token Splitter with `chunkSize: 100` and `chunkOverlap: 10`, and a 1000-token input text

**Parameters:**
```json
{
  "chunkSize": 100,
  "chunkOverlap": 10
}
```

**Expect** approximately 12 chunks (1000 / (100 - 10) ≈ 12). Concatenating all chunks in order should recover substantially the same text as the original input (allowing for slight token-boundary artifacts at chunk edges).

---

### Test: small chunk size

**Given** a root node connected to this Token Splitter with `chunkSize: 10` and `chunkOverlap: 2`

**Parameters:**
```json
{
  "chunkSize": 10,
  "chunkOverlap": 2
}
```

**Expect** each chunk to contain at most 10 tokens. Chunks are decoded to text and may break mid-word since token boundaries do not always align with word boundaries.

---

### Test: integration with Vector Store root node

**Given** a Vector Store root node in "insert" mode with this Token Splitter connected on the `ai_textSplitter` channel, and a long input document

**Parameters:**
```json
{
  "chunkSize": 500,
  "chunkOverlap": 0
}
```

**Expect** the Vector Store to receive and store multiple document chunks, each representing up to 500 tokens of the original text decoded back into string form.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter types and defaults | documented | From public n8n docs and package descriptor |
| Tokenization algorithm | documented | BPE with `cl100k_base` encoding (LangChain `TokenTextSplitter` default); confirmed by public LangChain docs |
| Sub-node expression semantics | documented | n8n docs explicitly state sub-node expressions resolve to first item |
| Connection type (`AiTextSplitter`) | documented | Visible in package descriptor output type |
| Encoding configurable via node | documented | Not exposed in n8n UI; only `chunkSize` and `chunkOverlap` are surfaced |
| Error handling for invalid params | inferred | Not explicitly documented; standard n8n validation expected |
| Credential requirements | documented | None required — confirmed by package descriptor |

## OpenFlow mapping

- **Definition group:** `transform` (sub-node category for AI text splitters)
- **Executor file:** `src/lib/engine/executors/textSplitterTokenSplitter.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only (supplyData pattern for sub-nodes)
