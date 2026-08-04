---
type: @n8n/n8n-nodes-langchain.chatHitlTool
displayName: Human review (Chat)
category: AI
versions: [1]
priority: medium
status: specced
---

# Human review (Chat)

Specialized sub-node for the AI Agent Tools Panel that provides a human-in-the-loop approval/rejection step using n8n's built-in chat interface. Sits between an AI Agent and one or more tools that require human oversight. When the AI Agent decides to call a gated tool, the workflow pauses, sends an approval request to the chat, and waits for the human reviewer to approve or deny the call. The approved tool call then proceeds, or the AI Agent is informed of the rejection.

Also available as a standalone sub-node type selectable in the "Human review" section of the Tools Panel on an AI Agent node.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chat.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.chatHitlTool`
- **Aliases:** (none)
- **Inputs:** `ai_tool` × N (one per gated tool); `ai_memory` × 1 (optional)
- **Outputs:** `ai_tool` × 1 (passes approved tool calls through to downstream tools)
- **Credentials:** None (uses Chat Trigger's webhook connection)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| message | string | `The AI wants to use \{\{ $tool.name \}\} with params: \{\{ JSON.stringify($tool.parameters, null, 2) \}\}` | no | — | Message sent to reviewer; supports `$tool.name` and `$tool.parameters` expression variables |
| responseType | options | `approval` | no | — | `approval` = Approve/Disapprove buttons; `freeText` = open text input |
| approvalType | options | `approveAndDisapprove` | no | `responseType = approval` | `approveOnly` or `approveAndDisapprove` |
| approveButtonLabel | string | `Approve` | no | `responseType = approval` | Custom label for approve button |
| disapproveButtonLabel | string | `Disapprove` | no | `responseType = approval, approvalType = approveAndDisapprove` | Custom label for disapprove button |
| blockUserInput | boolean | `false` | no | `responseType = approval` | When true, reviewers can only click buttons; when false, can also type custom messages |
| limitWaitTime.values.limitType | options | — | no | — | `afterTimeInterval` or `maxDateAndTime` |
| limitWaitTime.values.resumeAmount | number | — | no | `limitType = afterTimeInterval` | Amount of time to wait |
| limitWaitTime.values.resumeUnit | options | — | no | `limitType = afterTimeInterval` | `seconds`, `minutes`, `hours`, `days` |
| limitWaitTime.values.maxDateAndTime | datetime | — | no | `limitType = maxDateAndTime` | Specific wall-clock resume time |

## Runtime behavior

### Execution model

The `chatHitlTool` node is a special sub-node that connects to the AI Agent's Tool Panel. It does not have a `main` input/output. Instead, tools that require human approval are connected to its `ai_tool` input, and the tool output is forwarded from its `ai_tool` output back to the AI Agent.

When the AI Agent decides to call a gated tool:

1. The workflow pauses and sends the `message` (with `$tool.name` and `$tool.parameters` populated) to the Chat Trigger's hosted chat interface.
2. A human reviewer sees the message with approve/disapprove buttons (or free-text input).
3. If approved: the tool call proceeds to the connected tool, and the tool's response is returned to the AI Agent.
4. If denied: the AI Agent is informed the tool call was rejected (tool call with rejection response, no actual tool execution).

### Output

- **On approval**: The tool call is forwarded to the connected tool on the `ai_tool` output. The tool executes normally, and its result is returned to the AI Agent.
- **On rejection**: A synthetic rejection response is returned to the AI Agent (the tool is not executed). The AI Agent receives information that the call was denied.

### Errors

**Configuration errors (always throw):**
- No Chat Trigger node in the workflow
- Chat Trigger mode is "Embedded" (must be "Hosted Chat")
- Chat Trigger Response Mode is not "Using Response Nodes"

**Runtime errors (honor `continueOnFail`):**
- Webhook timeout
- Chat/webhook connection failure

### Ai tool tool-call interception

The `chatHitlTool` intercepts the AI Agent's tool-call execution for connected tools. The tool call parameters (determined by the AI via `$fromAI()` expressions) are displayed to the human reviewer, who either approves the call (with the AI-specified parameters) or denies it. On denial, the tool is never invoked.

### Expressions

The `message` parameter supports expressions including the special `$tool.name` and `$tool.parameters` variables that are populated dynamically at runtime with the tool name and AI-determined parameter values.

## Acceptance tests

### Test: Approve tool call

**Given** AI Agent with tool requiring human review via chatHitlTool.

**Agent** calls gated tool with parameters `{ "email": "user@example.com" }`.

**Human reviewer** clicks Approve.

**Expect** tool executes with the AI-specified parameters; tool result returned to agent.

---

### Test: Deny tool call

**Given** AI Agent with tool requiring human review via chatHitlTool.

**Agent** calls gated tool.

**Human reviewer** clicks Disapprove.

**Expect** tool is NOT executed; AI Agent receives rejection notification.

---

### Test: Timeout with limitWaitTime

**Given** chatHitlTool with `limitWaitTime` set to 5 minutes.

**Agent** calls gated tool.

**Human reviewer** does not respond within 5 minutes.

**Expect** execution resumes automatically; behavior depends on implementation (either treats as rejection or returns timeout indication).

---

### Test: Custom message with $tool variable

**Given** chatHitlTool with `message: "Approve call to {{ $tool.name }}?"`

**Agent** calls tool named "Send Email".

**Expect** reviewer sees "Approve call to Send Email?" with the AI-determined parameters shown.

---

### Test: Free text response mode

**Given** chatHitlTool with `responseType: "freeText"`.

**Agent** calls gated tool.

**Human reviewer** types "Please modify the parameters first."

**Expect** tool is not executed; reviewer's text is returned to AI Agent as feedback.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core purpose (HITL tool approval via Chat) | documented | Public HITL-for-tools page clearly describes the pattern |
| Parameters (message, buttons, response types) | documented | Inherited from Chat node public docs |
| $tool.name / $tool.parameters variables | documented | Public HITL page documents both properties |
| Wire format (ai_tool in/out) | inferred | Pattern matches other HITL tool nodes (Slack, Telegram) and the Tools Panel architecture |
| Blocking behavior (pause until approval) | documented | Public docs describe workflow pause during review |
| Approval vs rejection responses | documented | Public docs describe approve/deny outcomes |
| Rejection response shape to agent | inferred | Not detailed in public docs; abstracted to outcome level |
| Exact webhook interaction with Chat Trigger | inferred | Same mechanism as Chat node's sendAndWait |
| Timeout behavior on rejection | inferred | Same limitWaitTime pattern as Chat node |

## OpenFlow mapping

- **Definition group:** `AI`
- **Executor file:** `src/lib/engine/executors/@n8n/n8n-nodes-langchain.chatHitlTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
