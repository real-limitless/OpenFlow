---
type: "@n8n/n8n-nodes-langchain.agent"
displayName: AI Agent
category: AI
versions: [1, 1.6, 1.7, 1.8, 1.9, 2, 2.1, 2.2, 3, 3.1]
priority: high
status: specced
---

# AI Agent

Cluster **root** node: runs an autonomous agent that uses a connected chat model plus tools (and optional memory / output parser / fallback model) to answer a user prompt.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/conversational-agent.md | Public docs only (legacy agent type; feature removed) |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/sql-agent.md | Public docs only (legacy agent type; feature removed) |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/what-agents-do.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger.md | Public docs only (`chatInput`, response fields `output` / `text`) |
| https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only (`$fromAI()`) |
| Public workflow export JSON (n8n template gallery API / shared templates) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.agent`
- **Aliases:** (none observed in public exports)
- **typeVersion:** public templates commonly use `1.7`–`1.9`, `2`–`2.2`, `3`, `3.1` (**public JSON**)
- **Inputs:**
  - `main` × 1 — workflow items carrying the user query (or prior-node data used by expressions)
  - `ai_languageModel` × 1..2 — required primary chat-model sub-node at **index 0**; optional fallback model at **index 1** when `needsFallback` is true (**documented** connection + **public JSON** channel / indices)
  - `ai_tool` × N — tool sub-nodes; docs require **at least one** tool for Tools Agent (**documented**)
  - `ai_memory` × 0..1 — optional conversation memory (**public JSON** channel)
  - `ai_outputParser` × 0..1 — optional structured output parser when `hasOutputParser` is on (**public JSON** channel)
- **Outputs:** `main` × 1
- **Credentials:** none on the agent root itself (model/tool credentials live on sub-nodes) (**documented** pattern)

Cluster topology: sub-nodes connect **into** the agent on AI channels; the agent’s `main` output continues the workflow (**documented** cluster-node model + **public JSON**).

## Parameters

Wire names from **public workflow JSON**; UI labels and defaults from **public docs**. Marked **inferred** where docs describe behavior but not the exact JSON key.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| promptType | options / string | `auto` when omitted (**inferred** from chat templates that omit the field) | no | — | UI: **Prompt**. Values: `define` (**public JSON** — “Define below”); auto / “Take from previous node automatically” / “Connected Chat Trigger Node” reads input field `chatInput` (**documented**). |
| text | string | — | when `promptType` is `define` | show when prompt is “Define below” | **Prompt (User Message)** — static text or expression; evaluate with `ctx.evaluate(text)` **per input item** (**documented** + **public JSON** key `text`) |
| hasOutputParser | boolean | `false` when omitted | no | — | **Require Specific Output Format**; when true, connect an output-parser sub-node on `ai_outputParser` and apply it to the final answer text (**documented** + **public JSON**) |
| needsFallback | boolean | `false` when omitted | no | — | When true, a second chat model is connected on `ai_languageModel` **index 1** as fallback (**public JSON**; UI label not fully documented — treat as fallback-model enable) |
| options | collection | `{}` | no | — | Nested options below |
| options.systemMessage | string | — | no | — | Prefixed instructions before the conversation; **evaluate with `ctx.evaluate` before the first model call** (same expression path as `text`) (**documented** + **public JSON**) |
| options.maxIterations | number | `10` | no | — | Max model↔tool loop iterations for one prompt (**documented**; templates may raise substantially) |
| options.returnIntermediateSteps | boolean | `false` when omitted | no | — | When true, include intermediate agent steps on the output item under **`intermediateSteps`** as a non-empty `[{ action, observation }, …]` list when tools ran (**documented** flag; property name **inferred** / OpenFlow contract) |
| options.tracingMetadata | fixedCollection / object | — | no | — | Custom key-value metadata for tracing; empty keys/values ignored (**documented**; camelCase key **inferred**) |
| options.passthroughBinaryImages | boolean | `true` when omitted (**inferred** “automatically” default on) | no | — | Pass binary images through as image messages; templates set `false` to disable (**documented** + **public JSON**). **OpenFlow:** deferred until SDK multimodal hooks exist — accept param, no-op or soft-skip when unsupported. |
| options.enableStreaming | boolean | `true` | no | — | Stream tokens when trigger supports streaming (Chat Trigger / Webhook streaming) (**documented**; key camelCase **inferred**). **OpenFlow:** deferred until SDK streaming hooks exist — accept param; run non-streaming completion. |
| agent | options | `toolsAgent` (historical) | no | legacy versions / older exports | Legacy **agent type** selector removed product-side ~1.82; current behavior is **Tools Agent**. Public exports still carry values such as `conversationalAgent`, `reActAgent` (**public JSON**); docs also mention plan-and-execute / OpenAI functions / SQL as removed types. Map non-tools legacy values to Tools Agent or partial compatibility. |

### Legacy agent-type-only parameters (removed features)

Documented only for import compatibility; not required for Tools Agent:

| name | notes |
|------|-------|
| dataSource / SQL credentials / binary SQLite field | SQL Agent (**documented**, feature removed) |
| options.ignoredTables, includedTables, includeSampleRows, prefixPrompt, suffixPrompt, limit | SQL Agent options (**documented**, removed) |
| options.humanMessage | Conversational Agent tool/format scaffolding with `{tools}`, `{format_instructions}`, `{{input}}` (**documented**, removed) |

## Runtime behavior

### OpenFlow implementer contract (MUST)

Independent behavioral contract for `langchain-agent.ts`. Paraphrased from public docs; OpenFlow baselines marked where docs are silent. **Do not** load third-party packages.

1. **Per-item loop (batching):** iterate over `ctx.getInputItems(0)` and process **one full agent run per main input item** in order; emit one main output item per successful item. Multi-item semantics are a **gap** in public docs → OpenFlow baseline.
2. **Resolve prompt per item:**
   - `promptType` omitted / auto / “Connected Chat Trigger Node” → `String(item.json.chatInput ?? "")`; empty/null → error (“No prompt specified” / invalid content) (**documented**).
   - `promptType === "define"` → `await ctx.evaluate(params.text)` with **item-scoped** expressions; null/empty → error (**documented**).
3. **Evaluate system message before first model call:** if `options.systemMessage` is set, `await ctx.evaluate(options.systemMessage)` (same path as `text`) **once per item, before the first model invoke** (**documented** expressions + OpenFlow parity).
4. **Resolve AI handles** from cluster connections (engine-supplied; channel names from **public JSON**):
   - Primary model: `ai_languageModel[0]` — required; missing → “A Chat Model sub-node must be connected” (**documented**).
   - Fallback model: `ai_languageModel[1]` when `needsFallback` (**public JSON**).
   - Tools: all `ai_tool` handles — docs require ≥1; collect each tool’s **name + schema/definition** and pass them into **every** model invocation (**documented** tool-calling interface).
   - Memory: optional `ai_memory[0]` — when present, **prepend prior turns** into the message list before the current user prompt on the **first** model invoke (**documented** Tools Agent + Chat Trigger memory).
   - Output parser: optional `ai_outputParser[0]` when `hasOutputParser` — apply to final assistant text after the loop (**documented**).
5. **Build initial messages:** evaluated system (if any) + memory turns (if any) + current user prompt; optionally attach binary images when `passthroughBinaryImages` and SDK supports multimodal (**documented**; **deferred** in OpenFlow if hooks missing).
6. **Iterative Tools Agent loop** — **required** (**documented** max iterations + multi-step agent behavior):
   - Bound by `options.maxIterations` with **default 10** when omitted / invalid / non-positive.
   - Each **iteration** = one invoke of the **primary** chat-model handle with: current messages **and** tool definitions from `ai_tool`.
   - If the model returns a **final text answer** (no tool calls) → exit loop with that text.
   - If the model requests **tool call(s):** for each call, resolve the matching `ai_tool` handle **by name**, **invoke** it with model-supplied arguments, append the tool result/observation to the transcript, and record `{ action, observation }` when collecting intermediates; then continue the loop (next iteration).
   - If primary model throws and `needsFallback` + fallback handle exist → **one retry** of the **same** iteration request on the fallback before failing (**public JSON** topology; exact failover policy **gap** — one-retry is the OpenFlow baseline; keep this behavior).
   - If the iteration budget is exhausted **without** a final text answer → **throw** / error the item (**gap** in public docs → OpenFlow contract).
7. **Output parser:** when `hasOutputParser` is true and `ai_outputParser[0]` exists, apply the parser to produce structured `output`. Docs state the Tools Agent "passes the parser to the model as a formatting tool" (**documented** mechanism). **OpenFlow baseline:** run the final assistant text through the parser handle and set `output` to the structured result; otherwise `output` is the assistant string — the parser-as-tool injection is a LangChain internals detail not replicated without loading that package.
8. **Intermediate steps:** when `options.returnIntermediateSteps === true` and tools ran, set `json.intermediateSteps` to a **non-empty** ordered list of `{ action, observation }` steps collected during the loop (**documented** flag; property name **OpenFlow contract**). When the flag is false/omitted, omit the field.
9. **Streaming / binary images:** honor `enableStreaming` and `passthroughBinaryImages` only when ExecutionContext exposes streaming / multimodal hooks; otherwise treat as **deferred no-ops** (still accept parameters for import parity) (**documented** options + OpenFlow SDK gap).
10. **Human-in-the-loop / `$fromAI()`:** tool invocation goes through engine tool handles; HITL gating and `$fromAI()` resolution are tool/engine concerns (**documented**); agent must still call tools when the model requests them.

### Input

1. Resolve the **user prompt** as in the implementer contract (per item).
2. Require a connected **Chat Model** on `ai_languageModel` index 0.
3. If `needsFallback` is true, accept optional second model on `ai_languageModel` index 1.
4. Require **≥1 tool** on `ai_tool` for Tools Agent (**documented**).
5. Optional **memory** on `ai_memory`; session memory does not persist across separate chat sessions unless the memory sub-node is configured to do so (**documented**).
6. Optional **output parser** on `ai_outputParser` when `hasOutputParser` is true.
7. Optional binary images when passthrough is enabled (**documented**; deferred if unsupported).
8. Agent loop: model decides actions → may call tools (possibly multiple iterations) → evaluates tool results → produces final answer. Max loops bounded by `maxIterations` (default 10) (**documented**).
9. Tool calls may pause for **human review** when tools are wired through a human-review channel (**documented** HITL).
10. App-node tools may use `$fromAI()` dynamic parameters (**documented**).

### Output

- One main-branch item per successful agent completion for the processed input item.
- Final answer field **`output`** (primary); Chat Trigger may also accept **`text`** — OpenFlow always sets `output`; may mirror to `text` for compatibility (**documented** Chat Trigger contract + **public templates** reading `$json.output`).
- When `hasOutputParser` is on, `output` may be structured (object/array) rather than a plain string (**documented** + templates reading nested `output.*`).
- When `returnIntermediateSteps` is on and tools ran, include **`intermediateSteps`** non-empty array on the item (**OpenFlow contract**).
- Streaming: with `enableStreaming` and a streaming-capable trigger, partial tokens may be sent during generation; final item still materializes on `main` (**documented**; deferred without SDK hooks).

### Errors

| Condition | Behavior |
|-----------|----------|
| No chat model connected | Node error (**documented**) |
| No tools connected | Invalid configuration per docs requirement (**documented**) |
| Empty/null prompt (`chatInput` or `text`) | Fail (e.g. “No prompt specified”, “Invalid value for content”) (**documented**) |
| Model/provider/tool failures | Fail the item/node unless fallback model succeeds (one retry) or workflow-level retry / continue-on-fail is set (**inferred** + fallback **public JSON**) |
| Max iterations exhausted without final answer | OpenFlow: **throw** / error the item (**gap** in public docs) |
| Human review denied | Tool call canceled; agent continues with rejection context (**documented**) |
| `continueOnFail` | Standard: emit error on item / continue (**inferred**) |

### Expressions

- `text`, `options.systemMessage`, and tracing metadata values use `{{ … }}` / leading `=` expression form; evaluate via `ctx.evaluate` **per item** (**public JSON** + OpenFlow SDK).
- `promptType` occasionally appears as an expression (e.g. `=define`) in public templates (**public JSON**).
- Prompt auto mode depends on upstream `chatInput`, not an expression on the agent.

## Acceptance tests

Fixtures for `batch-queue-langchain-agent.test.ts` (and equivalent). Shape assertions; model content is mock-driven.

### Test: define prompt — happy path shape

**Given** input items:

```json
[{ "json": { "query": "What is 2+2?" } }]
```

**Parameters:**

```json
{
  "promptType": "define",
  "text": "={{ $json.query }}",
  "options": {
    "systemMessage": "You are a concise math assistant.",
    "maxIterations": 10,
    "returnIntermediateSteps": false,
    "enableStreaming": false
  }
}
```

**Cluster (logical):** chat model on `ai_languageModel` index 0; ≥1 tool on `ai_tool`.

**Expect** output[0] (shape; content model-dependent):

```json
[{ "json": { "output": "<non-empty assistant string>" } }]
```

### Test: auto prompt from chatInput

**Given** input items:

```json
[{ "json": { "chatInput": "Hello" } }]
```

**Parameters:**

```json
{
  "options": {}
}
```

**Expect:** agent uses `chatInput` as the user message; main output includes `output` (or `text`) string (**documented** field names).

### Test: missing chat model

**Given** input `[{ "json": { "chatInput": "Hi" } }]` and **no** `ai_languageModel` connection.

**Expect:** execution error indicating a Chat Model sub-node must be connected (**documented**).

### Test: null define prompt

**Given** input `[{ "json": {} }]`

**Parameters:**

```json
{
  "promptType": "define",
  "text": "={{ $json.missing }}"
}
```

**Expect:** error (null/invalid prompt content) (**documented** common issues).

### Test: tool-loop + intermediateSteps fixture

**Given** a mock chat-model handle that on call 1 requests tool `calc` with args `{ "expr": "2+2" }`, and on call 2 returns final text `"4"`; mock `ai_tool` handle named `calc` that returns `"4"`.

**Parameters:**

```json
{
  "promptType": "define",
  "text": "What is 2+2? Use tools.",
  "options": {
    "systemMessage": "={{ 'Be precise.' }}",
    "maxIterations": 5,
    "returnIntermediateSteps": true,
    "enableStreaming": false
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "output": "4",
    "intermediateSteps": [
      {
        "action": { "tool": "calc", "toolInput": { "expr": "2+2" } },
        "observation": "4"
      }
    ]
  }
}]
```

Notes:

- `intermediateSteps` **must be non-empty** when tools ran and the flag is true.
- Model invoked **≤ maxIterations** times; tool handle invoked once.
- `systemMessage` expression evaluated **before** the first model call (assert evaluated content, not raw `={{ … }}`).

### Test: maxIterations=3 always-tool error

**Given** a model handle that **always** requests a tool (never finalizes).

**Parameters:**

```json
{
  "promptType": "define",
  "text": "loop forever",
  "options": {
    "maxIterations": 3,
    "returnIntermediateSteps": true,
    "enableStreaming": false
  }
}
```

**Expect:** after 3 model iterations, item/node **throws** (does not hang). Tool may be invoked up to 3 times.

### Test: multi-item batching

**Given** input items:

```json
[
  { "json": { "chatInput": "first" } },
  { "json": { "chatInput": "second" } }
]
```

**Parameters:** `{ "options": { "enableStreaming": false } }` with a mock model that echoes the user text as final answer (no tools required for this fixture if tools are still connected as stubs).

**Expect** output[0] length **2**, one run per item, order preserved:

```json
[
  { "json": { "output": "first" } },
  { "json": { "output": "second" } }
]
```

Model invoked twice (once per item). Prompt/`text` expressions re-resolved per item when `promptType` is `define`.

### Test: memory turns in first invoke

**Given** `ai_memory[0]` mock that returns prior turns `[{ "role": "user", "content": "hi" }, { "role": "assistant", "content": "hello" }]`, input `[{ "json": { "chatInput": "follow up" } }]`.

**Expect:** **first** model invoke message list **includes** those memory turns **before** the current user prompt (**documented** memory + OpenFlow contract).

### Test: systemMessage expression eval

**Given** parameters with `"options": { "systemMessage": "={{ 'Role: ' + $json.role }}" }` and input `[{ "json": { "chatInput": "hi", "role": "tutor" } }]`.

**Expect:** first model invoke includes a system message whose content is the **evaluated** string (e.g. contains `tutor`), not the raw expression source.

### Test: parser applied to output

**Given** parser on `ai_outputParser` that maps final text `"raw"` → `{ "ok": true }`, and parameters:

```json
{
  "promptType": "define",
  "text": "Return structured data.",
  "hasOutputParser": true,
  "options": { "enableStreaming": false }
}
```

**Expect:** final assistant text is passed through the parser handle; `output` reflects structured result (e.g. `{ "ok": true }`) (**documented** + **public JSON**).

### Test: fallback model one-retry

**Given** primary model on `ai_languageModel` index 0 that throws once, fallback model on index 1 that returns final text `"ok"`.

**Parameters:**

```json
{
  "promptType": "define",
  "text": "Hello",
  "needsFallback": true,
  "options": { "enableStreaming": false }
}
```

**Expect:** executor accepts dual `ai_languageModel` inputs; on primary failure, **one** attempt on fallback succeeds with `output: "ok"` (**public JSON** topology; one-retry OpenFlow baseline).

### Test: deferred options accepted

**Parameters** include `"options": { "passthroughBinaryImages": false, "enableStreaming": true }` with a non-streaming test harness.

**Expect:** node runs to completion without throwing solely because streaming/binary hooks are absent; parameters are readable on the definition (**OpenFlow deferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root AI Agent node |
| Tools-only modern behavior | documented | Agent-type selector removed; Tools Agent is current |
| Prompt modes + `chatInput` | documented | UI labels; wire `promptType`/`text` from public JSON |
| `promptType` default `auto` | inferred | Omitted in many chat templates |
| `hasOutputParser` + apply parser | documented + public JSON | Docs: parser passed to model as a formatting tool; OpenFlow: post-process final text via handle (no LangChain loaded) |
| `needsFallback` + model index 1 | public JSON | Failover: OpenFlow one-retry baseline |
| Options: systemMessage (evaluate), maxIterations default 10, returnIntermediateSteps | documented + public JSON | systemMessage eval = same path as text, before first model call |
| `intermediateSteps` property name + `{action,observation}` | inferred / OpenFlow contract | Docs say “include intermediate steps”; name/schema not in UI docs |
| Options: tracingMetadata | documented | camelCase key inferred |
| Options: passthroughBinaryImages, enableStreaming | documented | **Deferred** in OpenFlow without SDK hooks |
| Connection channel names | public JSON | `ai_languageModel`, `ai_tool`, `ai_memory`, `ai_outputParser`, `main` |
| Output field `output` / `text` | documented | Chat Trigger contract |
| Exact intermediate-steps JSON schema | inferred / gap | Acceptance fixture gives baseline shape |
| Behavior with zero tools | documented as required | Some older templates may omit tools — treat as invalid under current docs |
| Streaming wire protocol | partial / deferred | Documented requirements only |
| Legacy `agent` values | documented removed + public JSON | `conversationalAgent`, `reActAgent`, etc. |
| Multi-item batching | gap | OpenFlow: one run per item |
| `$fromAI()` / HITL | documented | Tool-side concerns; agent invokes tools through engine hooks |
| Max-iteration exhaustion | gap | OpenFlow: throw |

## OpenFlow mapping

- **Definition group:** `ai` (new) or `core` until an AI group exists
- **Executor file:** `src/lib/engine/executors/langchain-agent.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; model/tool/memory/parser supplied via OpenFlow AI sub-node runtime — **do not** load `@n8n/n8n-nodes-langchain` packages
- **Implement priority:** (1) per-item loop + prompt/`systemMessage` `ctx.evaluate`, (2) iterative model↔tool loop + `maxIterations` default 10 + throw when exhausted, (3) `returnIntermediateSteps` non-empty `[{action,observation}]`, (4) `ai_outputParser[0]` + `ai_memory[0]` prepend, (5) `needsFallback` one-retry, (6) deferred streaming/binary
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-langchain-agent.test.ts` — cover tool-loop + intermediateSteps, maxIterations=3 always-tool error, multi-item batching, memory turns in first invoke, systemMessage expression eval, parser applied to output
