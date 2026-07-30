---
type: "@n8n/n8n-nodes-langchain.chatTrigger"
displayName: Chat Trigger
category: AI
versions: [1, 1.1, 1.2]
priority: high
status: specced
---

# Chat Trigger

Trigger node for AI chat workflows. Starts a workflow on each incoming chat
message and returns a chat response to the user. Must connect to an agent or
chain **root node** on `main`. Replaces the legacy Manual Chat Trigger node
(from product version 1.24.0).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent.md | Public docs only (`chatInput`, response fields `output` / `text`) |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook.md | Public docs only (response-mode partner) |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chat.md | Public docs only (Chat response node) |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.chatTrigger`
- **Aliases:** (none observed)
- **Inputs:** none (trigger node — starts a workflow on an incoming chat message)
- **Outputs:** `main` × 1
- **AI connections:** `ai_memory` × 0..1 — optional memory sub-node; the memory connector appears when **Load Previous Session** is set to **From Memory** (**documented**). n8n recommends connecting the **same** memory sub-node to both the Chat Trigger and the Agent for a single source of truth (**documented**).
- **Credentials:** optional — Basic Auth credential when `authentication = basicAuth`; otherwise none (**documented**)

### Trigger registration

The node exposes a **Chat URL** (webhook endpoint) that the chat interface calls
on each message (**documented**):

- **Hosted Chat:** n8n's hosted chat interface; no extra setup. Configurable via
  node options (title, subtitle, input placeholder, initial message, button).
- **Embedded Chat:** user supplies a chat interface (n8n `@n8n/chat` widget or
  custom) that POSTs to the Chat URL. Extra data can be passed via a `metadata`
  field in the `createChat` call and appears in the trigger output (**documented**).

Every message executes the workflow once (one execution per message)
(**documented**).

## Parameters

UI labels from **public docs**; wire names **inferred** (camelCase) where docs
give only UI labels — no langchain package source was consulted.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `public` | boolean | `false` | no | — | UI: **Make Chat Publicly Available**. Off → manual chat interface only; on → publish chat for users (**documented**). Wire name **inferred**. |
| `mode` | options | `hosted` | when `public` is true | `public` = true | UI: **Mode**. `hosted` (Hosted Chat) / `embedded` (Embedded Chat) (**documented**). Wire values **inferred**. |
| `authentication` | options | `none` | no | `public` = true | UI: **Authentication**. `none` / `basicAuth` (Basic Auth) / `n8nUserAuth` (n8n User Auth) (**documented**). Wire values **inferred**. |
| `initialMessages` | string | — | no | `public` = true AND `mode` = hosted | UI: **Initial Message(s)**. Message shown when the user arrives (**documented**; Hosted Chat only). Wire name **inferred**. |
| `makeAvailableInChat` | boolean | `false` | no | — | UI: **Make Available in n8n Chat**. Expose agent to Chat Hub (**documented**). Wire name **inferred**. |
| `agentName` | string | — | when `makeAvailableInChat` is true | `makeAvailableInChat` = true | UI: **Agent Name**. Name on Chat Hub (**documented**). Wire name **inferred**. |
| `agentDescription` | string | — | no | `makeAvailableInChat` = true | UI: **Agent description**. Description on Chat Hub (**documented**). Wire name **inferred**. |
| `options` | collection | `{}` | no | — | Nested options below |
| `options.allowedOrigins` | string | `*` | no | — | UI: **Allowed Origin (CORS)**. Comma-separated URLs; `*` allows all (**documented** default). |
| `options.inputPlaceholder` | string | — | no | `mode` = hosted | UI: **Input Placeholder**. Hosted chat only (**documented**). Wire name **inferred**. |
| `options.title` | string | — | no | `mode` = hosted | UI: **Title**. Hosted chat only (**documented**). Wire name **inferred**. |
| `options.subtitle` | string | — | no | `mode` = hosted | UI: **Subtitle**. Hosted chat only (**documented**). Wire name **inferred**. |
| `options.loadPreviousSession` | options | `off` | no | — | UI: **Load Previous Session**. `off` / `fromMemory` (From Memory). When not `off`, connect a memory sub-node on `ai_memory`; the memory connector appears on the trigger (**documented**). Wire values **inferred**. |
| `options.responseMode` | options | `whenLastNode` | no | — | UI: **Response Mode**. `whenLastNode` (When Last Node Finishes) / `responseNodes` (Using Response Nodes) / `streaming` (Streaming response) (**documented** UI labels; wire enum strings **inferred**). `responseNodes` replaces the v1.2 'Using Respond to Webhook Node' mode (**documented**). |
| `options.requireButton` | boolean | `false` | no | `mode` = hosted | UI: **Require Button Click to Start Chat**. Show a "New Conversation" button (**documented**). Wire name **inferred**. |

### Version notes

- v1.2 used **Using Respond to Webhook Node** as the response-mode label; current
  versions call it **Using Response Nodes** (**documented**). The behavior is the
  same: response is defined by a downstream Chat or Respond to Webhook node.
- Version list `[1, 1.1, 1.2]` is **inferred** from the docs' version references;
  exact version count is a gap without the langchain package descriptor.

## Runtime behavior

### Trigger firing

An inbound chat message (HTTP POST to the Chat URL) starts the workflow. The
request is mapped to a single output item whose `json` contains (**documented**
fields + **inferred** field set):

```json
{
  "chatInput": "Hello",
  "sessionId": "abc-123",
  "action": "sendMessage",
  "metadata": {}
}
```

- **`chatInput`** — the user's message text (string) (**documented**; referenced
  by the AI Agent spec as the prompt source for auto/Connected Chat Trigger mode).
- **`sessionId`** — session identifier used to retrieve previous messages
  (**documented**; common-issues references `sessionID` for memory loading).
- **`action`** — the chat action, e.g. `sendMessage` (**inferred**).
- **`metadata`** — arbitrary key-value data passed from an embedded chat interface
  via the `createChat({ metadata })` call; appears alongside other output data
  (**documented**). Absent for hosted chat unless provided.

### Output

One `main` output item per incoming message. Downstream agent/chain root nodes
read `chatInput` as the user prompt when `promptType` is auto / Connected Chat
Trigger Node (**documented** in AI Agent spec).

### Chat response

The response sent back to the user depends on **Response Mode**
(`options.responseMode`) (**documented**):

| Mode | Behavior |
|------|----------|
| `whenLastNode` (When Last Node Finishes) | Chat Trigger returns the response code and the data output from the **last node executed** in the workflow. The chat response text is extracted from the last node's `output` or `text` field (**documented**). |
| `responseNodes` (Using Response Nodes) | Response is defined by a downstream **Chat** node or **Respond to Webhook** node. The Chat Trigger shows only messages from these nodes, not the last node's data (**documented**). Respond to Webhook sends the response via the Chat Service, extracting from `responseBody.output` / `.text` / `.message` (**inferred** from respondToWebhook spec). |
| `streaming` (Streaming response) | Real-time data streaming back to the user as the workflow processes. Requires streaming-capable nodes (e.g. AI Agent with `enableStreaming`) in the workflow (**documented**). |

**Response field extraction** (**documented**): in a basic workflow, the Agent or
Chain node outputs a field named `output` or `text`, and the Chat Trigger sends
that value as the chat response. To customize the response, create a parameter
named `text` or `output` on the last node; a different parameter name causes the
Chat Trigger to send the entire object as the response.

### Memory / session loading

When **Load Previous Session** is not `off` (**documented**):

1. Connect a memory sub-node (e.g. Simple Memory) to the Chat Trigger's `ai_memory`
   connector (appears when set to From Memory).
2. Connect the **same** memory sub-node to the Agent's `ai_memory` connector.
3. In the memory sub-node, set **Session ID** to **Connected Chat Trigger Node**
   (uses the trigger's `sessionId`).
4. The trigger retrieves previous chat messages for the session using `sessionId`
   before the workflow runs.

Mismatched session-ID expressions between trigger and agent memory nodes can cause
`workflow could not be started!` errors (**documented** common issues).

### Authentication

When `public` is true and `authentication` is set (**documented**):

| Auth | Behavior |
|------|----------|
| `none` | No authentication; anyone can use the chat. |
| `basicAuth` | Basic auth; all users share one username/password from the selected Basic Auth credential. |
| `n8nUserAuth` | Only users logged in to an n8n account can use the chat. |

### Errors

| Condition | Behavior |
|-----------|----------|
| No agent or chain root node connected | Invalid configuration — docs require connecting a root node (**documented**) |
| Auth failure (basic auth) | Request rejected (**inferred**; standard auth behavior) |
| Memory session mismatch | `workflow could not be started!` error (**documented**) |
| Empty `chatInput` | Downstream agent errors with "No prompt specified" / invalid content (**documented** in agent spec) |
| `responseMode = responseNodes` but no response node executes | Standard message, HTTP 200 (**inferred** from respondToWebhook workflow-level behavior) |

As a trigger, the node does not consume upstream items and does not surface
`continueOnFail` semantics.

### Expressions

- `initialMessages`, `agentName`, `agentDescription`, and option text fields
  (title, subtitle, input placeholder) may use `{{ … }}` expressions (**inferred**).
- `sessionId` resolution in memory sub-nodes may use expressions; the same
  expression must be compatible across all nodes sharing the memory (**documented**).

## Acceptance tests

### Test: incoming message maps to output item

**Request:** POST to Chat URL with body `{ "chatInput": "Hello", "sessionId": "s1", "action": "sendMessage" }`

**Parameters:**

```json
{
  "public": true,
  "mode": "hosted",
  "options": { "responseMode": "whenLastNode" }
}
```

**Expect** output[0] (shape):

```json
[{ "json": { "chatInput": "Hello", "sessionId": "s1", "action": "sendMessage" } }]
```

### Test: embedded chat metadata appears in output

**Request:** POST to Chat URL with body `{ "chatInput": "Hi", "sessionId": "s2", "metadata": { "userId": "u-42" } }`

**Parameters:**

```json
{
  "public": true,
  "mode": "embedded",
  "options": {}
}
```

**Expect** output[0].json includes `metadata.userId` = `"u-42"` (**documented**).

### Test: response whenLastNode — output field extraction

**Given** the last node in the workflow outputs `{ "json": { "output": "The answer is 42" } }`.

**Parameters:** `options.responseMode` = `whenLastNode`

**Expect** chat response sent to user: `"The answer is 42"` (extracted from `output`
field) (**documented**).

### Test: response whenLastNode — text field fallback

**Given** the last node outputs `{ "json": { "text": "Hello back" } }` (no `output` field).

**Expect** chat response: `"Hello back"` (extracted from `text` field) (**documented**).

### Test: response whenLastNode — unknown field sends whole object

**Given** the last node outputs `{ "json": { "reply": "custom" } }` (neither `output` nor `text`).

**Expect** chat response: the entire object serialized (not just `"custom"`) (**documented**).

### Test: responseNodes mode defers to Chat / Respond to Webhook

**Parameters:** `options.responseMode` = `responseNodes`

**Given** a downstream Respond to Webhook node that sets `responseBody` = `{ "output": "manual response" }`.

**Expect** chat response: `"manual response"` (from the response node, not the last
node's data) (**documented** + **inferred** from respondToWebhook spec).

### Test: memory connector requires loadPreviousSession

**Parameters:** `options.loadPreviousSession` = `off`

**Expect:** no `ai_memory` input connector on the node; memory sub-node cannot
connect (**documented** — connector appears only when set to From Memory).

### Test: no root node connected

**Given** the Chat Trigger has no agent or chain root node connected on `main`.

**Expect:** configuration error — a root node must be connected (**documented**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & trigger role | documented | Chat Trigger for AI workflows |
| Must connect agent/chain root | documented | Docs require a root node |
| `chatInput` output field | documented | Referenced in AI Agent spec + docs |
| `sessionId` output field | documented | Common-issues references sessionID |
| `metadata` output field (embedded) | documented | Common-issues: createChat metadata |
| `action` output field | inferred | Field name not in docs |
| Response modes (3) | documented | whenLastNode / responseNodes / streaming |
| Response field extraction (`output` / `text`) | documented | Docs: "output or text" |
| Unknown field → whole object | documented | Docs: "sends the entire object" |
| `responseNodes` replaces v1.2 mode | documented | Version transition noted |
| Memory connector on `ai_memory` | documented | Appears when Load Previous Session = From Memory |
| Same memory node to trigger + agent | documented | Recommended single source of truth |
| Auth modes (none / basic / n8n user) | documented | UI labels |
| Hosted vs Embedded mode | documented | Chat URL + interface options |
| Wire parameter names | inferred | UI labels only; no langchain descriptor in permitted sources — camelCase inferred |
| `responseMode` wire enum strings | inferred | UI labels documented; exact wire strings not in permitted sources |
| `loadPreviousSession` wire enum strings | inferred | UI labels documented |
| Version list `[1, 1.1, 1.2]` | inferred | v1.2 referenced in docs; exact version count is a gap |
| Streaming wire protocol | partial / deferred | Documented requirement; deferred without SDK streaming hooks |
| CORS default `*` | documented | Allowed Origin default |
| One execution per message | documented | Execution usage warning |
| Replaces Manual Chat Trigger | documented | From product version 1.24.0 |

## OpenFlow mapping

- **Definition group:** `ai` (or `triggers` until an AI group exists)
- **Executor file:** `src/lib/engine/executors/langchain-chat-trigger.ts` (+ server webhook route registration for the Chat URL)
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.chatTrigger` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor registers a webhook endpoint (Chat URL) that starts the workflow on each message; maps the request to a `main` output item with `chatInput` / `sessionId` / `action` / `metadata`; returns the chat response per `responseMode`. Do **not** load `@n8n/n8n-nodes-langchain` packages.
- **Implement priority:** (1) trigger registration + Chat URL + output item shape (`chatInput`/`sessionId`/`action`/`metadata`), (2) `responseMode` whenLastNode with `output`/`text` extraction + whole-object fallback, (3) `responseMode` responseNodes deferral to Chat / Respond to Webhook, (4) `ai_memory` connector gated on `loadPreviousSession`, (5) auth modes, (6) deferred streaming
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-langchain-chat-trigger.test.ts` — cover output item shape, metadata passthrough, response field extraction (output/text/unknown), responseNodes deferral, memory connector gating, no-root-node error