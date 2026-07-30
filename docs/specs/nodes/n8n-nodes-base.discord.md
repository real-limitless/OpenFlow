---
type: n8n-nodes-base.discord
displayName: Discord
category: Communication
versions: [1, 2]
priority: high
status: specced
---

# Discord

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discord/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/discord/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.discord`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `discordOAuth2Api`, `discordBotApi`, `discordWebhookApi`
- **Categories:** `Communication`, `HITL`
- **Subcategories:** `HITL` → `Human in the Loop`
- **Versions:** `1`, `2`

## Parameters

### Common (all resources)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | `options` | `message` | yes | – | `channel`, `message`, `member` |
| `operation` | `options` | – | yes | `resource` | see resource sections |

### Resource: `channel`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | `options` | – | yes | `resource:channel` | `create`, `delete`, `get`, `getAll`, `update` |
| `channelId` | `string` | – | `operation!==create` | `resource:channel` | Channel ID (snowflake) |
| `name` | `string` | – | `operation===create` | `resource:channel` | Channel name |
| `type` | `options` | `0` | `operation===create` | `resource:channel` | `0=GUILD_TEXT`, `2=GUILD_VOICE`, `4=GUILD_CATEGORY`, `5=GUILD_ANNOUNCEMENT`, `13=GUILD_STAGE_VOICE`, `15=GUILD_FORUM`, `16=GUILD_MEDIA` |
| `parentId` | `string` | – | `operation===create` | `resource:channel` | Parent category ID |
| `options` | `collection` | – | `operation===create\|update` | `resource:channel` | Channel options (topic, categoryId, rate_limit_per_user, user_limit, nsfw, bitrate, position, permissionOverwrites) |

**Channel Options (under `options` collection):**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `topic` | `string` | – | `operation===create\|update` | `resource:channel` | Channel topic (0-1024 chars) |
| `categoryId` | `string` | – | `operation===create\|update` | `resource:channel` | Parent category ID |
| `rate_limit_per_user` | `number` | `0` | `type!==2\|13\|4` | `resource:channel` | Slowmode (0-21600s) |
| `user_limit` | `number` | `0` | `type===2\|13` | `resource:channel` | Max users (0=unlimited) |
| `nsfw` | `boolean` | `false` | `operation===create\|update` | `resource:channel` | Age-restricted channel |
| `bitrate` | `number` | – | `type===2\|13` | `resource:channel` | Voice bitrate (1000–384000) |
| `position` | `number` | – | `operation===create\|update` | `resource:channel` | Channel position |
| `permissionOverwrites` | `collection` | – | `operation===create\|update` | `resource:channel` | Permission overwrites (role/user + allow/deny) |

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `returnAll` | `boolean` | `false` | `operation===getAll` | `resource:channel` | Return all channels |
| `limit` | `number` | `50` | `operation===getAll` | `resource:channel` | Max channels to return |

### Resource: `message`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | `options` | – | yes | `resource:message` | `send`, `sendAndWait`, `get`, `getAll`, `deleteMessage`, `react` |
| `channelId` | `string` | – | yes | `resource:message` | Channel ID (snowflake) |
| `messageId` | `string` | – | `operation!==send\|sendAndWait` | `resource:message` | Message ID (snowflake) |
| `content` | `string` | – | `operation===send\|sendAndWait` | `resource:message` | Message content (max 2000 chars) |
| `embeds` | `collection` | – | `operation===send\|sendAndWait` | `resource:message` | Rich embeds (title, description, url, color, timestamp, footer, image, thumbnail, author, fields[]) |
| `files` | `collection` | – | `operation===send\|sendAndWait` | `resource:message` | Binary file attachments; `inputFieldName` specifies binary property name |
| `tts` | `boolean` | `false` | `operation===send\|sendAndWait` | `resource:message` | Text-to-speech |
| `allowedMentions` | `collection` | – | `operation===send\|sendAndWait` | `resource:message` | Mention parsing (parse=[roles,users,everyone], roles[], users[], repliedUser) |
| `components` | `collection` | – | `operation===send\|sendAndWait` | `resource:message` | Discord components (buttons, select menus, action rows) |
| `flags` | `number` | – | `operation===send\|sendAndWait` | `resource:message` | Message flags (1=suppress_embeds, etc.) |
| `emoji` | `string` | – | `operation===react` | `resource:message` | Unicode emoji or custom emoji id:name |
| `limit` | `number` | `50` | `operation===getAll` | `resource:message` | Max messages (1-100) |
| `before` | `string` | – | `operation===getAll` | `resource:message` | Get messages before this message ID |
| `after` | `string` | – | `operation===getAll` | `resource:message` | Get messages after this message ID |
| `around` | `string` | – | `operation===getAll` | `resource:message` | Get messages around this message ID |

#### Send and Wait for Response (operation: `sendAndWait`)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `responseType` | `options` | `approval` | yes | `operation:sendAndWait` | `approval`, `freeText`, `customForm` |
| `waitTime` | `number` | `0` | no | `operation:sendAndWait` | Timeout in seconds (0 = no timeout) |
| `appendAttribution` | `boolean` | `true` | no | `operation:sendAndWait` | Append "Sent via n8n" attribution |
| `approvalButtons` | `options` | `both` | `responseType===approval` | `operation:sendAndWait` | `approveOnly`, `both` |
| `approveLabel` | `string` | `Approve` | `responseType===approval` | `operation:sendAndWait` | Approve button label |
| `disapproveLabel` | `string` | `Disapprove` | `responseType===approval` | `operation:sendAndWait` | Disapprove button label |
| `buttonLabel` | `string` | `Submit` | `responseType===freeText` | `operation:sendAndWait` | Submit button label |
| `formTitle` | `string` | – | `responseType===freeText\|customForm` | `operation:sendAndWait` | Form title |
| `formDescription` | `string` | – | `responseType===freeText\|customForm` | `operation:sendAndWait` | Form description |
| `formFields` | `collection` | – | `responseType===customForm` | `operation:sendAndWait` | Form fields (type, label, required, options[], placeholder, etc.) |

### Resource: `member`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | `options` | – | yes | `resource:member` | `getAll`, `roleAdd`, `roleRemove` |
| `guildId` | `string` | – | yes | `resource:member` | Guild (server) ID (snowflake) |
| `userId` | `string` | – | `operation===roleAdd\|roleRemove` | `resource:member` | User ID (snowflake) |
| `role` | `multiOptions` | – | `operation===roleAdd\|roleRemove` | `resource:member` | Role IDs (multi-select) |
| `returnAll` | `boolean` | `false` | `operation===getAll` | `resource:member` | Return all members |
| `limit` | `number` | `50` | `operation===getAll` | `resource:member` | Max members to return (1-1000) |
| `after` | `string` | – | `operation===getAll` | `resource:member` | Get members after this user ID |

### Authentication: `webhook` (version 1 only)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | `options` | `sendLegacy` | yes | `authentication:webhook` | `sendLegacy` |
| `content` | `string` | – | yes | `operation:sendLegacy` | Message content (max 2000 chars) |
| `options` | `collection` | – | `operation:sendLegacy` | Webhook options (avatar_url, flags, tts, username, wait) |
| `embeds` | `collection` | – | `operation:sendLegacy` | Embeds |
| `files` | `collection` | – | `operation:sendLegacy` | Files with `inputFieldName` |

## Runtime behavior

### Input

- **All operations:** Accepts `main` input items (typically workflow data). Input items are passed through and merged with node output.
- **Send/SendAndWait:** Uses input item's binary data for attachments if `files` parameter references binary property via `inputFieldName`.

### Output

| output index | description |
|--------------|-------------|
| `0` | Single item per input item. Returns Discord API response object for the operation. |

**Output shapes by operation:**

- **Channel Create/Get/Update:** Returns channel object (id, type, name, guild_id, position, permission_overwrites, etc.)
- **Channel Delete:** Returns `{ success: true, id, type, name, guild_id }`
- **Channel GetAll:** Returns one item per channel (array of channel objects)
- **Message Send:** Returns message object (id, channel_id, content, embeds, attachments, author, timestamp, etc.)
- **Message SendAndWait:** Returns `{ approved: boolean }` (approval) or `{ data: { [field: string]: any } }` (form)
- **Message Get/GetAll:** Returns one item per message (array of message objects with full Discord message structure)
- **Message Delete:** Returns `{ success: true, id, channel_id }`
- **Message React:** Returns empty on success
- **Member GetAll:** Returns one item per member (array of member objects)
- **Member RoleAdd/RoleRemove:** Returns `{ success: true }`

### Errors

- **Authentication errors** (401/403): Throws `NodeApiError` with credential guidance; respects `continueOnFail`
- **Rate limiting** (429): Honors `Retry-After` header, retries with exponential backoff (max 3 retries)
- **Not found** (404): Throws on `get`/`delete` operations; returns empty array on `getAll` if not found
- **Validation errors** (400): Throws with Discord API error details; respects `continueOnFail`
- **Missing permissions** (403): Throws with Discord permission error; respects `continueOnFail`
- **Timeout** (`sendAndWait`): Returns `{ approved: false }` or `{ timedOut: true }` when `waitTime` expires; does not throw

### Expressions

Expression strings (`={{ }}`) are supported in all string/number/boolean parameters except:
- `resource`, `operation`, `responseType`, `approvalButtons` (dropdowns)
- `channelId`, `guildId`, `messageId`, `userId`, `role` (can use expressions)
- `files`, `embeds`, `components`, `formFields`, `permissionOverwrites` (collection/array, expressions in child fields)

### Webhooks (sendAndWait)

- Node v2 registers a webhook endpoint for `sendAndWait` responses
- Webhook path: `/webhook/discord/wait/:workflowId/:executionId/:nodeId`
- Waits for Discord interaction callback (button click, form submit)
- Resumes workflow execution with response data
- Webhook auto-cleanup after workflow execution completes

## Acceptance tests

### Test: Channel create (text channel)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "create",
  "name": "test-channel",
  "type": 0
}
```

**Expect** output[0] (shape):
```json
[{
  "json": {
    "id": "123456789012345678",
    "type": 0,
    "name": "test-channel",
    "guild_id": "123456789012345678",
    "position": 0,
    "permission_overwrites": []
  }
}]
```

---

### Test: Message send (simple text)

**Given** input items:
```json
[{ "json": { "content": "Hello from n8n!" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "send",
  "channelId": "123456789012345678",
  "content": "={{ $json.content }}"
}
```

**Expect** output[0] (shape):
```json
[{
  "json": {
    "id": "987654321098765432",
    "channel_id": "123456789012345678",
    "content": "Hello from n8n!",
    "author": { "id": "123456789012345678", "username": "MyBot", "bot": true },
    "timestamp": "2024-01-01T00:00:00.000Z",
    "embeds": [],
    "attachments": []
  }
}]
```

---

### Test: Message send and wait (approval)

**Given** input items:
```json
[{ "json": { "message": "Please approve this deployment" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "sendAndWait",
  "channelId": "123456789012345678",
  "content": "={{ $json.message }}",
  "responseType": "approval",
  "approvalButtons": "both",
  "approveLabel": "Deploy",
  "disapproveLabel": "Cancel",
  "waitTime": 300
}
```

**Expect** output[0] on approve:
```json
[{
  "json": { "approved": true }
}]
```

**Expect** output[0] on timeout:
```json
[{
  "json": { "approved": false, "timedOut": true }
}]
```

---

### Test: Message get many

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "getAll",
  "channelId": "123456789012345678",
  "limit": 25
}
```

**Expect** output[0] (shape - one item per message):
```json
[{
  "json": {
    "id": "987654321098765432",
    "channel_id": "123456789012345678",
    "content": "Hello world",
    "author": { "id": "111111111111111111", "username": "User", "discriminator": "1234" },
    "timestamp": "2024-01-01T12:00:00.000Z",
    "embeds": [],
    "attachments": []
  }
}]
```

---

### Test: Member role add

**Given** input items:
```json
[{ "json": { "userId": "111111111111111111" } }]
```

**Parameters:**
```json
{
  "resource": "member",
  "operation": "roleAdd",
  "guildId": "123456789012345678",
  "userId": "={{ $json.userId }}",
  "role": ["987654321098765432"]
}
```

**Expect** output[0]:
```json
[{
  "json": { "success": true }
}]
```

---

### Test: Message send with embed and attachment (binary)

**Given** input items with binary `file`:
```json
[{ "json": { "caption": "Report attached" }, "binary": { "file": { "data": "base64...", "mimeType": "application/pdf" } } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "send",
  "channelId": "123456789012345678",
  "content": "={{ $json.caption }}",
  "embeds": [{ "title": "Report", "description": "Monthly report", "color": 5814783 }],
  "files": [{ "inputFieldName": "file" }]
}
```

**Expect** output[0] (shape):
```json
[{
  "json": {
    "id": "987654321098765432",
    "channel_id": "123456789012345678",
    "content": "Report attached",
    "embeds": [{ "title": "Report", "description": "Monthly report", "color": 5814783 }],
    "attachments": [{ "filename": "report.pdf", "size": 12345, "url": "https://cdn.discordapp.com/..." }]
  }
}]
```

---

## Gaps / confidence

| Topic | Documented / Inferred | Notes |
|-------|----------------------|-------|
| Credential types (OAuth2, Bot, Webhook) | documented | n8n docs list three credential types |
| Channel permission overwrite structure | inferred | Collection with id, type (role/user), allow, deny bitfields |
| Embed field limits (25 fields, 256 chars name, 1024 chars value) | inferred | Per Discord API limits |
| Component structure (action rows, buttons, select menus) | inferred | Discord components v2 schema |
| Form field types in sendAndWait customForm | inferred | Mirrors n8n Form Trigger field types |
| Webhook path format for sendAndWait | inferred | `/webhook/discord/wait/:workflowId/:executionId/:nodeId` |
| Rate limit retry behavior | inferred | n8n core handles 429 with Retry-After |
| Member getAll pagination (after param) | inferred | Discord API uses `after` for pagination |

## OpenFlow mapping

- **Definition group:** `core` (Communication/HITL node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.discord.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credentials:** `discordOAuth2Api`, `discordBotApi`, `discordWebhookApi` (map to OpenFlow credential types)
- **Definition alias group:** `communication` + `hitl`

---

*Generated by OpenFlow clean-room SPEC agent. Sources: n8n public docs + npm package descriptors under /tmp isolation.*