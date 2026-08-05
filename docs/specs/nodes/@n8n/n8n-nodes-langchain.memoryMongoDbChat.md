---
type: '@n8n/n8n-nodes-langchain.memoryMongoDbChat'
displayName: MongoDB Chat Memory
category: AI
versions: [1]
priority: medium
status: specced
---

# MongoDB Chat Memory

Cluster **sub-node**: provides a durable, MongoDB-backed conversation-memory
handle to a root node (AI Agent) on the `ai_memory` channel. Chat history is
persisted in a MongoDB collection keyed by session, so an agent can continue a
multi-turn conversation across executions without losing prior context.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorymongochat.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mongodb.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://js.langchain.com/docs/integrations/memory/mongodb | Third-party docs (related resource linked from public docs) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.memoryMongoDbChat`
- **Aliases:** (none)
- **Inputs:** none on `main` (sub-node; no main-item pipeline)
- **Outputs:**
  - `ai_memory` × 1 — connects **into** a root node's memory input (cluster
    sub-node channel convention; same channel used by sibling memory sub-nodes)
- **Credentials:** `mongoDb` (documented — MongoDB credentials are used to
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
| collectionName | string | — | yes (effective) | — | **Collection Name** — name of the MongoDB collection that stores chat history. The system creates the collection if it does not exist (**documented**). |
| databaseName | string | — | no | — | **Database Name** — name of the MongoDB database for chat history. If not provided, the database from the credentials is used (**documented**). |
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
3. Backing store: a MongoDB collection (`collectionName` in `databaseName`),
   auto-created when missing, keyed by `sessionId` (**documented**). Storage is
   **durable** — persisted in MongoDB across executions, restarts, and workers.
4. **Database fallback**: when `databaseName` is empty, the database configured
   in the `mongoDb` credentials is used (**documented**).

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

### Single instance by default

If more than one MongoDB Chat Memory node is added to a workflow, **all** nodes
access the same memory instance by default. To keep separate memories, set
different session keys on different memory nodes (**documented**). Destructive
overrides (e.g. the Chat Memory Manager "override all messages" operation)
affect that shared instance (**documented**).

### Output

When used only as a memory sub-node:

- Connection graph output: `ai_memory` → parent.
- No `main`-branch items are produced by this node; the parent incorporates
  loaded turns into its own `main` output (sub-node / cluster model).

### Errors

| Condition | Behavior |
|-----------|----------|
| Invalid or unreachable MongoDB credentials / connection | Fail with a connection error (**documented** credential requirements) |
| Missing collection name | Fail or auto-create the collection; docs state the collection is created if missing, so a missing collection is not an error (**documented**) |
| `contextWindowLength` missing / non-positive | Use a sensible default or fail; not documented (**gap** — OpenFlow: treat ≤0 as "no prior context" / window of 0) |
| Duplicate MongoDB Chat Memory nodes sharing a session | Both access the same memory instance; be careful with destructive overrides (**documented**) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `sessionId` may be an expression (`={{ … }}`), e.g. `={{ $json.sessionId }}`
  (**inferred** from sub-node conventions).
- Sub-node rule: multi-item expressions always use the **first** item
  (**documented**).
- `collectionName`, `databaseName`, and `contextWindowLength` may be
  expressions (**inferred** from sibling sub-node conventions).

## Acceptance tests

### Test: wire shape — session key + collection + database + window

**Parameters:**
```json
{
  "sessionId": "my_chat_session",
  "collectionName": "chat_history",
  "databaseName": "my_app",
  "contextWindowLength": 5
}
```

**Credentials:** `mongoDb` pointing at a reachable MongoDB instance.

**Cluster:** connect this node's `ai_memory` → AI Agent `ai_memory`.

**Expect:** parent can load/save turns for session `my_chat_session` in
collection `chat_history` of database `my_app`; loads return at most the last 5
interactions (**documented** params).

### Test: database falls back to credential database

**Given** node configured with `sessionId: "s1"`, `collectionName: "history"`,
and `databaseName: ""`, and the `mongoDb` credential specifies database `appdb`.

**Expect:** the memory handle reads/writes to the `history` collection in
`appdb` (**documented** "If not provided, the database from credentials will be
used").

### Test: collection auto-created when missing

**Given** a MongoDB instance with no `chat_history` collection, node configured
with `collectionName: "chat_history"` and a `mongoDb` credential with write
permissions.

**Expect:** the first memory write succeeds and creates the collection
automatically (**documented** "The system will create the collection if it
doesn't exist").

### Test: durable persistence across executions

**Given** the store for session `sess` holds `[u1/a1]`, `contextWindowLength`
`5`, and the workflow completes a run with user `u2` → assistant `a2`, then the
workflow re-executes (same session, same collection).

**Expect:** the second execution's load returns `[u1/a1, u2/a2]` — history
persisted in MongoDB, not lost between runs (**documented** MongoDB persistence).

### Test: window truncates to last N interactions

**Given** the store for `sess` holds 4 interactions
(`[u1/a1, u2/a2, u3/a3, u4/a4]`) and `contextWindowLength` is `2`.

**Expect:** a load returns only `[u3/a3, u4/a4]`, oldest-first (**documented**
window semantics).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Session Key, Collection Name, Database Name, Context Window Length | documented | Primary docs page |
| `sessionId` wire name | inferred | camelCase from UI label "Session Key"; matches sibling memory nodes |
| `collectionName` wire name | inferred | camelCase from UI label "Collection Name" |
| `databaseName` wire name | inferred | camelCase from UI label "Database Name" |
| `contextWindowLength` wire name | inferred | camelCase from UI label "Context Window Length"; matches sibling nodes |
| MongoDB credentials required | documented | Credentials page lists MongoDB Chat Memory as a consumer |
| Collection auto-created if missing | documented | Explicit on primary page |
| Database fallback to credential database | documented | "If not provided, the database from credentials will be used" |
| Durable persistence across executions | documented | MongoDB is the backing store |
| Single shared instance by default; distinct sessions via different sessionId | documented | Primary page |
| Sub-node first-item expression rule | documented | Parameter-resolution hint on primary page |
| sessionId auto-retrieved from Chat Trigger | inferred | Sibling memory sub-nodes do this; not stated on this page |
| Load/save handle call sites | inferred / OpenFlow contract | Docs describe behavior, not the exact interface |
| Exact collection/document schema | gap | Not documented; must satisfy load/save behavior only |
| typeVersion behavior deltas | gap | Only v1 observed |
| Context window implementation (trim vs filter) | gap | Behavior described at outcome level only |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster sub-nodes)
- **Executor file:** `src/lib/engine/executors/memory-mongodb-chat.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.memoryMongoDbChat` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a memory handle on
  `ai_memory` backed by a MongoDB collection (`collectionName`, auto-created)
  in `databaseName` (fallback to credential db), keyed by `sessionId`, windowed
  to `contextWindowLength` interactions. Resolve `sessionId` from the param or
  the Chat Trigger's `sessionId`. Use a MongoDB client with the `mongoDb`
  credential fields. Do **not** load `@n8n/n8n-nodes-langchain` packages.
