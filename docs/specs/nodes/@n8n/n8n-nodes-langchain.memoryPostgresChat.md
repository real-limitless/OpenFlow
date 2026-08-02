---
type: '@n8n/n8n-nodes-langchain.memoryPostgresChat'
displayName: Postgres Chat Memory
category: AI
versions: [1]
priority: medium
status: specced
---

# Postgres Chat Memory

Cluster **sub-node**: provides a durable, Postgres-backed conversation-memory
handle to a root node (AI Agent) on the `ai_memory` channel. Chat history is
persisted in a Postgres table keyed by session, so an agent can continue a
multi-turn conversation across executions without the caller resending prior
context each turn.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorypostgreschat.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/postgres.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://js.langchain.com/docs/integrations/memory/postgres | Third-party docs (related resource linked from public docs) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.memoryPostgresChat`
- **Aliases:** (none)
- **Inputs:** none on `main` (sub-node; no main-item pipeline)
- **Outputs:**
  - `ai_memory` × 1 — connects **into** a root node's memory input (cluster
    sub-node channel convention; same channel used by sibling memory sub-nodes)
- **Credentials:** `postgres` (documented — Postgres credentials are used to
  authenticate this node)
- **typeVersion:** `1` (inferred; no multi-version deltas documented for this
  node)

Cluster topology: this node is attached as a **sub-node** of an Agent root. The
root drives the conversation; this node owns only the persistent message store —
it loads prior turns and appends new ones when the parent asks (**documented**
cluster-node model + sibling memory specs).

## Parameters

UI labels from **public docs**; wire names **inferred** from camelCase
convention (matching the sibling Simple Memory node's `sessionId` /
`contextWindowLength`).

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| sessionId | string | — | no | — | **Session Key** — key used to store the memory in the workflow data (**documented**). When blank, resolved from the connected Chat Trigger's `sessionId`; otherwise a static key or an expression (**inferred** from sibling Simple Memory behavior). |
| tableName | string | — | yes (effective) | — | **Table Name** — name of the Postgres table that stores the chat history. The system creates the table if it does not exist (**documented**). |
| contextWindowLength | number | — | no | — | **Context Window Length** — number of previous interactions to consider for context (**documented**). An "interaction" is a user+assistant turn pair; only the last N such pairs are included in loaded context (**inferred** from "interactions" wording + related LangChain Postgres Chat Message History docs). |

No operation/resource selector — the docs page lists only these parameters
(**documented**).

## Runtime behavior

### Role

1. Expose a **memory handle** on output channel **`ai_memory`** for the parent
   root to call. This node does **not** emit normal `main` items by itself in the
   cluster pattern (sub-node / cluster model).
2. Resolve **`sessionId`**: if the parameter is set (static or expression), use
   it; otherwise auto-retrieve `sessionId` from the connected Chat Trigger
   (**inferred** from sibling memory sub-node; blank-key resolution matches the
   Simple Memory behavior). As a **sub-node**, any expression resolves against
   the **first** input item only (**documented** sub-node parameter resolution).
3. Backing store: a Postgres table (`tableName`), auto-created when missing,
   keyed by `sessionId` (**documented**). Storage is **durable** — persisted in
   Postgres across executions, restarts, and workers, unlike the in-process
   Simple Memory node (**documented** Postgres-as-memory-server model).

### Memory handle contract (parent-invoked)

The parent root (AI Agent) drives the store through the handle. Interface is
**inferred** from documented behavior + the related LangChain Postgres Chat
Message History docs; OpenFlow baselines are marked.

- **Load prior turns:** when the parent builds its first message list for a run,
  it asks the memory handle for prior context. The handle returns the last
  `contextWindowLength` **interactions** (user+assistant turn pairs) for the
  resolved `sessionId`, oldest-first, to be **prepended** before the current
  user prompt (**documented** "number of previous interactions to consider" +
  in-repo AI Agent contract: "prepend prior turns … on the first model invoke").
- **Save the new turn:** after a run, the parent appends the just-completed
  user message and assistant response to the store for that `sessionId`
  (**inferred** from "persist chat history"; exact save trigger is an OpenFlow
  contract since the docs do not specify the call site).
- **Windowing:** on every load, only the most recent `contextWindowLength`
  interactions are returned; older turns remain persisted but are excluded from
  context (**documented** window semantics).

### Single instance by default

If more than one Postgres Chat Memory node is added to a workflow, **all** nodes
access the same memory instance by default. To keep separate memories, set
different session keys on different memory nodes (**documented**). Destructive
overrides (e.g. the Chat Memory Manager "override all messages" operation)
affect that shared instance (**documented**).

### Output

When used only as a memory sub-node:

- Connection graph output: `ai_memory` → parent.
- No `main`-branch items are produced by this node; the parent incorporates
  loaded turns into its own `main` output (e.g. agent `output`) (sub-node /
  cluster model).

### Errors

| Condition | Behavior |
|-----------|----------|
| Invalid or unreachable Postgres credentials / connection | Fail with a connection error (**documented** credential requirements) |
| Missing table name | Fail or auto-create the table; docs state the table is created if missing, so a missing table is not an error (**documented**) |
| `contextWindowLength` missing / non-positive | Use a sensible default or fail; not documented (**gap** — OpenFlow: treat ≤0 as "no prior context" / window of 0) |
| Duplicate Postgres Chat Memory nodes sharing a session | Both access the same memory instance; be careful with destructive overrides (**documented**) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `sessionId` may be an expression (`={{ … }}`), e.g. `={{ $json.sessionId }}`
  (**inferred** from sub-node conventions; sibling memory nodes do so).
- Sub-node rule: multi-item expressions always use the **first** item
  (**documented**).
- `tableName` and `contextWindowLength` may be expressions (**inferred** from
  sibling sub-node conventions).

## Acceptance tests

### Test: wire shape — session key + table + window

**Parameters:**

```json
{
  "sessionId": "my_chat_session",
  "tableName": "chat_history",
  "contextWindowLength": 5
}
```

**Credentials:** `postgres` pointing at a reachable database.

**Cluster:** connect this node's `ai_memory` → AI Agent `ai_memory`.

**Expect:** parent can load/save turns for session `my_chat_session` in table
`chat_history`; loads return at most the last 5 interactions (**documented**
params + window).

### Test: table auto-created when missing

**Given** a Postgres database with no `chat_history` table, node configured with
`tableName: "chat_history"` and a `postgres` credential with rights to create
tables.

**Expect:** the first memory write succeeds and creates the table automatically
(**documented** "The system will create the table if it doesn't exist").

### Test: durable persistence across executions

**Given** the store for session `sess` holds `[u1/a1]`, `contextWindowLength`
`5`, and the workflow completes a run with user `u2` → assistant `a2`, then the
workflow re-executes (same session, same table).

**Expect:** the second execution's load returns `[u1/a1, u2/a2]` — history
persisted in Postgres, not lost between runs (**documented** Postgres-as-memory
persistence).

### Test: window truncates to last N interactions

**Given** the store for `sess` holds 4 interactions
(`[u1/a1, u2/a2, u3/a3, u4/a4]`) and `contextWindowLength` is `2`.

**Expect:** a load returns only the last 2 interactions
(`[u3/a3, u4/a4]`), oldest-first (**documented** window semantics).

### Test: separate sessions stay isolated

**Given** two Postgres Chat Memory nodes in the same workflow, one with
`sessionId: "a"`, one with `sessionId: "b"`, each `contextWindowLength: 5`, same
`tableName`.

**Expect:** turns saved under `a` are **not** returned by a load on `b`, and
vice-versa (**documented** "set different session IDs … for more than one memory
instance").

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Session Key, Table Name, Context Window Length | documented | Primary docs page |
| `sessionId` wire name | inferred | camelCase from UI label "Session Key"; matches sibling Simple Memory node |
| `tableName` wire name | inferred | camelCase from UI label "Table Name" |
| `contextWindowLength` wire name | inferred | camelCase from UI label "Context Window Length"; matches sibling Simple Memory node |
| Postgres credentials required | documented | Credentials page lists Postgres Chat Memory as a consumer |
| Table auto-created if missing | documented | Explicit on primary page |
| Durable persistence across executions | documented | Postgres is the backing store |
| Single shared instance by default; distinct sessions via different sessionId | documented | Primary page |
| Sub-node first-item expression rule | documented | Parameter-resolution hint on primary page |
| Agents can use memory; chains can't | documented | integrate-ai / memory footnote |
| "interaction" = user+assistant turn pair | inferred | "interactions" wording + related LangChain Postgres Chat Message History docs |
| sessionId auto-retrieved from Chat Trigger | inferred | Sibling memory sub-nodes do this; not stated on this page |
| Load/save handle call sites | inferred / OpenFlow contract | Docs describe behavior, not the exact interface; parent prepends on first invoke (in-repo agent contract) |
| Exact table schema | gap | Not documented; must satisfy load/save behavior only |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster sub-nodes)
- **Executor file:** `src/lib/engine/executors/memory-postgres-chat.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.memoryPostgresChat` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a memory handle on
  `ai_memory` backed by a Postgres table (`tableName`, auto-created) keyed by
  `sessionId`, windowed to `contextWindowLength` interactions; resolve
  `sessionId` from the param or the Chat Trigger's `sessionId`; use a Postgres
  client with the `postgres` credential fields (host, port, database, user,
  password, SSL, ignore SSL issues, optional SSH tunnel). Do **not** load
  `@n8n/nodes-langchain` packages.
