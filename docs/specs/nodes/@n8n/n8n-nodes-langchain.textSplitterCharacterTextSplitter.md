---
type: @n8n/n8n-nodes-langchain.textSplitterCharacterTextSplitter
displayName: Character Text Splitter
category: Transform
versions: [1]
priority: medium
status: specced
---

# Character Text Splitter

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.textsplittercharactertextsplitter/ | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.textSplitterCharacterTextSplitter`
- **Aliases:** (none)
- **Inputs:** `[]` (no main input ports — this is a sub-node that supplies an `ai_textSplitter` connection)
- **Outputs:** `[AiTextSplitter]` (single output of type `AiTextSplitter`)
- **Output names:** `['Text Splitter']`
- **Credentials:** (none — this node requires no external credentials)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `separator` | string | `''` (empty string) | no | Character(s) used to split the document. Empty string splits by individual characters. |
| `chunkSize` | number | `1000` | no | Maximum number of characters per chunk. |
| `chunkOverlap` | number | `0` | no | Number of characters shared between consecutive chunks to preserve context. |

## Runtime behavior

### Input

This node has **no main input ports**. It acts as a sub-node that is connected via the `ai_textSplitter` channel to a root node (e.g., a Vector Store, Chain, or Agent root node). The root node invokes this text splitter when it needs to split documents into chunks.

### Output

Produces a single output of type `AiTextSplitter` that wraps a LangChain `CharacterTextSplitter` instance configured with the specified parameters. The root node consumes this text splitter to break input documents into chunks according to the configured separator, chunk size, and overlap.

### Errors

- Invalid parameter values (e.g., negative `chunkSize`, negative `chunkOverlap`, `chunkOverlap` >= `chunkSize`) should be surfaced as configuration errors at workflow validation/execution time.
- If the underlying LangChain `CharacterTextSplitter` throws during splitting, the error propagates to the calling root node.
- No `continueOnFail` behavior applies since this is a sub-node without main input items.

### Expressions

All three parameters (`separator`, `chunkSize`, `chunkOverlap`) accept n8n expressions. However, as a sub-node, expression resolution follows sub-node semantics: expressions resolve against the **first item** of the calling root node's input, not per-item.

## Acceptance tests

### Test: basic splitting with default separator

**Given** a root node connected to this Character Text Splitter with default parameters (separator: `''`, chunkSize: `1000`, chunkOverlap: `0`)

**Parameters:**
```json
{
  "separator": "",
  "chunkSize": 1000,
  "chunkOverlap": 0
}
```

**Expect** the text splitter to split input text into chunks of up to 1000 characters each, splitting at character boundaries with no overlap between consecutive chunks.

---

### Test: custom separator (newline)

**Given** a root node connected to this Character Text Splitter configured with newline separator

**Parameters:**
```json
{
  "separator": "\n",
  "chunkSize": 500,
  "chunkOverlap": 50
}
```

**Expect** the text splitter to split input text at newline boundaries, producing chunks of up to 500 characters with 50 characters of overlap between consecutive chunks.

---

### Test: chunk overlap preservation

**Given** a root node connected to this Character Text Splitter with `chunkSize: 100` and `chunkOverlap: 20`

**Parameters:**
```json
{
  "separator": "",
  "chunkSize": 100,
  "chunkOverlap": 20
}
```

**Expect** consecutive chunks to share exactly 20 characters (the last 20 characters of chunk N become the first 20 characters of chunk N+1), preserving context across chunk boundaries.

---

### Test: empty separator splits by character

**Given** a root node connected to this Character Text Splitter with empty separator and small chunk size

**Parameters:**
```json
{
  "separator": "",
  "chunkSize": 10,
  "chunkOverlap": 0
}
```

**Expect** the text splitter to treat the input as a sequence of individual characters and group them into chunks of 10 characters each.

---

### Test: integration with Vector Store root node

**Given** a Vector Store root node (e.g., `@n8n/n8n-nodes-langchain.vectorStorePinecone`) in "insert" mode with this Character Text Splitter connected on the `ai_textSplitter` channel, and a document input containing a 5000-character text

**Parameters:**
```json
{
  "separator": "\n\n",
  "chunkSize": 1000,
  "chunkOverlap": 100
}
```

**Expect** the Vector Store to receive and store approximately 5–6 chunks (depending on paragraph boundaries), each roughly 1000 characters with 100-character overlaps, split at double-newline boundaries where possible.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter types and defaults | documented | From public n8n docs and package descriptor |
| Sub-node expression semantics | documented | n8n docs explicitly state sub-node expressions resolve to first item |
| Connection type (`AiTextSplitter`) | documented | Visible in package descriptor output type |
| LangChain `CharacterTextSplitter` behavior | inferred (external) | Relies on LangChain's documented behavior; `keepSeparator: false` is hardcoded in the node |
| Error handling for invalid params | inferred | Not explicitly documented; standard n8n validation expected |
| Credential requirements | documented | None required — confirmed by package descriptor |

## OpenFlow mapping

- **Definition group:** `transform` (sub-node category for AI text splitters)
- **Executor file:** `src/lib/engine/executors/textSplitterCharacterTextSplitter.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only (supplyData pattern for sub-nodes)