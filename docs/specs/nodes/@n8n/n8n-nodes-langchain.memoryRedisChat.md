---
type: '@n8n/n8n-nodes-langchain.memoryRedisChat'
displayName: Redis Chat Memory
category: AI
versions: [1]
priority: medium
status: specced
---

# Redis Chat Memory

Cluster **sub-node**: provides a durable, Redis-backed conversation-memory
handle to a root node (AI Agent) on the `ai_memory` channel. Chat history is
persisted in Redis keyed by session, so an agent can continue a multi-turn
conversation across executions without losing prior context.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memoryredischat.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/redis.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://js.langchain.com/docs/integrations/memory/redis | Third-party docs (related resource linked from public docs) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.memoryRedisChat`
- **Aliases:** (none)
- **Inputs:** none on `main` (sub-node; no main-item pipeline)
- **Outputs:**
  - `ai_memory` × 1 — connects **into** a root node's memory input (cluster
    sub-node channel convention; same channel used by sibling memory sub-nodes)
- **Credentials:** `redis` (documented — Redis credentials are used to
  authenticate this node)
- **typeVersion:** `1` (inferred; no multi-version deltas documented)

Cluster topology: this node is attached as a **sub-node** of an Agent root. The
root drives the conversation; this node owns only the persistent message store —
it loads prior turns and appends new ones when the parent asks (**documented**
cluster-node model + sibling memory specs).

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| sessionId | string | — | no | — | **Session Key** — key used to store memory in workflow data (**documented**). May be static or an expression. When blank, resolved from the connected Chat Trigger's `sessionId` (**inferred** from sibling memory behavior). |
| sessionTTL | number | — | no | — | **Session Time To Live** — makes the session expire after a given number of seconds (**documented**). |
| contextWindowLength | number | — | no | — | **Context Window Length** — number of previous interactions to consider for context (**documented**). An "interaction" is a user+assistant turn pair. |

No operation/resource selector — the docs page lists only these parameters
(**documented**).

## Runtime behavior

### Role

1. Expose a **memory handle** on output channel **`ai_memory`** for the parent
   root to call. This node does **not** emit normal `main` items by itself in the
   cluster pattern (sub-node / cluster model).
2. Resolve **`sessionId`**: if the parameter is set (static or expression), use
   it; otherwise auto-retrieve `sessionId` from the connected Chat Trigger
   (**inferred** from sibling memory behavior). As a **sub-node**, any expression
   resolves against the **first** input item only (**documented** sub-node
   parameter resolution).
3. Backing store: Redis, keyed by `sessionId` (**documented** "use Redis as a
   memory server"). Storage is **durable** — persisted in Redis across
   executions, restarts, and workers.
4. **Session TTL**: when `sessionTTL` is set, Redis keys auto-expire after the
   given number of seconds (**documented**). This differs from the windowing
   behavior of `contextWindowLength` — TTL removes data entirely rather than
   just limiting context.

### Memory handle contract (parent-invoked)

The parent root (AI Agent) drives the store through the handle:

- **Load prior turns:** when the parent builds its first message list for a run,
  it asks the memory handle for prior context. The handle returns the last
  `contextWindowLength` **interactions** (user+assistant turn pairs) for the
  resolved `sessionId`, oldest-first (**documented** "number of previous
  interactions to consider").
- **Save the new turn:** after a run, the parent appends the just-completed
  user message and assistant response to the store for that `sessionId`
  (**inferred** from "persist chat history"; exact save trigger is an OpenFlow
  contract).
- **Windowing:** on every load, only the most recent `contextWindowLength`
  interactions are returned; older turns remain persisted but are excluded from
  context (**documented** window semantics).
- **TTL expiration:** if `sessionTTL` is set, the entire session key(s) expire
  after the configured seconds, making all stored messages for that session
  unavailable (**documented**).

### Single instance by default

If more than one Redis Chat Memory node is added to a workflow, **all** nodes
access the same memory instance by default. To keep separate memories, set
different session keys on different memory nodes (**documented**).

### Output

When used only as a memory sub-node:

- Connection graph output: `ai_memory` → parent.
- No `main`-branch items are produced by this node; the parent incorporates
  loaded turns into its own `main` output (sub-node / cluster model).

### Errors

| Condition | Behavior |
|-----------|----------|
| Invalid or unreachable Redis credentials / connection | Fail with a connection error (**documented** credential requirements) |
| `contextWindowLength` missing / non-positive | Use a sensible default or fail; not documented (**gap** — OpenFlow: treat ≤0 as "no prior context") |
| `sessionTTL` missing / non-positive | No TTL applied; session persists indefinitely (**inferred** from optional parameter semantics) |
| Duplicate Redis Chat Memory nodes sharing a session | Both access the same memory instance; be careful with destructive overrides (**documented**) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `sessionId` may be an expression (`={{ … }}`), e.g. `={{ $json.sessionId }}`
  (**inferred** from sub-node conventions).
- Sub-node rule: multi-item expressions always use the **first** item
  (**documented**).
- `sessionTTL` and `contextWindowLength` may be expressions (**inferred** from
  sibling sub-node conventions).

## Acceptance tests

### Test: wire shape — session key + TTL + window

**Parameters:**
```json
{
  "sessionId": "my_chat_session",
  "sessionTTL": 3600,
  "contextWindowLength": 5
}
```

**Credentials:** `redis` pointing at a reachable Redis instance.

**Cluster:** connect this node's `ai_memory` → AI Agent `ai_memory`.

**Expect:** parent can load/save turns for session `my_chat_session`; loads
return at most the last 5 interactions; session expires in 3600 seconds
(**documented** params).

### Test: empty sessionId resolves from Chat Trigger

**Given** node configured with `sessionId: ""` and `contextWindowLength: 3`,
connected to a Chat Trigger that provides `sessionId: "auto_sess"`.

**Expect:** the memory handle resolves `sessionId` to `"auto_sess"` and
loads/saves under that key (**inferred** from sibling memory sub-nodes).

### Test: TTL expiration removes data

**Given** store for session `sess` holds `[u1/a1, u2/a2]`, `sessionTTL: 1`, and
more than 1 second elapses before the next execution.

**Expect:** the next load returns an empty history — Redis key has expired
(**documented** "session expire after a given number of seconds").

### Test: window truncates to last N interactions

**Given** the store for `sess` holds 4 interactions
(`[u1/a1, u2/a2, u3/a3, u4/a4]`) and `contextWindowLength` is `2`.

**Expect:** a load returns only `[u3/a3, u4/a4]`, oldest-first (**documented**
window semantics).

### Test: separate sessions stay isolated

**Given** two Redis Chat Memory nodes in the same workflow, one with
`sessionId: "a"`, one with `sessionId: "b"`, each `contextWindowLength: 5`.

**Expect:** turns saved under `a` are **not** returned by a load on `b`, and
vice-versa (**documented** "set different session IDs for more than one memory
instance").

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Session Key, Session TTL, Context Window Length | documented | Primary docs page |
| `sessionId` wire name | inferred | camelCase from UI label "Session Key"; matches sibling memory nodes |
| `sessionTTL` wire name | inferred | camelCase from UI label "Session Time To Live" |
| `contextWindowLength` wire name | inferred | camelCase from UI label "Context Window Length"; matches sibling nodes |
| Redis credentials required | documented | Credentials page lists Redis Chat Memory as a consumer |
| TTL-based expiration | documented | "Session Time To Live" parameter |
| Durable persistence across executions | documented | Redis is the backing memory server |
| Single shared instance by default; distinct sessions via different sessionId | documented | Primary page |
| Sub-node first-item expression rule | documented | Parameter-resolution hint on primary page |
| sessionId auto-retrieved from Chat Trigger | inferred | Sibling memory sub-nodes do this; not stated on this page |
| Load/save handle call sites | inferred / OpenFlow contract | Docs describe behavior, not the exact interface |
| Exact Redis key structure | gap | Must satisfy load/save behavior only |
| typeVersion behavior deltas | gap | Only v1 observed |
| Context window implementation (trim vs filter) | gap | Behavior described at outcome level only |
| TTL + window interaction | gap | Not documented; TTL removes all data, window filters within remaining data |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster sub-nodes)
- **Executor file:** `src/lib/engine/executors/memory-redis-chat.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.memoryRedisChat` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a memory handle on
  `ai_memory` backed by Redis, keyed by `sessionId`, windowed to
  `contextWindowLength` interactions, with optional TTL (`sessionTTL`). Resolve
  `sessionId` from the param or the Chat Trigger's `sessionId`. Use a Redis
  client with the `redis` credential fields (password, host, port, database
  number, SSL, disable TLS verification).
