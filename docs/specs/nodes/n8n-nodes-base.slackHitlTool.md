---
type: n8n-nodes-base.slackHitlTool
displayName: Slack HITL (Human-in-the-Loop Approval)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Slack HITL (Human-in-the-Loop Approval)

A synthetic approval-channel node used exclusively within the AI Agent Tools panel. When a tool connected to this channel is called by the AI, the workflow pauses and sends a Slack message containing the tool name and proposed parameters to a reviewer, who can **Approve** or **Deny** via interactive Slack message buttons. Not a standalone node — cannot be added from the node palette.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.slack.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/slack.md | Public docs only |
| https://api.slack.com/methods | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.slackHitlTool`
- **Aliases:** (none)
- **Inputs:** (none — this node is not connected via `main` input/output; it sits in the AI Agent's tools panel)
- **Outputs:** (none — the approval response is passed back to the AI Agent internally)
- **Credentials:** `slackApi` (access token) **or** `slackOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `authentication` | options | `accessToken` | no | `accessToken` or `oAuth2` |
| `channel` | resource-locator | — | yes | Slack channel or DM to send the approval request to |
| `message` | string | — | no | Custom message for the reviewer; supports `$tool.name` and `$tool.parameters` expression variables |
| `approveButtonText` | string | `Approve` | no | Text for the approve action button |
| `denyButtonText` | string | `Deny` | no | Text for the deny action button |

The tool(s) to be reviewed are connected to this node's tool connector in the AI Agent Tools Panel, not via wire inputs.

### The `$tool` expression variable

When constructing the reviewer message, two variables are available:

| Variable | Description |
|----------|-------------|
| `$tool.name` | The display name of the tool the AI is trying to call |
| `$tool.parameters` | The parameters (from `$fromAI()` fields) the AI proposes |

Example: `The AI wants to use {{ $tool.name }} with:\n{{ JSON.stringify($tool.parameters, null, 2) }}`

## Runtime behavior

### Lifecycle

1. The AI Agent determines it needs to call a connected tool that has human review enabled through this channel.
2. The workflow pauses execution and sends an interactive Slack message (with Approve/Deny buttons) to the configured channel.
3. The human reviewer sees the tool name, proposed parameters, and any custom message.
4. The reviewer clicks **Approve** or **Deny** on the Slack message.
5. If approved: the tool executes with the AI-specified input and returns the result to the agent.
6. If denied: the tool call is canceled, the AI is informed of the rejection, and execution continues.

### Slack API interaction

This node sends a chat.postMessage with interactive button attachments and listens for the button interaction callback via Slack's Events API or interactive component response. The callback payload contains the approval decision.

### Output

No data is emitted to wire outputs. The approval outcome (approved with tool parameters, or denied) is consumed internally by the AI Agent runtime.

### Errors

- If the Slack API call fails (auth, channel not found), approval cannot proceed and the workflow errors.
- If the reviewer does not respond, the workflow remains paused indefinitely (no configurable timeout in the current docs).
- If the Slack signing secret verification fails, the callback is rejected.

### Expressions

The `message` parameter accepts n8n expressions, including `$tool.name`, `$tool.parameters`, and standard workflow expressions.

## Acceptance tests

### Test: Basic approve flow

**Parameters:**
```json
{
  "authentication": "accessToken",
  "channel": "C1234567890",
  "message": "The AI wants to use {{ $tool.name }} with:\n{{ JSON.stringify($tool.parameters, null, 2) }}"
}
```

**Given** an AI Agent calls a tool named "Send Email" with parameters `{ "to": "user@example.com", "subject": "Hello" }`.

**Expect:**
1. A Slack message is posted to `C1234567890` with the rendered message text and Approve/Deny buttons.
2. The workflow pauses.
3. When the reviewer clicks **Approve**, the "Send Email" tool executes with the proposed parameters.
4. The tool result is returned to the AI Agent.

### Test: Deny flow

**Parameters:**
```json
{
  "authentication": "accessToken",
  "channel": "C1234567890",
  "approveButtonText": "Yes, proceed",
  "denyButtonText": "No, stop"
}
```

**Given** an AI Agent calls a tool.

**Expect:**
1. Slack message shows custom button labels "Yes, proceed" and "No, stop".
2. When the reviewer clicks **No, stop**, the tool is not executed.
3. The AI Agent receives a rejection signal and can respond accordingly.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Basic approval lifecycle | Documented | Public docs describe the approve/deny flow clearly |
| Slack channel parameter | Documented | Standard Slack resource-locator |
| `$tool` expression variables | Documented | Public docs list `$tool.name` and `$tool.parameters` |
| Approval timeout | Not documented | May exist as a configuration option but not mentioned in public docs |
| Button labels | Inferred | Common pattern in n8n send-and-wait nodes; exact parameter names inferred from analogous wait nodes |
| Exact Slack message format (blocks vs attachments) | Inferred | Likely uses Slack Block Kit interactive components; exact payload shape not documented |
| Multi-reviewer handling | Not documented | Unclear if multiple reviewers can approve; first response wins assumed |
| Callback security (signing secret verification) | Inferred | Standard Slack security practice; described for Slack Trigger node |
| Credential types | Documented | Same as Slack node: access token or OAuth2 |

## OpenFlow mapping

| Property | Value |
|----------|-------|
| **Definition group** | `tools` |
| **Executor file** | `src/lib/engine/executors/n8n-nodes-base.slackHitlTool.ts` |
| **SDK entry point** | `defineNode('n8n-nodes-base.slackHitlTool', ...)` |
| **Credential aliases** | `slackApi` → `slackAccessToken`, `slackOAuth2Api` → `slackOAuth2` |
