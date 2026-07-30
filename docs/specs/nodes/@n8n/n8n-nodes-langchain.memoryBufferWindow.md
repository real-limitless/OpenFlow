---
type: "@n8n/n8n-nodes-langchain.memoryBufferWindow"
displayName: Simple Memory
category: AI
versions: [1]
priority: medium
status: specced
---

# Simple Memory

Cluster **sub-node**: provides an in-process conversation-memory handle to a root
node (AI Agent) on the `ai_memory` channel. It keeps a sliding window of the most
recent chat interactions, keyed by session, so an agent can continue a
multi-turn conversation without the caller resending prior context each turn.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorybufferwindow.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorybufferwindow/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://v03.api.js.langchain.com/classes/langchain.memory.BufferWindowMemory.html | Third-party docs (related resource linked from public docs) |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.memoryBufferWindow`
- **Aliases:** (none observed in public exports)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_memory` × 1 — connects **into** a root node's memory input (**public JSON** channel name; confirmed in-repo in the AI Agent spec)
- **Credentials:** none (**documented** — memory is stored in workflow data, no service auth)
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent root. The
root drives the conversation; this node owns only the message buffer — it loads
prior turns and appends new ones when the parent asks (**documented** cluster-node
model + **public JSON**).

## Parameters

UI labels from **public docs**; wire names from **public workflow JSON** +
common-issues page (`sessionId` appears verbatim there). Keys not on the docs
page are **inferred** from naming convention.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| sessionId | string | auto — retrieved from the Chat Trigger (`sessionId`) when omitted (**documented** common issues) | no | — | **Session Key** — key used to store the memory in the workflow data (**documented**). When blank, the node resolves `sessionId` from the connected Chat Trigger output; otherwise use a static key (e.g. `my_test_session`) or an expression (**documented**). |
| contextWindowLength | number | not documented on the node page (**gap**) | no | — | **Context Window Length** — number of previous interactions to consider for context (**documented**). An "interaction" is a user+assistant turn pair; the window keeps the last N such pairs (**inferred** from "interactions" wording + related LangChain Buffer Window Memory docs). |

No operation/resource selector — the docs page lists only these two parameters
(**documented**).

## Runtime behavior

### Role

1. Expose a **memory handle** on output channel **`ai_memory`** for the parent
   root to call. This node does **not** emit normal `main` items by itself in the
   cluster pattern (**public JSON** / cluster model).
2. Resolve **`sessionId`**: if the parameter is set (static or expression), use
   it; otherwise auto-retrieve `sessionId` from the connected Chat Trigger
   (**documented** common issues). As a **sub-node**, any expression resolves
   against the **first** input item only (**documented** sub-node parameter
   resolution).
3. Backing store: an in-workflow-data map keyed by `sessionId` (**documented** —
   "store the memory in the workflow data"). The store is process-local; it is
   **not** durable across executions, restarts, or workers (**documented** queue
   mode warning).

### Memory handle contract (parent-invoked)

The parent root (AI Agent) drives the buffer through the handle. Interface is
**inferred** from documented behavior + the related LangChain Buffer Window
Memory docs; OpenFlow baselines are marked.

- **Load prior turns:** when the parent builds its first message list for a run,
  it asks the memory handle for prior context. The handle returns the last
  `contextWindowLength` **interactions** (user+assistant turn pairs) for the
  resolved `sessionId`, oldest-first, to be **prepended** before the current
  user prompt (**documented** "number of previous interactions to consider" +
  in-repo AI Agent contract: "prepend prior turns … on the first model invoke").
- **Save the new turn:** after a run, the parent appends the just-completed
  user message and assistant response to the buffer for that `sessionId`
  (**inferred** from "persist chat history"; exact save trigger is an OpenFlow
  contract since the docs do not specify the call site).
- **Windowing:** on every load, only the most recent `contextWindowLength`
  interactions are returned; older turns are retained in the store but excluded
  from context (**documented** window semantics).

### Single instance by default

If more than one Simple Memory node is added to a workflow, **all** nodes share
the same memory instance by default (same default session). To keep separate
memories, set different `sessionId` values on different memory nodes
(**documented** common issues). Destructive overrides (e.g. the Chat Memory
Manager "override all messages" operation) affect that shared instance
(**documented**).

### Output

When used only as a memory sub-node:

- Connection graph output: `ai_memory` → parent.
- No `main`-branch items are produced by this node; the parent incorporates
  loaded turns into its own `main` output (e.g. agent `output`) (**public JSON**
  / cluster model).

### Errors

| Condition | Behavior |
|-----------|----------|
| `No sessionId` (param blank **and** no `sessionId` on the Chat Trigger output) | Fail with a "No sessionId" error (**documented** common issues) |
| `contextWindowLength` missing / non-positive | Use a sensible default or fail; not documented (**gap** — OpenFlow: treat ≤0 as "no prior context" / window of 0) |
| Queue mode (active production workflow) | Does not work — n8n cannot guarantee every call hits the same worker (**documented** warning) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `sessionId` may be an expression (`={{ … }}`), e.g. `={{ $json.sessionId }}`
  (**public JSON** conventions + **documented** "manage sessions manually").
- Sub-node rule: multi-item expressions always use the **first** item
  (**documented**).
- `contextWindowLength` may be an expression (**inferred** from sibling sub-node
  conventions).

## Acceptance tests

### Test: wire shape — session key + window

**Parameters:**

```json
{
  "sessionId": "my_test_session",
  "contextWindowLength": 5
}
```

**Cluster:** connect this node's `ai_memory` → AI Agent `ai_memory`.

**Expect:** parent can load/save turns for session `my_test_session`; loads
return at most the last 5 interactions (**documented** params + window).

### Test: sessionId auto from Chat Trigger

**Parameters:**

```json
{
  "contextWindowLength": 3
}
```

**Given** the connected Chat Trigger emits a first item with
`{ "sessionId": "abc-123" }`.

**Expect:** memory is keyed by `abc-123` (param blank → auto-retrieve from
trigger) (**documented** common issues).

### Test: window truncates to last N interactions

**Given** the buffer for `sess` already holds 4 interactions
(`[u1/a1, u2/a2, u3/a3, u4/a4]`) and `contextWindowLength` is `2`.

**Expect:** a load returns only the last 2 interactions
(`[u3/a3, u4/a4]`), oldest-first (**documented** window semantics).

### Test: new turn appended after a run

**Given** the buffer for `sess` holds `[u1/a1]`, `contextWindowLength` `5`, and
the parent completes a new run with user `u2` → assistant `a2`.

**Expect:** after the run, the buffer for `sess` holds
`[u1/a1, u2/a2]`; a subsequent load returns both interactions (**documented**
"persist chat history" + OpenFlow save contract).

### Test: No sessionId error

**Parameters:** `{ "contextWindowLength": 5 }` (no `sessionId`) with **no**
Chat Trigger providing a `sessionId`.

**Expect:** execution error containing "No sessionId" (**documented** common
issues).

### Test: separate sessions stay isolated

**Given** two Simple Memory nodes in the same workflow, one with
`sessionId: "a"`, one with `sessionId: "b"`, each `contextWindowLength: 5`.

**Expect:** turns saved under `a` are **not** returned by a load on `b`, and
vice-versa (**documented** "set different session IDs … for more than one memory
instance").

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Session Key, Context Window Length | documented | Primary docs page |
| `sessionId` wire name | documented | Common-issues page uses `sessionId` verbatim |
| `contextWindowLength` wire name | inferred | camelCase from UI label "Context Window Length" |
| Channel name `ai_memory` | public JSON | Confirmed in template exports + in-repo AI Agent spec |
| sessionId auto-retrieved from Chat Trigger | documented | Common-issues page |
| `No sessionId` error | documented | Common-issues page |
| Single shared instance by default; distinct sessions via different sessionId | documented | Common-issues page |
| Queue mode limitation (active production) | documented | Warning on primary docs page |
| Sub-node first-item expression rule | documented | Parameter-resolution hint on primary page |
| Agents can use memory; chains can't | documented | integrate-ai / memory footnote |
| "interaction" = user+assistant turn pair | inferred | "interactions" wording + related LangChain Buffer Window Memory docs |
| Default `contextWindowLength` | gap | Not stated on the node page; commonly set explicitly |
| Load/save handle call sites | inferred / OpenFlow contract | Docs describe behavior, not the exact interface; parent prepends on first invoke (in-repo agent contract) |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| Common-issues page exists | documented | Fetched successfully (unlike some sibling nodes) |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster sub-nodes)
- **Executor file:** `src/lib/engine/executors/memory-buffer-window.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.memoryBufferWindow` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a memory handle on
  `ai_memory` backed by an in-process session-keyed map (windowed to
  `contextWindowLength` interactions); resolve `sessionId` from the param or the
  Chat Trigger's `sessionId`; do **not** load `@n8n/nodes-langchain` packages.
  Queue-mode / cross-worker durability is out of scope (documented limitation).