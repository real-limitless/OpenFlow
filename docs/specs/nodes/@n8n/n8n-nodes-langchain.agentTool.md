---
type: '@n8n/n8n-nodes-langchain.agentTool'
displayName: AI Agent Tool
category: AI
versions: [2.2, 3]
priority: medium
status: specced
---

# AI Agent Tool

LangChain **tool sub-node** used for multi-agent orchestration: a primary (root) AI Agent can call other agents as tools. Each AI Agent Tool node wraps its own nested agent (its own chat model, prompt, optional fallback model / memory / tools / output parser) and exposes that agent to the parent as a single callable tool.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolaiagent.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only (`$fromAI()`) |

> Note: the public docs page slug is `n8n-nodes-langchain.toolaiagent` while the wire type string is `@n8n/n8n-nodes-langchain.agentTool` (confirmed from the published package descriptor). Both refer to the same node.

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.agentTool`
- **Aliases:** (none)
- **Inputs:** no `main` input. AI sub-node channels only:
  - `ai_languageModel` × 1 — required primary chat model (max 1)
  - `ai_languageModel` × 1 — optional **fallback** chat model, present only when the fallback option is enabled (max 1)
  - `ai_tool` × N — the nested agent's own tools
  - `ai_memory` × 0..1 — optional conversation memory for the nested agent
  - `ai_outputParser` × 0..1 — optional output parser when the output-format option is on
- **Outputs:** `ai_tool` × 1 (connects into the parent agent's tool input)
- **Credentials:** none on this node itself; model/tool/parser credentials live on the connected sub-nodes (documented cluster pattern)

The node is a **sub-node**: it has no `main` data path. It is invoked by the parent agent at tool-calling time and emits a single `ai_tool` channel through which the parent model sees the nested agent as a callable tool.

## Parameters

Names from the package descriptor; UI labels and semantics from public docs. Marked **inferred** where docs describe behavior but not the exact wire key.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| toolDescription | string | — | yes | — | UI: **Description**. Text given to the parent agent's model describing this agent's purpose and scope, so the parent knows when to delegate to it. |
| text | string | `""` | yes | — | UI: **Prompt (User Message)**. The prompt telling the nested agent what actions to perform and what information to return when invoked. Static text or expression; evaluate per invocation via `ctx.evaluate`. |
| hasOutputParser | boolean | `false` | no | — | UI: **Require Specific Output Format**. When on, connect an output-parser sub-node on `ai_outputParser` and apply it to the nested agent's final answer. |
| needsFallback | boolean | `false` | no | — | UI: **Enable Fallback Model**. When on, a second chat model is connected on the second `ai_languageModel` slot as a backup used if the primary fails or is unavailable. |
| options | collection | `{}` | no | — | Nested options below |
| options.systemMessage | string | — | no | — | Message sent to the nested agent before its conversation starts; guide its decision-making. Evaluate with `ctx.evaluate` before the first model call. |
| options.maxIterations | number | `10` | no | — | Maximum number of model runs the nested agent performs to generate a response before stopping. |
| options.returnIntermediateSteps | boolean | `false` | no | — | When on, include the intermediate steps the nested agent took in the final output returned to the parent. |
| options.passthroughBinaryImages | boolean | — | no | — | UI: **Automatically Passthrough Binary Images**. Pass binary images through to the agent as image-type messages. **OpenFlow:** accept param; default on; defer until SDK multimodal hooks exist. |
| options.batchSize | number | — | no | — | UI: **Batch Processing → Batch Size**. Number of items to process in parallel for rate limiting; may affect log ordering. |
| options.delayBetweenBatches | number | — | no | — | UI: **Batch Processing → Delay Between Batches**. Milliseconds to wait between batches. |

## Runtime behavior

### Invocation model

1. The parent (root) AI Agent model decides to call this tool; the node is exposed under a callable name (from the node name) with the configured `toolDescription`.
2. On invocation, the nested agent runs: resolve the connected primary chat model on `ai_languageModel` (required), evaluate `text` (and `options.systemMessage`, if set) as the user/system prompt, and run the agent loop bounded by `options.maxIterations` (default 10).
3. The nested agent may call its own connected `ai_tool` handles, use `ai_memory` for prior turns, and use the fallback model if the primary fails and `needsFallback` is on.
4. When `hasOutputParser` is on, the final answer text passes through the connected `ai_outputParser` handle (documented pattern: parsers are offered to the model as a formatting tool; OpenFlow applies the parser to the final text without loading third-party packages).
5. The nested agent's result is returned to the parent agent as the tool's observation.

### Sub-node expression semantics

Like all LangChain sub-nodes, expressions in this node's parameters resolve against the **first item only** of the calling context; they do not iterate per-item (documented sub-node hint box).

### Output

- The tool's response to the parent agent is the nested agent's final answer (its `output` text, optionally parsed into structured data). The parent model then uses that result to answer the user.
- The node itself contributes no `main` output items to the workflow.

### Errors

| Condition | Behavior |
|-----------|----------|
| No chat model connected on `ai_languageModel` | Node error (documented for the agent family: "A Chat Model sub-node must be connected") |
| Empty/null prompt (`text`) | Fail the invocation (documented common-issue pattern for the agent family) |
| Primary model fails/unavailable and `needsFallback` on | Retry on the fallback model (documented option; exact failover policy is a gap — OpenFlow baseline: one retry) |
| Nested tool or model failure | Fail the invocation; surfaces to the parent agent as a failed tool call |
| `continueOnFail` | Standard: emit error payload / continue per n8n convention (inferred) |

### Expressions

`text`, `options.systemMessage`, and any tool-parameter values accept `{{ … }}` / leading `=` expression form, evaluated via `ctx.evaluate`. App-node tools connected to the nested agent may use `$fromAI()` dynamic parameters (documented).

## Acceptance tests

Fixtures for a batch-style executor test (shape assertions; model content is mock-driven).

### Test: exposed as a callable tool with description

**Given** a parent agent connected to this tool sub-node.

**Parameters:**

```json
{
  "toolDescription": "Delegate math and coding questions to this specialist agent.",
  "text": "Solve the user's problem and explain the result."
}
```

**Expect** the parent agent's tool schema exposes a callable tool whose description matches `toolDescription`, and the tool accepts no required arguments other than the nested agent's prompt binding.

### Test: invocation runs nested agent and returns its answer

**Given** a mock primary chat-model handle that returns final text `"42"` on first call, input items `[{ "json": { "chatInput": "What is 6*7?" } }]`.

**Parameters:**

```json
{
  "toolDescription": "Math helper agent.",
  "text": "={{ $json.chatInput }}",
  "options": { "maxIterations": 3 }
}
```

**When** the parent agent invokes the tool:

**Expect** the nested agent is invoked once with the evaluated prompt (`What is 6*7?`), the model is called ≤ `maxIterations` times, and the tool observation returned to the parent contains the nested agent's answer (`"42"`). `text` expression is resolved (not passed as the raw `={{ ... }}` source).

### Test: missing chat model

**Given** the tool sub-node with **no** `ai_languageModel` connection.

**Expect:** invocation fails with an error indicating a Chat Model sub-node must be connected (documented agent-family error).

### Test: output parser applied

**Given** a parser handle on `ai_outputParser` that maps final text `"raw"` → `{ "ok": true }`, and `hasOutputParser: true`.

**Expect:** the nested agent's final answer passes through the parser handle; the tool observation to the parent reflects the structured result (e.g. `{ "ok": true }`).

### Test: fallback model on primary failure

**Given** primary model handle that throws, fallback model handle that returns `"ok"`, and `needsFallback: true` with both `ai_languageModel` slots connected.

**Expect:** on primary failure, the nested agent attempts the fallback once and returns `"ok"` (OpenFlow one-retry baseline).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose (multi-agent orchestration, parent agent calls sub-agents as tools) | documented | Public AI Agent Tool page |
| Docs page slug vs wire type | documented / corpus | Docs use `n8n-nodes-langchain.toolaiagent`; wire type `@n8n/n8n-nodes-langchain.agentTool` confirmed from package descriptor |
| Parameters: Description, Prompt, Require Specific Output Format, Enable Fallback Model | documented | UI labels from public docs; wire keys from package descriptor |
| Options: System Message, Max Iterations (default 10), Return Intermediate Steps, Passthrough Binary Images | documented | Shared with the Tools Agent root page; default for `maxIterations` is 10 (documented) |
| Defaults for Description / Passthrough Binary Images | inferred | Not stated in public docs; left unspecified (no package-derived defaults) |
| Options: Batch Processing (batch size, delay) | documented | Listed on the AI Agent Tool page |
| Tool sub-node wire format (`ai_tool` output, no `main`) | documented / corpus | Standard LangChain tool-sub-node contract + descriptor |
| Nested-agent runtime loop (own model, tools, memory, parser, fallback) | inferred | Public docs describe behavior; exact agent internals not reproduced |
| Fallback failover policy | gap | OpenFlow: one retry |
| Sub-node first-item expression semantics | documented | Public sub-node hint box |
| Exact tool-observation envelope | inferred | Public docs describe outcome (parent uses sub-agent answer); response shape is an implementation detail |
| Versions [2.2, 3] | corpus (metadata) | Package descriptor lists `agentTool` as a `VersionedNodeType` with versions `2.2` and `3`, default `3`; public docs are not version-specific |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/langchain-agent-tool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; nested model/tools/memory/parser supplied via OpenFlow AI sub-node runtime — **do not** load `@n8n/n8n-nodes-langchain` packages
