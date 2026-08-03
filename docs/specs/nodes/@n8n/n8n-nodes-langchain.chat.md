---
type: @n8n/n8n-nodes-langchain.chat
displayName: Chat
category: Input
versions: [1, 1.1, 1.2, 1.3]
priority: high
status: specced
---

# Chat

Human-in-the-loop node that sends messages to a chat interface and optionally waits for a user response. Works with the Chat Trigger node in Hosted Chat mode. Also usable as an AI tool for human review steps.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chat.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.chat`
- **Aliases:** `chat`
- **Inputs:** `main` × 1; optional `ai_memory` × 1 (when memory connection enabled)
- **Outputs:** `main` × 1
- **Credentials:** None (uses Chat Trigger node's connection)
- **Webhook:** Uses send-and-wait webhook mechanism for response waiting

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `send` | no | `@version >= 1.1` | `send` = Send Message; `sendAndWait` = Send and Wait for Response |
| message | string | `''` | yes | — | Message text to send to chat |
| responseType | options | `freeText` | no | `operation = sendAndWait` | `freeText` = Free Text; `approval` = Approval |
| approvalType | options | `approveAndDisapprove` | no | `responseType = approval` | `approveOnly` or `approveAndDisapprove` |
| approveButtonLabel | string | `Approve` | no | `responseType = approval` | Custom label for approve button |
| disapproveButtonLabel | string | `Disapprove` | no | `responseType = approval, approvalType = approveAndDisapprove` | Custom label for disapprove button |
| blockUserInput | boolean | `false` | no | `responseType = approval` | When true, users can only use buttons; when false, users can also type custom messages |
| memoryConnection | boolean | `false` | no | `responseType ≠ approval` | Whether to add `ai_memory` input connection and commit messages to connected memory |
| limitWaitTime.values.limitType | options | — | no | `operation = sendAndWait` | `afterTimeInterval` or `maxDateAndTime` |
| limitWaitTime.values.resumeAmount | number | — | no | `limitType = afterTimeInterval` | Amount of time to wait |
| limitWaitTime.values.resumeUnit | options | — | no | `limitType = afterTimeInterval` | `seconds`, `minutes`, `hours`, `days` |
| limitWaitTime.values.maxDateAndTime | datetime | — | no | `limitType = maxDateAndTime` | Specific date/time to resume |

## Runtime behavior

### Input

Consumes `main` input items (typically one item per execution from upstream). When `memoryConnection` is enabled, also consumes an `ai_memory` connection from a compatible memory node (e.g., Memory Buffer Window, Postgres Chat Memory, etc.).

### Output

Produces one `main` output item per input item.

**Send Message (operation = send):**
- Output item contains the sent message payload
- Execution continues immediately

**Send and Wait for Response (operation = sendAndWait):**
- Execution pauses and waits for user response via Chat Trigger webhook
- On resume, output item contains:
  - For Free Text: `json.chatInput` with user's typed response
  - For Approval: `json.data.approved` (boolean) and optionally `json.data.responseText` when user typed custom message (if `blockUserInput = false`)
- If wait times out (limitWaitTime configured), execution resumes with timeout indication

### Errors

**Configuration errors (always throw, never caught by `continueOnFail`):**
- No Chat Trigger node found in workflow
- Chat Trigger mode is "Embedded" (must be "Hosted Chat")
- Chat Trigger Response Mode is not "Using Response Nodes"
- Node invoked as tool/sub-agent/sub-workflow (detected via execution context, not parameters)
- `sendAndWait` operation used without a connected webhook (sendAndWait wait signal missing)

**Runtime errors (honor `ctx.continueOnFail()`):**
- Webhook timeout or network issues
- Memory connection failures
- Invalid response payload from webhook
- Memory handle resolution fails when `memoryConnection = true` and no connected memory/handle found

### Expressions

All string parameters (`message`, button labels) support expression syntax. The `limitWaitTime` options support expressions for dynamic timeout values.

### Memory integration

When `memoryConnection = true`:
- On execute (send): Commits the assistant message (from `message` parameter) to connected memory via `ai_memory` port
- On webhook resume: Commits the user message (from `chatInput` or `responseText`) to connected memory
- **Connection scanning:** Scans workflow connections for an incoming edge where the source node outputs `ai_memory` type (matches Memory Manager node behavior)
- **Handle resolution:** Resolves the memory handle via the connected memory node's executor (via `getNodeInputItems(source)` or running the memory executor)
- **Commit behavior:** Calls `appendTurn(userMessage, assistantMessage)` on the resolved memory handle
- **Error behavior:** If `memoryConnection = true` and no connected memory/handle is found, throws a runtime error (no silent return)

### AI tool usage

When used as an AI tool:
- Input connection is not used (tool context provides data)
- `memoryConnection` option is hidden
- `blockUserInput` behavior applies to human review of tool calls
- Returns structured response to agent (approved/disapproved with optional custom message)

### Runtime error handling (`handleRuntimeError`)

- For runtime errors (not configuration errors): If `ctx.continueOnFail()` returns true, returns error items mapped as `[{ json: { ...item.json, error: message }, pairedItem }]` — never throws the item array
- Configuration errors (missing Chat Trigger, wrong Response Mode, Embedded mode, tool/parentTool context, sendAndWait wait signal) always throw outside this path

## Acceptance tests

### Test: Send Message basic

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "operation": "send", "message": "Hello from workflow!" }
```

**Expect** output[0]:
```json
[{ "json": { "sendMessage": "Hello from workflow!" } }]
```

---

### Test: Send and Wait - Free Text response

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "operation": "sendAndWait", "message": "What is your name?", "responseType": "freeText" }
```

**Webhook resume payload:**
```json
{ "chatInput": "John Doe" }
```

**Expect** output[0]:
```json
[{ "json": { "chatInput": "John Doe" } }]
```

---

### Test: Send and Wait - Approval with approve

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "operation": "sendAndWait", "message": "Approve this?", "responseType": "approval", "approvalType": "approveAndDisapprove" }
```

**Webhook resume payload (user clicked Approve):**
```json
{ "data": { "approved": true } }
```

**Expect** output[0]:
```json
[{ "json": { "data": { "approved": true } } }]
```

---

### Test: Send and Wait - Approval with custom text (blockUserInput = false)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "operation": "sendAndWait", "message": "Approve?", "responseType": "approval", "blockUserInput": false }
```

**Webhook resume payload (user typed custom response):**
```json
{ "data": { "approved": false, "responseText": "Need more info" } }
```

**Expect** output[0]:
```json
[{ "json": { "data": { "approved": false, "responseText": "Need more info" } } }]
```

---

### Test: Memory connection commits messages

**Given** workflow with Chat Trigger (Hosted Chat, Response Mode = Using Response Nodes) → Chat node (memoryConnection = true) → Memory Buffer Window node connected on `ai_memory` port

**Execute** Chat node with `message: "Assistant response"`

**Webhook resume** with `chatInput: "User reply"`

**Expect** memory node contains both messages in order: user message first, then assistant message

---

### Test: Config error - missing Chat Trigger

**Given** workflow without Chat Trigger node

**Execute** Chat node

**Expect** throws configuration error: "Workflow must be started from a chat trigger node"

---

### Test: Config error - Embedded mode not supported

**Given** workflow with Chat Trigger in Embedded mode

**Execute** Chat node

**Expect** throws configuration error about Embedded mode not supported

---

### Test: Config error - wrong Response Mode

**Given** workflow with Chat Trigger Response Mode ≠ "Using Response Nodes"

**Execute** Chat node

**Expect** throws configuration error about Response Mode

---

### Test: continueOnFail honored for runtime error

**Given** Chat node with `continueOnFail = true`, webhook times out

**Execute** Chat node

**Expect** returns error item instead of throwing

---

### Test: Tool context rejection

**Given** Chat node invoked as tool of AI Agent sub-workflow

**Execute** Chat node

**Expect** throws configuration error about tool/sub-agent context not supported

---

### Test: Memory connection missing throws runtime error

**Given** Chat node with `memoryConnection = true` but no memory node connected on `ai_memory` port

**Execute** Chat node

**Expect** throws runtime error (not silent return)

---

### Test: continueOnFail returns error items for memory failure

**Given** Chat node with `continueOnFail = true` and `memoryConnection = true` but no memory node connected

**Execute** Chat node

**Expect** returns error item (not throw)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core operations (send, sendAndWait) | documented | Public docs explicitly describe both |
| Response types (freeText, approval) | documented | Public docs detail both types and their options |
| Approval button customization | documented | Public docs show approve/disapprove labels |
| blockUserInput behavior | documented | Public docs explain enabled/disabled behavior |
| Limit wait time (interval + absolute) | documented | Public docs describe both timeout modes |
| Memory connection | documented | Public docs mention "Add Memory Input Connection" option |
| AI tool usage | documented | Public docs note "This node can be used as an AI tool" |
| Embedded mode restriction | documented | Public docs explicitly warn |
| Config error conditions | inferred | Derived from corpus implementation; config errors always throw |
| Tool/sub-agent context rejection | inferred | From prior failure hints; detected via execution context |
| Exact webhook payload shapes | inferred | From corpus onMessage handler; abstracted to outcome level |
| Memory commit order (user then assistant) | inferred | From corpus execute/onMessage sequence |
| Version-specific parameter differences | inferred | v1.1+ uses operation; v1 uses waitForReply toggle |
| Connection scanning for ai_memory | inferred | From corpus memoryManager.findConnectedMemoryNode |
| Handle resolution via memory executor | inferred | From corpus getNodeInputItems / executor run |
| Runtime error vs config error distinction | inferred | From prior failure hints |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-langchain.chat.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only