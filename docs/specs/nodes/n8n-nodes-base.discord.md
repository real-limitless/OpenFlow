---
type: n8n-nodes-base.discord
displayName: Discord
category: Communication
subcategories:
  - HITL
versions: [1, 2]
priority: medium
status: implemented
---

# Discord

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discord.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/discord/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public docs + public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.discord`
- **Aliases:** `human`, `form`, `wait`, `hitl`, `approval`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:**
  - `discordBotApi` (botToken)
  - `discordOAuth2Api` (oAuth2)
  - `discordWebhookApi` (webhook)

## Parameters

### Version 1 (Webhook only)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| webhookUri | string | '' | true | — | Discord webhook URL (https://discord.com/api/webhooks/ID/TOKEN) |
| text | string | '' | false | — | Message content (max 2000 chars) |
| options.allowedMentions | json | '' | false | — | JSON object for allowed mentions |
| options.attachments | json | '' | false | — | JSON array of attachments |
| options.avatarUrl | string | '' | false | — | Override webhook avatar URL |
| options.components | json | '' | false | — | JSON for Discord message components (buttons, selects) |
| options.embeds | json | '' | false | — | JSON array of embed objects |
| options.flags | number | '' | false | — | Message flags (e.g., 64 = suppress embeds) |
| options.payloadJson | json | '' | false | — | Raw JSON payload (multipart/form-data) |
| options.username | string | '' | false | — | Override webhook username |
| options.tts | boolean | false | false | — | Send as text-to-speech message |

**Validation:** Either `text` or `options.embeds` must be provided. When `payloadJson` is provided, multipart/form-data is used.

### Version 2 (Bot Token / OAuth2 / Webhook)

#### Connection Type

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | 'botToken' | true | — | Options: `botToken`, `oAuth2`, `webhook` |

#### Resource selector (hidden when authentication=webhook)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | 'channel' | true | auth=botToken\|oAuth2 | Options: `channel`, `message`, `member` |

#### Resource: Channel (botToken / oAuth2 only)

##### Server (shared across channel operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| guildId | resourceLocator | {mode:'list',value:''} | true | resource=channel, auth=botToken\|oAuth2 | Modes: By Name (list), By URL, By ID |
| operation | options | 'create' | true | resource=channel, auth=botToken\|oAuth2 | Options: `create`, `deleteChannel`, `get`, `getAll`, `update` |

##### Create Channel

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| name | string | '' | true | resource=channel, operation=create | Channel name |
| type | options | '0' | true | resource=channel, operation=create | Options: `0` (Guild Text), `2` (Guild Voice), `4` (Guild Category) |
| options.nsfw | boolean | false | false | resource=channel, operation=create, hide type='4' | Age-restricted channel |
| options.bitrate | number | 8000 | false | resource=channel, operation=create, show type='2' | Voice bitrate in bits (8000-96000) |
| options.categoryId | resourceLocator | {mode:'list',value:''} | false | resource=channel, operation=create, hide type='4' | Parent category (searchListMethod: categorySearch) |
| options.position | number | 1 | false | resource=channel, operation=create | Position in channel list |
| options.rate_limit_per_user | number | 0 | false | resource=channel, operation=create, hide type='4' | Slowmode in seconds |
| options.topic | string | '' | false | resource=channel, operation=create, hide type='4' | Channel topic (0-1024 chars) |
| options.user_limit | number | 0 | false | resource=channel, operation=create, show type='2' | Max users (0 = no limit, max 99) |

##### Delete Channel

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | resourceLocator | {mode:'list',value:''} | true | resource=channel, operation=deleteChannel | Modes: By Name (channelSearch), By URL, By ID |

##### Get Channel

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | resourceLocator | {mode:'list',value:''} | true | resource=channel, operation=get | Modes: By Name (channelSearch), By URL, By ID |

##### Get Many Channels

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | false | false | resource=channel, operation=getAll | Return all channels or limit |
| limit | number | 50 | false | resource=channel, operation=getAll, show returnAll=false | Max channels to return |
| options.filter | multiOptions | [] | false | resource=channel, operation=getAll | Filter by type: `0` (Guild Text), `2` (Guild Voice), `4` (Guild Category) |

##### Update Channel

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | resourceLocator | {mode:'list',value:''} | true | resource=channel, operation=update | Channel to update |
| name | string | '' | false | resource=channel, operation=update | New name (leave empty to not change) |
| options.nsfw | boolean | false | false | resource=channel, operation=update | Age-restricted flag |
| options.bitrate | number | 8000 | false | resource=channel, operation=update | Voice bitrate (hint: voice channels only) |
| options.categoryId | resourceLocator | {mode:'list',value:''} | false | resource=channel, operation=update | Parent category |
| options.position | number | 1 | false | resource=channel, operation=update | Position |
| options.rate_limit_per_user | number | 0 | false | resource=channel, operation=update | Slowmode |
| options.topic | string | '' | false | resource=channel, operation=update | Topic |
| options.user_limit | number | 0 | false | resource=channel, operation=update | User limit (hint: voice channels only) |

#### Resource: Message

##### Bot Token / OAuth2

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| guildId | resourceLocator | {mode:'list',value:''} | true | resource=message, auth=botToken\|oAuth2 | Server |
| operation | options | 'send' | true | resource=message, auth=botToken\|oAuth2 | Options: `deleteMessage`, `get`, `getAll`, `react`, `send`, `sendAndWait` |

###### Send Message

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| sendTo | options | 'channel' | false | resource=message, operation=send | Options: `user`, `channel` |
| userId | resourceLocator | {mode:'list',value:''} | true | sendTo=user | User selector (searchListMethod: userSearch) |
| channelId | resourceLocator | {mode:'list',value:''} | true | sendTo=channel | Text channel selector (searchListMethod: textChannelSearch) |
| content | string | '' | false | resource=message, operation=send | Message body (up to 2000 chars) |
| embeds | fixedCollection | [] | false | resource=message, operation=send | Embed collection; values have inputMethod=fields\|json; fields: description, author, color, timestamp, title, url, image, thumbnail, video |
| files | fixedCollection | [] | false | resource=message, operation=send | File collection; values have inputFieldName (string, default: 'data') |
| options.flags | multiOptions | [] | false | resource=message, operation=send | `SUPPRESS_EMBEDS`, `SUPPRESS_NOTIFICATIONS` |
| options.message_reference | string | '' | false | resource=message, operation=send | Message ID to reply to |
| options.tts | boolean | false | false | resource=message, operation=send | Text-to-speech |

###### Send and Wait for Response

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| sendTo | options | 'channel' | false | resource=message, operation=sendAndWait | Options: `user`, `channel` |
| userId | resourceLocator | {mode:'list',value:''} | true | sendTo=user | User |
| channelId | resourceLocator | {mode:'list',value:''} | true | sendTo=channel | Text channel |
| content | string | '' | false | resource=message, operation=sendAndWait | Message body |
| responseType | options | 'approval' | true | resource=message, operation=sendAndWait | Options: `approval`, `freeText`, `form` |
| options.approval.approveLabel | string | '✓ Approve' | false | responseType=approval | Custom approve button label |
| options.approval.denyLabel | string | '✗ Decline' | false | responseType=approval | Custom deny button label |
| options.freeText.* | — | — | false | responseType=freeText | Button label, form title, form description, response button label |
| options.form.* | fixedCollection | — | false | responseType=form | Custom form elements (n8n Form trigger element syntax) |
| options.limitWaitTime | boolean | false | false | operation=sendAndWait | Auto-resume after timeout |
| options.waitTime | options | 'interval' | false | limitWaitTime=true | `interval` or `wallTime` |
| options.waitTimeValue | string | '' | false | limitWaitTime=true | ISO duration or ISO datetime |
| options.appendAttribution | boolean | true | false | operation=sendAndWait | Append "Sent via n8n" |
| embeds | fixedCollection | [] | false | resource=message, operation=sendAndWait | Embeds |
| files | fixedCollection | [] | false | resource=message, operation=sendAndWait | Files |

###### Get Message

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | resourceLocator | {mode:'list',value:''} | true | resource=message, operation=get | Channel (searchListMethod: channelSearch) |
| messageId | string | '' | true | resource=message, operation=get | Message ID |
| options.simplify | boolean | true | false | resource=message, operation=get | Return simplified response (id, channel_id, author, content, timestamp, type) |

###### Get Many Messages

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | resourceLocator | {mode:'list',value:''} | true | resource=message, operation=getAll | Channel (searchListMethod: channelSearch) |
| returnAll | boolean | false | false | resource=message, operation=getAll | Return all or limit |
| limit | number | 50 | false | resource=message, operation=getAll, show returnAll=false | Max messages |
| options.simplify | boolean | true | false | resource=message, operation=getAll | Simplify response |

###### React with Emoji

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | resourceLocator | {mode:'list',value:''} | true | resource=message, operation=react | Channel (searchListMethod: channelSearch) |
| messageId | string | '' | true | resource=message, operation=react | Message ID |
| emoji | string | '' | true | resource=message, operation=react | Unicode emoji or custom emoji (name:id) |

###### Delete Message

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | resourceLocator | {mode:'list',value:''} | true | resource=message, operation=deleteMessage | Channel (searchListMethod: channelSearch) |
| messageId | string | '' | true | resource=message, operation=deleteMessage | Message ID |

##### Webhook authentication (operation: sendLegacy)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| content | string | '' | false | operation=sendLegacy, auth=webhook | Message body (up to 2000 chars) |
| embeds | fixedCollection | [] | false | operation=sendLegacy, auth=webhook | Embeds (same structure as botToken send) |
| files | fixedCollection | [] | false | operation=sendLegacy, auth=webhook | Files |
| options.avatar_url | string | '' | false | operation=sendLegacy, auth=webhook | Override webhook avatar |
| options.flags | multiOptions | [] | false | operation=sendLegacy, auth=webhook | `SUPPRESS_EMBEDS`, `SUPPRESS_NOTIFICATIONS` |
| options.tts | boolean | false | false | operation=sendLegacy, auth=webhook | Text-to-speech |
| options.username | string | '' | false | operation=sendLegacy, auth=webhook | Override webhook username |
| options.wait | boolean | false | false | operation=sendLegacy, auth=webhook | Wait for message creation response |

#### Resource: Member (botToken / oAuth2 only)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| guildId | resourceLocator | {mode:'list',value:''} | true | resource=member, auth=botToken\|oAuth2 | Server |
| operation | options | 'getAll' | true | resource=member, auth=botToken\|oAuth2 | Options: `getAll`, `roleAdd`, `roleRemove` |

##### Get Many Members

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | false | false | resource=member, operation=getAll | Return all or limit |
| limit | number | 50 | false | resource=member, operation=getAll show returnAll=false | Max members |
| after | string | '' | false | resource=member, operation=getAll | User ID after which to return members |
| options.simplify | boolean | true | false | resource=member, operation=getAll | Simplify (user, roles, permissions) |

##### Role Add / Role Remove

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| userId | resourceLocator | {mode:'list',value:''} | true | resource=member, operation=roleAdd\|roleRemove | User (searchListMethod: userSearch) |
| role | multiOptions | [] | true | resource=member, operation=roleAdd\|roleRemove | Roles (loadOptionsMethod: getRoles) |

### Send and Wait webhook

The v2 node registers an n8n webhook endpoint for handling Discord interaction callbacks when `sendAndWait` is used. The webhook is managed by the n8n send-and-wait utility infrastructure.

## Runtime behavior

### Input

- **V1 (Webhook):** Consumes `main` input items. Each item can override `webhookUri` and `text` via expressions. Other options read from `options` collection.
- **V2 (Bot/OAuth2):** Consumes `main` input items. Each item can override parameters via expressions. Binary input used for `files` fixed collection. Guild-level operations (channel/getAll, member/getAll) process the first item only for the guild context.

### Output

- **V1:** Returns `[{ json: { success: true } }]` per input item on success. Throws on validation error or HTTP error (after rate-limit retries).
- **V2 (Channel Create/Update/Delete/Get):** Returns Discord API response object for the channel.
- **V2 (Channel GetAll):** Returns array of channel objects (filtered by type if option set).
- **V2 (Message Send):** Returns sent message object from Discord API.
- **V2 (Message Get/GetAll):** Returns message object(s). Simplified when `simplify=true`.
- **V2 (Message React/Delete):** Returns `{ success: true }` per item.
- **V2 (Send and Wait):** Pauses workflow. On interaction callback (button click, form submit), resumes with interaction data.
- **V2 (Member GetAll):** Returns array of member objects. Paginates through API with limit=100.
- **V2 (Member Role Add/Remove):** Returns `{ success: true }` per item. Iterates over each role ID.

### Errors

- **V1:** Throws `NodeOperationError` if webhookUri is missing, or if neither content nor embeds provided. On HTTP 429, retries up to 5 times with `retry-after` header backoff. Throws `NodeApiError` after max retries.
- **V2:** Discord API errors propagated via `parseDiscordError` as `NodeApiError`. OAuth2 guild access checked before operations (`checkAccessToGuild`). Rate limits handled by n8n HTTP client natively. `continueOnFail` returns `[{ json: { error } }]` with metadata.

### Expressions

All string/number/boolean parameters accept expressions. Resource locator parameters accept expressions in `id` and `url` modes. JSON/fixed collection parameters support expressions in sub-fields.

## Acceptance tests

### Test: V1 Send basic webhook message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "webhookUri": "https://discord.com/api/webhooks/123/TOKEN",
  "text": "Hello World!",
  "options": {}
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true } }]
```

---

### Test: V1 Send with embeds

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "webhookUri": "https://discord.com/api/webhooks/123/TOKEN",
  "text": "",
  "options": {
    "embeds": "[{\"title\": \"Test\", \"description\": \"Body\", \"color\": 16711680}]"
  }
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true } }]
```

---

### Test: V2 Send message (botToken, to channel)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "authentication": "botToken",
  "resource": "message",
  "operation": "send",
  "guildId": { "mode": "id", "value": "123456789" },
  "sendTo": "channel",
  "channelId": { "mode": "id", "value": "987654321" },
  "content": "Hello from bot!",
  "options": {}
}
```

**Expect** output[0] contains:
```json
[{ "json": { "id": "...", "channel_id": "987654321", "content": "Hello from bot!" } }]
```

---

### Test: V2 Send with embed fixedCollection

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "authentication": "botToken",
  "resource": "message",
  "operation": "send",
  "guildId": { "mode": "id", "value": "123456789" },
  "sendTo": "channel",
  "channelId": { "mode": "id", "value": "987654321" },
  "content": "Check this embed",
  "embeds": {
    "values": [
      {
        "inputMethod": "fields",
        "title": "Hello",
        "description": "World",
        "color": "#3498db"
      }
    ]
  }
}
```

**Expect** output[0] contains message with `embeds` array.

---

### Test: V2 Create channel

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "authentication": "botToken",
  "resource": "channel",
  "operation": "create",
  "guildId": { "mode": "id", "value": "123456789" },
  "name": "new-channel",
  "type": "0",
  "options": {
    "nsfw": false,
    "rate_limit_per_user": 5
  }
}
```

**Expect** output[0] contains:
```json
[{ "json": { "id": "...", "name": "new-channel", "type": 0, "nsfw": false } }]
```

---

### Test: V2 Get many messages (simplified)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "authentication": "botToken",
  "resource": "message",
  "operation": "getAll",
  "guildId": { "mode": "id", "value": "123456789" },
  "channelId": { "mode": "id", "value": "987654321" },
  "returnAll": false,
  "limit": 10,
  "options": { "simplify": true }
}
```

**Expect** output[0] is an array of simplified message objects.

---

### Test: V2 Add role to member

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
  "guildId": { "mode": "id", "value": "123456789" },
  "userId": { "mode": "id", "value": "555666777" },
  "role": ["888999000"]
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true } }]
```

---

### Test: V2 Send and wait (approval)

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
  "guildId": { "mode": "id", "value": "123456789" },
  "sendTo": "channel",
  "channelId": { "mode": "id", "value": "987654321" },
  "content": "Approve this?",
  "responseType": "approval",
  "options": {
    "limitWaitTime": false,
    "appendAttribution": true
  }
}
```

**Expect** workflow pauses; on user interaction (button click), resumes with interaction payload as output.

---

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| V1 rate limit retry logic | inferred from source | 5 retries with `retry-after` header; not in public docs |
| V2 sendAndWait webhook registration | inferred | Uses n8n send-and-wait utility infrastructure; not fully documented |
| V2 resource locator search methods | inferred from descriptor | `guildSearch`, `channelSearch`, `textChannelSearch`, `categorySearch`, `userSearch` methods |
| V2 loadOptions method | inferred from descriptor | `getRoles` for role multiOptions |
| V2 `sendTo` / conditional userId/channelId | documented + descriptor | Confirmed through sendToProperties structure |
| V2 Channel type options | descriptor confirmed | Only 3 values (`0`, `2`, `4`) in v2.15.1 descriptor; spec was previously inflated |
| V2 Message send param name | descriptor confirmed | Param is `content`, not `text` (V1 uses `text`) |
| V2 Send options scope | descriptor confirmed | Only `flags` (multiOptions), `message_reference`, `tts` for botToken send |
| Embed fixedCollection structure | inferred from descriptor | Fields: description, author, color, timestamp, title, url, image, thumbnail, video + inputMethod switch to raw JSON |
| V2 Webhook sendLegacy options | descriptor confirmed | Has `username`, `avatar_url`, `tts`, `flags`, `wait` |
| V2 sendAndWait default labels | descriptor confirmed | `approveLabel: '✓ Approve'`, `denyLabel: '✗ Decline'` |
| Rate limit handling V2 | inferred | Delegated to n8n HTTP client; not custom like V1 |
| v1↔v2 versioning | documented | `VersionedNodeType` wrapping DiscordV1 and DiscordV2 |
| `sendAndWait` freeText/form option structure | inferred | Delegated to n8n send-and-wait utility; structure matches chat/form trigger patterns |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.discord.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
