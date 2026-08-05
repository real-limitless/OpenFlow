---
type: n8n-nodes-base.discord
displayName: Discord (AI Tool)
category: AI Tool
versions: [1, 2]
priority: high
status: specced
---

# Discord (AI Tool)

A tool variant of the Discord node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Supports **Channel**, **Message**, and **Member** resources against the Discord REST API, with a **Send and Wait for Response** operation that supports human-in-the-loop approval workflows.

The node is usable as an AI tool and also supports human-in-the-loop (HITL) for AI Agent tool calls by pausing and requesting human approval before executing configured tools.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discord/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/discord/ | Public docs only |
| https://discord.com/developers/docs/intro | External API docs |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.discord`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 2 (output[0] = primary result, output[1] = approval/response when using Send and Wait for Response)
- **Credentials:** `discordBotApi` (Bot Token), `discordOAuth2Api` (OAuth2), or `discordWebhookApi` (Webhook URL)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `webhook` | no | `webhook`, `botToken`, or `oAuth2` |

When using `webhook` auth, only the legacy send operation is available. `botToken` and `oAuth2` provide access to all resources.

### Resource selection

The user selects a resource (Channel, Message, Member) which determines available operations.

### Channel operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Server ID, Channel Name, Channel Type (text/voice/...); optional: Category ID, Position, Topic, NSFW, Rate Limit Per User, Permission Overwrites (JSON), Parent ID |
| Delete | Channel ID |
| Get | Channel ID |
| Get Many | Send All, Limit; optional: Guild ID |
| Update | Channel ID; optional: Name, Type, Topic, Position, NSFW, Rate Limit Per User, Permission Overwrites (JSON), Parent ID |

### Message operations

| Operation | Key parameters |
|-----------|----------------|
| Delete | Channel ID, Message ID |
| Get | Channel ID, Message ID |
| Get Many | Channel ID, Limit |
| React with Emoji | Channel ID, Message ID, Emoji (URL-encoded Unicode emoji or custom emoji name) |
| Send | Channel ID, Text (max 2000 chars via webhook); optional: Username, Avatar URL, TTS, Embeds (JSON), Allowed Mentions (JSON), Attachments (JSON), Components (JSON), Flags (bitfield), JSON Payload |
| Send and Wait for Response | Channel ID, Message Text; Response Type (Approval / Free Text / Custom Form); Limit Wait Time, Append n8n Attribution |

### Member operations

| Operation | Key parameters |
|-----------|----------------|
| Get Many | Guild ID; optional: Limit, After (user ID cursor) |
| Role Add | Guild ID, User ID, Role ID |
| Role Remove | Guild ID, User ID, Role ID |

### Send and Wait for Response details

When using **Send and Wait for Response**, the node sends a message and pauses the workflow until the user responds. Three response types:

- **Approval**: Presents approve/disapprove buttons (customizable labels); optionally show only the approval button.
- **Free Text**: Users can submit a response with a form; custom button label, form title, form description, and response button label.
- **Custom Form**: Build a custom form (see n8n Form trigger form elements); custom message button label, form title, form description, and response button label.

Options:
- **Limit Wait Time**: Auto-resume after a time limit (interval or wall time).
- **Append n8n Attribution**: Mention the message was sent automatically with n8n.

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions.
- Channel/Guild resource locators are backed by load-options methods that query the Discord API.
- The `payloadJson` parameter allows sending a raw JSON payload directly to the Discord API, bypassing other parameters.
- Binary file handling is supported through the `Attachments` JSON parameter or, in webhook-only legacy mode, through binary input data.

## Runtime behavior

### Input

Consumes items from `main` input. For send operations, the text content can be supplied via expressions or AI-populated parameters.

### Output

**Output[0]** — primary result:
- Channel, Message, or Member data returned from the Discord REST API.
- List operations (`getMany`) return arrays of objects; single-item operations return the object.
- Send operations return the created message object.

**Output[1]** — approval response (only for Send and Wait for Response):
- Contains the user's response data when the workflow resumes after human interaction.

### Errors

- API errors (auth failures, rate limits, invalid IDs, missing permissions) propagate as node errors.
- `continueOnFail` allows the workflow to proceed on error.
- The 2000-character message limit applies to webhook-based sends; bot-token sends support longer messages through the text parameter.

### Expressions

Parameters tagged as AI-populatable accept expression strings including `$fromAI()`. All string fields accept standard n8n expressions. Resource locator fields (Channel ID, Guild ID, User ID, Role ID) accept expressions that resolve to valid Discord snowflake IDs.

## Acceptance tests

### Test: Send a text message via webhook

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "authentication": "webhook",
  "operation": "send",
  "webhookUri": "https://discord.com/api/webhooks/123456/ABCdef",
  "text": "Hello from n8n workflow"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "123456789012345678",
    "channel_id": "987654321",
    "content": "Hello from n8n workflow",
    "author": { "id": "12345", "username": "webhook-name" },
    "timestamp": "2026-01-01T00:00:00.000000+00:00",
    "type": 0,
    "flags": 0
  }
}]
```

### Test: Get messages from a channel

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "authentication": "botToken",
  "resource": "message",
  "operation": "getMany",
  "channelId": "987654321",
  "limit": 10
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "1111111111",
    "channel_id": "987654321",
    "content": "First message",
    "author": { "id": "111", "username": "user1" },
    "timestamp": "2026-01-01T00:00:00.000000+00:00"
  }
},
{
  "json": {
    "id": "2222222222",
    "channel_id": "987654321",
    "content": "Second message",
    "author": { "id": "222", "username": "user2" },
    "timestamp": "2026-01-01T00:00:01.000000+00:00"
  }
}]
```
Array length ≤ 10; each item has `id`, `channel_id`, `content`, `author`, `timestamp`

### Test: React to a message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "authentication": "botToken",
  "resource": "message",
  "operation": "react",
  "channelId": "987654321",
  "messageId": "1111111111",
  "emoji": "\u2764\uFE0F"
}
```

**Expect** output[0]:
```json
[{
  "json": {}
}]
```
The emoji reaction is added to the target message. The output is an empty object on success.

### Test: Send and Wait for Response (approval)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "authentication": "botToken",
  "resource": "message",
  "operation": "sendAndWait",
  "channelId": "987654321",
  "text": "Approve this action?",
  "responseType": "approval",
  "limitWaitTime": true,
  "limitTime": { "value": 1, "unit": "hours" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "3333333333",
    "channel_id": "987654321",
    "content": "Approve this action?",
    "author": { "id": "bot-id", "username": "my-bot" },
    "timestamp": "2026-01-01T00:00:00.000000+00:00"
  }
}]
```
Workflow pauses. On approval response, output[1] receives the approval data. On timeout, workflow resumes via the `limitWaitTime` expiry.

### Test: Add a role to a member

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "authentication": "botToken",
  "resource": "member",
  "operation": "roleAdd",
  "guildId": "123456789",
  "userId": "555555555",
  "roleId": "666666666"
}
```

**Expect** output[0]:
```json
[{
  "json": {}
}]
```
The role is added to the guild member. The output is an empty object on success.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | High | Public docs enumerate Channel/Message/Member resources and operations; confirmed via `usableAsTool: true` flag |
| Credential types & auth flow | High | Public credential docs cover Webhook, Bot Token, OAuth2 |
| Authentication modes & displayOptions | Medium | Webhook mode restricts to `send`/`sendLegacy`; bot/oAuth2 enable all resources. Behavioral intent captured. |
| Message text limit | High | 2000 chars for webhook (public Discord API limit); bot tokens support up to 4000 chars |
| Send and Wait for Response behavior | High | Public docs describe form types and limit-wait-time customization |
| Binary file upload details | Low | Attachments via JSON parameter (`attachments`) documented; binary field mapping in sendLegacy is inferred from corpus |
| Channel type enum values | Low | Discord API defines standard channel types (GUILD_TEXT=0, DM=1, GUILD_VOICE=2, etc.); not enumerated here |
| Rate limit retry policy | Low | Discord API has rate limits; behavior depends on n8n HTTP client. Not specified in public n8n docs. |
| $fromAI() field coverage | Medium | Node declares `usableAsTool: true`; all string/JSON parameters expected to accept expressions |

**Intentionally excluded from this spec (present in the n8n node but not described at detailed schema level):**
- Exact channel type enum values (UI dropdown options for text/voice/announcement/forum/stage etc.)
- `sendLegacy` operation (webhook-only, deprecated in favor of `send` with authentication modes)
- Exact `permissionOverwrites` JSON schema (Discord API defined)
- Thread operations (available via Discord API but not listed in n8n public docs as of this writing)

## OpenFlow mapping

| Property | Value |
|----------|-------|
| **Definition group** | `tools` |
| **Executor file** | `src/lib/engine/executors/n8n-nodes-base.discordTool.ts` |
| **SDK entry point** | `defineNode('n8n-nodes-base.discord', ...)` |
| **Credential aliases** | `discordBotApi` → `discordBotToken`, `discordWebhookApi` → `discordWebhook`, `discordOAuth2Api` → `discordOAuth2` |
