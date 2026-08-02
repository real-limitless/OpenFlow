---
type: "@n8n/n8n-nodes-langchain.toolVectorStore"
displayName: Vector Store Question Answer Tool
category: AI
versions: [1, 1.1]
priority: medium
status: specced
---

# Vector Store Question Answer Tool

Cluster **sub-node** and LangChain **tool**. It wraps a connected vector store root node (plus an embedding model) and a connected language model so that an AI agent can ask a question and receive a synthesized answer grounded in the vector store's contents. Instead of returning raw retrieved chunks (as the Vector Store Retriever does), it summarizes the retrieved chunks with the connected LLM and returns an answer to the agent.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolvectorstore.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://langchain-ai.github.io/langgraphjs/how-tos/tool-calling/ | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.toolVectorStore`
- **Aliases:** (none observed)
- **Inputs:**
  - `ai_vectorStore` × 1 — **required** connection to a vector store root node (e.g. Simple, Pinecone, Qdrant, Supabase). Provides the retrieval handle (embedding + `similaritySearch`).
  - `ai_languageModel` × 1 — **required** connection to a chat model sub-node used to read the retrieved chunks and formulate the answer.
- **Outputs:** `ai_tool` × 1 — a callable tool descriptor consumed by an AI Agent root node's tools connector (output name: "Tool").
- **Credentials:** (none — credentials live on the connected vector store root node and language model sub-node)

This node has no independent `main` data input. It is a supply-data sub-node: it registers the tool with the agent at workflow setup and performs its work when the agent invokes the tool during tool-calling.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `name` | string | `""` | no | version 1 only | "Data Name" — short identifier for the data in the vector store (e.g. `users_info`). Alphanumeric. Feeds the auto-generated tool description. |
| `description` | string | `""` | yes | — | "Description of Data" — what the data in the vector store is about. Feeds the auto-generated tool description. |
| `topK` | number | not documented | no | — | "Limit" — maximum number of retrieved results fed to the language model per invocation. |

The node's own name and the `description` parameter combine to populate the tool description exposed to the agent (see below). The `name` parameter is version-1 only; in later versions the tool name derives solely from the node name.

## Runtime behavior

### Tool registration (setup)

During workflow setup the node supplies a tool descriptor to the connected AI agent over the `ai_tool` output:

- **Tool name:** derived from the node's name (spaces converted to underscores).
- **Tool description:** auto-generated from the node name and the **Description of Data** parameter using the documented template:

  > Useful for when you need to answer questions about [node name]. Whenever you need information about [Description of Data], you should ALWAYS use this. Input should be a fully formed question.

  (Bracketed placeholders substituted with the actual node name / description text.)

Special characters in the node name cause errors when the agent runs; only alphanumeric characters, spaces, dashes, and underscores are safe.

### Input / invocation

The node receives no `main` items. When the model calls the tool, it passes a fully formed question as the tool argument. Expressions in the node's parameters resolve against the **first item only** of the calling context (standard sub-node semantics); they do not iterate per item.

### Processing

1. Resolve `topK` (Limit) and `description` (sub-node first-item semantics for expressions).
2. Retrieve from the connected vector store: embed the incoming question (via the store's embedding sub-node) and run a similarity search, capped at `topK` results.
3. Send the retrieved chunks together with the question to the connected language model (`ai_languageModel`).
4. Collect the model's synthesized answer.

### Output

The synthesized answer text is returned to the agent as the tool's response. The tool contributes no items to a `main` workflow output — its output is consumed by the agent's tool loop.

### Errors

| condition | behavior |
|-----------|----------|
| Missing `ai_vectorStore` connection | Setup/execution error (required input) |
| Missing `ai_languageModel` connection | Setup/execution error (required input) |
| Vector store retrieval failure (embedding, store unreachable, auth) | Tool invocation fails |
| Language model failure | Tool invocation fails |
| Special characters in node name | Errors when the agent runs (documented warning) |
| `continueOnFail` | Standard behavior: error surfaced to the agent as a failed tool call instead of aborting the run |

### Expressions

`description` and `topK` accept expression strings; evaluated with sub-node first-item semantics. `name` is alphanumeric-only static text.

## Acceptance tests

### Test: tool registration with documented description template

**Given** a connected AI agent, a vector store root node, a language model sub-node, and a tool node named `Policies Store` with `description: "the company expense policy"`:

**Parameters:**
```json
{
  "description": "the company expense policy",
  "topK": 4
}
```

**Expect** the agent's tool schema exposes a callable named `policies_store` whose description equals `Useful for when you need to answer questions about Policies Store. Whenever you need information about the company expense policy, you should ALWAYS use this. Input should be a fully formed question.`

### Test: retrieval + LLM answer flow

**Given** a mock vector store handle whose `similaritySearch` returns two documents (`pageContent` + `metadata`), a mock language model that echoes the concatenated retrieved content, and a tool node with `topK: 2`.

**When** the agent invokes the tool with the fully formed question `"What is the refund window?"`:

**Expect** `similaritySearch("What is the refund window?", 2)` is called on the vector store, both retrieved chunks plus the question are sent to the language model, and the model's answer text is returned to the agent as the tool response.

### Test: Limit caps retrieved results

**Given** a mock vector store returning 5 documents and a tool node with `topK: 3`:

**When** the tool is invoked:

**Expect** exactly the first 3 most-similar documents are passed to the language model (the LLM never sees more than `topK` chunks).

### Test: required sub-node connections

**Given** a tool node with no `ai_vectorStore` connection, or with no `ai_languageModel` connection:

**Expect** the node reports a setup error for the missing required connection and does not register a usable tool with the agent.

### Test: unsafe node name

**Given** a tool node whose name contains special characters (e.g. `Policies$Store`):

**When** the agent runs and attempts to call the tool:

**Expect** the tool call fails (agent observes an error). No special characters are used in the callable tool name.

### Test: sub-node first-item expression semantics

**Given** calling context items `[{ "json": { "limit": 2 } }, { "json": { "limit": 9 } }]` and `topK: "={{ $json.limit }}"`:

**Expect** `topK` resolves to `2` (first item only) for every invocation.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose | documented | Public docs: a tool that lets an agent summarize results and answer questions based on chunks from a vector store |
| Parameters (Description of Data, Limit) | documented | Public docs list both; internal names `description` / `topK` inferred from descriptor |
| Tool-description population template | documented | Exact format documented: node name + Description of Data, spaces→underscores |
| Special characters in node name | documented | Public docs explicitly warn this causes errors when the agent runs |
| Wire format (`ai_vectorStore`, `ai_languageModel` required; `ai_tool` output) | documented | Confirmed from package descriptor metadata (type string, input/output channel names, required flags, versions [1, 1.1]); consistent with public tool-sub-node docs |
| `name` parameter (Data Name) | inferred | Descriptor shows it is version-1 only and alphanumeric; not in public docs page |
| `topK` default value | gap | Not stated in public docs; OpenFlow may choose a sensible default |
| Internal retrieval implementation (embedding via store, LLM prompt composition) | inferred | Follows standard RAG pattern; exact prompt/context assembly is an implementation detail |
| Tool response envelope to the agent | inferred | Public docs describe the outcome (an answer, not raw chunks); exact serialization is an implementation detail |
| Versions [1, 1.1] | inferred from corpus | Package descriptor lists two versions; public docs are not version-specific |

## OpenFlow mapping

- **Definition group:** `ai` (tool sub-node)
- **Executor file:** `src/lib/engine/executors/toolVectorStore.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; vector store and language-model handles supplied via OpenFlow AI sub-node runtime (`ai_vectorStore`, `ai_languageModel` channels); tool descriptor emitted on `ai_tool` output
- **Implement priority:**
  1. Required-connection validation (`ai_vectorStore`, `ai_languageModel`)
  2. Tool descriptor registration: name from node name (spaces→underscores), description from the documented template using node name + `description`
  3. `topK` resolution (sub-node first-item expression semantics)
  4. Tool invocation: retrieve via vector-store handle → cap at `topK` → prompt LLM with chunks + question → return answer to agent
  5. Error handling: missing connections, retrieval failure, model failure, unsafe node-name characters
