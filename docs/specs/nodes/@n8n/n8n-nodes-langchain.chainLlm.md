---
type: @n8n/n8n-nodes-langchain.chainLlm
displayName: Basic LLM Chain
category: Cluster Nodes
versions: [1, 1.1, 1.2, 1.3, 1.4]
priority: high
status: specced
---

# Basic LLM Chain

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.chainllm.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains.md | Public docs only |
| https://raw.githubusercontent.com/n8n-io/n8n-docs/refs/heads/main/docs/_workflows/advanced-ai/examples/agents_vs_chains.json | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.chainLlm`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (receives items from preceding node, e.g., Switch or Chat Trigger)
- **Outputs:** `main` × 1 (produces model response items)
- **Credentials:** none (credentials live on connected `ai_languageModel` sub-node)
- **Cluster role:** Root node
- **Sub-node connections:**
  - `ai_languageModel` × 1 (required) — e.g., `@n8n/n8n-nodes-langchain.lmChatOpenAi`, `@n8n/n8n-nodes-langchain.lmChatAnthropic`, etc.
  - `ai_outputParser` × 1 (optional) — e.g., `outputParserAutoFixing`, `outputParserItemList`, `outputParserStructured`

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `promptType` | `options` | `'auto'` | yes | — | `"auto"` = Take from previous node automatically (expects `chatInput` field); `"define"` = Define below |
| `text` | `string` (expression) | `''` | when `promptType === 'define'` | `{ show: { promptType: ['define'] } }` | User prompt text / expression |
| `requireSpecificOutputFormat` | `boolean` | `false` | no | — | When true, requires an `ai_outputParser` sub-node connection |
| `messages.messageValues` | `fixedCollection` | `[]` | no | — | Array of chat messages to include in the prompt. Each entry: `{ type: 'ai' \| 'system' \| 'user', message: string, image?: { binaryPropertyName: string } \| { imageUrl: string, detail?: 'auto' \| 'low' \| 'high' } }` |
| `messages.messageValues[].type` | `options` | `'user'` | yes | — | `ai` (assistant example), `system` (system prompt), `user` (user example) |
| `messages.messageValues[].message` | `string` (expression) | `''` | yes | — | Message text content |
| `messages.messageValues[].image` | `fixedCollection` | — | no | `{ show: { 'messages.messageValues.type': ['user'] } }` | Image input for user messages. Either `binaryPropertyName` (string) or `imageUrl` (string) + optional `detail` ('auto'\|'low'\|'high') |

## Runtime behavior

### Input
- Consumes items on `main` input (typically from a Switch node or Chat Trigger).
- When `promptType === 'auto'`, expects each input item to have a `json.chatInput` field containing the user prompt. If missing, throws "No prompt specified" error.
- When `promptType === 'define'`, uses the `text` parameter (supports expressions referencing `$json`, `$item`, etc.).

### Output
- Produces one output item per input item on `main` output.
- Output item shape: `{ json: { output: string }, pairedItem: { item: number } }` (the `output` field contains the model's text response).
- When `requireSpecificOutputFormat === true` and an `ai_outputParser` sub-node is connected, the output shape conforms to that parser (e.g., structured object, array of items).

### Sub-node resolution
- **`ai_languageModel` (required):** The node reads the connected language model sub-node (type `ai_languageModel`) and invokes it once per input item with the constructed prompt (system + user + optional AI example messages + the runtime prompt).
- **`ai_outputParser` (optional):** Only consulted when `requireSpecificOutputFormat === true`. If enabled but no parser connected, throws "An Output Parser sub-node must be connected".

### Errors
- **No prompt specified:** Throws when `promptType === 'auto'` and input item lacks `chatInput`, or when `promptType === 'define'` and `text` evaluates to empty.
- **No model connected:** Throws if no `ai_languageModel` sub-node is attached.
- **Output parser required but missing:** Throws when `requireSpecificOutputFormat === true` and no `ai_outputParser` sub-node connected.
- **continueOnFail:** When enabled on the node, errors emit a single error item `{ json: { error: <message> } }` on the main output instead of throwing.

### Expressions
- `text` (prompt text) supports full n8n expression syntax.
- `messages.messageValues[].message` supports expressions.
- `messages.messageValues[].image.imageUrl` and `binaryPropertyName` support expressions.

### Chat message construction
The node builds a LangChain `ChatPromptValue` from:
1. System messages (type `system`) — used for instructions/tone.
2. AI example messages (type `ai`) — few-shot assistant responses.
3. User example messages (type `user`) — few-shot user inputs (can include images).
4. The runtime prompt (from `chatInput` or `text`) as a final user message.

Image handling (user messages only): when `image` is provided, the message becomes a multimodal message with the image content. `detail` controls resolution/token budget: `auto` (model default), `low` (512×512, 65 tokens), `high` (detailed crops, 129 tokens).

### Cluster node semantics
- This is a **root cluster node**. It does not execute directly on the main channel; instead it coordinates sub-nodes via the `ai_languageModel` and optional `ai_outputParser` connection types.
- In the workflow JSON, connections use `ai_languageModel` and `ai_outputParser` as connection type keys (not `main`).
- The node itself has a `main` input (from upstream workflow nodes) and `main` output (to downstream nodes).

## Acceptance tests

### Test: basic-auto-prompt

**Given** input items:
```json
[{ "json": { "chatInput": "Hello, how are you?" } }]
```

**Parameters:**
```json
{
  "promptType": "auto",
  "requireSpecificOutputFormat": false,
  "messages": { "messageValues": [] }
}
```

**Sub-nodes connected:**
- `ai_languageModel` → `@n8n/n8n-nodes-langchain.lmChatOpenAi` (configured with test model)

**Expect** output[0]:
```json
[{ "json": { "output": "I'm doing well, thank you for asking! How can I help you today?" }, "pairedItem": { "item": 0 } }]
```

---

### Test: define-prompt-with-system-message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "promptType": "define",
  "text": "Say hello in Spanish",
  "requireSpecificOutputFormat": false,
  "messages": {
    "messageValues": [
      { "type": "system", "message": "You are a helpful translator." }
    ]
  }
}
```

**Sub-nodes connected:**
- `ai_languageModel` → `@n8n/n8n-nodes-langchain.lmChatOpenAi`

**Expect** output[0]:
```json
[{ "json": { "output": "¡Hola!" }, "pairedItem": { "item": 0 } }]
```

---

### Test: few-shot-with-ai-example

**Given** input items:
```json
[{ "json": { "chatInput": "What is 2+2?" } }]
```

**Parameters:**
```json
{
  "promptType": "auto",
  "requireSpecificOutputFormat": false,
  "messages": {
    "messageValues": [
      { "type": "user", "message": "What is 1+1?" },
      { "type": "ai", "message": "2" },
      { "type": "user", "message": "What is 3+3?" },
      { "type": "ai", "message": "6" }
    ]
  }
}
```

**Sub-nodes connected:**
- `ai_languageModel` → `@n8n/n8n-nodes-langchain.lmChatOpenAi`

**Expect** output[0] contains a numeric answer (model follows few-shot pattern):
```json
[{ "json": { "output": "4" }, "pairedItem": { "item": 0 } }]
```

---

### Test: output-parser-structured

**Given** input items:
```json
[{ "json": { "chatInput": "Give me a JSON with name and age" } }]
```

**Parameters:**
```json
{
  "promptType": "auto",
  "requireSpecificOutputFormat": true,
  "messages": { "messageValues": [] }
}
```

**Sub-nodes connected:**
- `ai_languageModel` → `@n8n/n8n-nodes-langchain.lmChatOpenAi`
- `ai_outputParser` → `@n8n/n8n-nodes-langchain.outputParserStructured` (with schema `{ name: string, age: number }`)

**Expect** output[0]:
```json
[{ "json": { "output": { "name": "John", "age": 30 } }, "pairedItem": { "item": 0 } }]
```

---

### Test: multimodal-image-url

**Given** input items:
```json
[{ "json": { "chatInput": "Describe this image" } }]
```

**Parameters:**
```json
{
  "promptType": "auto",
  "requireSpecificOutputFormat": false,
  "messages": {
    "messageValues": [
      {
        "type": "user",
        "message": "Describe this image",
        "image": { "imageUrl": "https://example.com/image.png", "detail": "high" }
      }
    ]
  }
}
```

**Sub-nodes connected:**
- `ai_languageModel` → `@n8n/n8n-nodes-langchain.lmChatOpenAi` (vision-capable model)

**Expect** output[0] contains a description of the image.

---

### Test: continue-on-fail

**Given** input items:
```json
[{ "json": { "chatInput": "test" } }, { "json": { "chatInput": "test2" } }]
```

**Parameters:**
```json
{
  "promptType": "auto",
  "requireSpecificOutputFormat": false,
  "messages": { "messageValues": [] }
}
```

**Node config:** `continueOnFail: true`

**Sub-nodes connected:**
- `ai_languageModel` → (misconfigured, throws on first item)

**Expect** output[0] (two items, first is error):
```json
[
  { "json": { "error": "Model invocation failed: ..." }, "pairedItem": { "item": 0 } },
  { "json": { "output": "Response for test2" }, "pairedItem": { "item": 1 } }
]
```

---

### Test: no-prompt-specified-error

**Given** input items:
```json
[{ "json": { "otherField": "no chatInput here" } }]
```

**Parameters:**
```json
{ "promptType": "auto", "requireSpecificOutputFormat": false, "messages": { "messageValues": [] } }
```

**Sub-nodes connected:**
- `ai_languageModel` → `@n8n/n8n-nodes-langchain.lmChatOpenAi`

**Expect** error thrown (or error item if `continueOnFail: true`):
```json
{ "json": { "error": "No prompt specified" } }
```

---

### Test: output-parser-required-but-missing

**Given** input items:
```json
[{ "json": { "chatInput": "test" } }]
```

**Parameters:**
```json
{ "promptType": "auto", "requireSpecificOutputFormat": true, "messages": { "messageValues": [] } }
```

**Sub-nodes connected:**
- `ai_languageModel` → `@n8n/n8n-nodes-langchain.lmChatOpenAi`
- **No** `ai_outputParser` connected

**Expect** error thrown:
```json
{ "json": { "error": "An Output Parser sub-node must be connected" } }
```

---

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names (`promptType`, `text`, `requireSpecificOutputFormat`, `messages.messageValues`) | documented | From n8n docs page |
| `promptType` enum values (`auto`, `define`) | documented | Docs say "Take from previous node automatically" / "Define below" |
| `messages.messageValues[].type` enum (`ai`, `system`, `user`) | documented | From docs Chat Messages section |
| Image detail enum (`auto`, `low`, `high`) | documented | From docs Image Details section |
| Sub-node connection types (`ai_languageModel`, `ai_outputParser`) | documented + workflow JSON | Verified in agents_vs_chains.json |
| Type version 1.4 fields (`messages.messageValues`) | workflow JSON | `typeVersion: 1.4` in example; earlier versions may differ |
| Exact output field name (`output`) | inferred from docs + LangChain convention | Docs say "output"; not explicitly confirmed in public JSON |
| Error message exact text ("No prompt specified", "An Output Parser sub-node must be connected") | documented | From Common issues section |
| continueOnFail error item shape | inferred | Standard n8n pattern; not explicitly documented for this node |
| Multimodal image binary property handling | documented | `binaryPropertyName` for binary data from previous node |
| Whether system messages are prepended or appended | inferred | Standard LangChain prompt template order (system → few-shot → user) |
| Max items per execution / batching behavior | undocumented | Likely processes each input item independently |

## OpenFlow mapping

- **Definition group:** `cluster` (root cluster node)
- **Executor file:** `src/lib/engine/executors/chain-llm.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; uses `ai_languageModel` and `ai_outputParser` connection resolvers from SDK
- **Registration:** Cluster node registry entry with `root: true`, `subNodeTypes: ['ai_languageModel', 'ai_outputParser']`