---
type: n8n-nodes-base.telegramHitlTool
displayName: Telegram HITL (Human-in-the-Loop Approval)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Telegram HITL (Human-in-the-Loop Approval)

A synthetic approval-channel node used exclusively within the AI Agent Tools Panel. When a tool connected to this channel is called by the AI, the workflow pauses and sends a Telegram message containing the tool name and proposed parameters to a reviewer (via inline keyboard buttons), who can **Approve** or **Deny** via Telegram inline button callback. Not a standalone node — cannot be added from the node palette.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/telegram.md | Public docs only |
| https://core.telegram.org/bots/api | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.telegramHitlTool`
- **Aliases:** (none)
- **Inputs:** (none — this node is not connected via `main` input/output; it sits in the AI Agent's tools panel)
- **Outputs:** (none — the approval response is passed back to the AI Agent internally)
- **Credentials:** `telegramApi` (bot access token)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `chatId` | string | — | yes | Telegram chat, group, or channel ID (numeric or `@username`) to send the approval request to |
| `message` | string | — | no | Custom message for the reviewer; supports `$tool.name` and `$tool.parameters` expression variables |
| `approveButtonText` | string | `Approve` | no | Text for the approve inline keyboard button |
| `denyButtonText` | string | `Deny` | no | Text for the deny inline keyboard button |

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
2. The workflow pauses execution and sends a Telegram message with an inline keyboard (Approve/Deny buttons) to the configured chat.
3. The human reviewer sees the tool name, proposed parameters, and any custom message.
4. The reviewer taps **Approve** or **Deny** on the Telegram inline keyboard.
5. If approved: the tool executes with the AI-specified input and returns the result to the agent.
6. If denied: the tool call is canceled, the AI is informed of the rejection, and execution continues.

### Telegram API interaction

This node sends a `sendMessage` call with an `InlineKeyboardMarkup` containing one row of two callback-data buttons (Approve / Deny). It listens for the resulting `callback_query` update via the bot's webhook (registered by the Telegram Trigger or the node itself). The callback payload identifies which button was pressed.

### Output

No data is emitted to wire outputs. The approval outcome (approved with tool parameters, or denied) is consumed internally by the AI Agent runtime.

### Errors

- If the Telegram API call fails (invalid bot token, chat not found, bot not a member), approval cannot proceed and the workflow errors.
- If the reviewer does not respond, the workflow remains paused indefinitely (no configurable timeout in the current docs).

### Expressions

The `message` parameter accepts n8n expressions, including `$tool.name`, `$tool.parameters`, and standard workflow expressions.

## Acceptance tests

### Test: Basic approve flow

**Parameters:**
```json
{
  "chatId": "@reviewer_channel",
  "message": "The AI wants to use {{ $tool.name }} with:\n{{ JSON.stringify($tool.parameters, null, 2) }}"
}
```

**Given** an AI Agent calls a tool named "Send Email" with parameters `{ "to": "user@example.com", "subject": "Hello" }`.

**Expect:**
1. A Telegram message is sent to `@reviewer_channel` with the rendered message text and an inline keyboard containing Approve/Deny buttons.
2. The workflow pauses.
3. When the reviewer taps **Approve**, the "Send Email" tool executes with the proposed parameters.
4. The tool result is returned to the AI Agent.

### Test: Deny flow with custom button text

**Parameters:**
```json
{
  "chatId": "123456789",
  "approveButtonText": "Yes, proceed",
  "denyButtonText": "No, stop"
}
```

**Given** an AI Agent calls a tool.

**Expect:**
1. Telegram message shows custom button labels "Yes, proceed" and "No, stop".
2. When the reviewer taps **No, stop**, the tool is not executed.
3. The AI Agent receives a rejection signal and can respond accordingly.

### Test: Message with only $tool name

**Parameters:**
```json
{
  "chatId": "@reviewer_channel",
  "message": "Approve use of {{ $tool.name }}?"
}
```

**Given** an AI Agent calls a tool.

**Expect:**
1. The Telegram message reads "Approve use of [Tool Name]?" with Approve/Deny buttons.
2. Behavior follows the standard approve/deny lifecycle.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Basic approval lifecycle | Documented | Public HITL docs describe the approve/deny flow for all channels generically |
| Telegram chat ID parameter | Documented (Telegram node) | Same `chatId` pattern as the main Telegram node; supports numeric IDs and @usernames |
| `$tool` expression variables | Documented | Public docs list `$tool.name` and `$tool.parameters` |
| Approval timeout | Not documented | May exist as a configuration option but not mentioned in public docs |
| Button labels | Inferred | Same pattern as Slack HITL; exact parameter names inferred from analogous nodes |
| Inline keyboard payload structure | Inferred | Likely uses Telegram `InlineKeyboardMarkup` with callback_data; exact button payload structure not documented for this node |
| Callback webhook mechanism | Inferred | Should register a temporary webhook or reuse existing Telegram Trigger webhook to receive `callback_query` updates |
| Multi-reviewer handling | Not documented | Unclear if multiple reviewers can approve; first response wins assumed |
| Credential type | Documented | Same as Telegram node: `telegramApi` bot access token |

## OpenFlow mapping

| Property | Value |
|----------|-------|
| **Definition group** | `tools` |
| **Executor file** | `src/lib/engine/executors/n8n-nodes-base.telegramHitlTool.ts` |
| **SDK entry point** | `defineNode('n8n-nodes-base.telegramHitlTool', ...)` |
| **Credential alias** | `telegramApi` → `telegramBotToken` |
