---
type: n8n-nodes-base.telegramTool
displayName: Telegram
category: AI Tool
versions: [1, 1.1, 1.2]
priority: high
status: specced
---

# Telegram (AI Tool)

A tool variant of the Telegram node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Wraps the Telegram Bot API across Chat, Message, Callback, and File resources.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/chat-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/message-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/callback-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/file-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/telegram.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://core.telegram.org/bots/api | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.telegramTool`
- **Aliases:** (none; shares type with n8n-nodes-base.telegram)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 2 (second output for approval responses when using "Send and Wait for Response")
- **Credentials:** `telegramApi` (bot access token)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| credential | credential | — | yes | Telegram bot access token from BotFather |

### Resource selection

The user selects a resource (Chat, Message, Callback, File) which determines available operations.

### Chat operations

| Operation | Key parameters |
|-----------|----------------|
| Get | Chat ID (`@channelusername` or numeric ID) |
| Get Administrators | Chat ID |
| Get Member | Chat ID, User ID |
| Leave | Chat ID |
| Set Description | Chat ID, Description (max 255 chars) |
| Set Title | Chat ID, Title (max 255 chars) |

### Message operations

| Operation | Key parameters |
|-----------|----------------|
| Delete Chat Message | Chat ID, Message ID |
| Edit Message Text | Chat ID, Message ID, Text; optional: Disable WebPage Preview, Parse Mode (HTML/Markdown/MarkdownV2) |
| Pin Chat Message | Chat ID, Message ID; optional: Disable Notifications |
| Send Animation | Chat ID, Animation (file_id / URL / binary), Reply Markup; optional: binaryData (boolean toggle), binaryPropertyName (binary field name), Caption, Disable Notification, Duration, Height, Parse Mode, Reply To Message ID, Message Thread ID, Thumbnail, Width |
| Send Audio | Chat ID, Audio (file_id / URL / binary), Reply Markup; optional: binaryData (boolean toggle), binaryPropertyName (binary field name), Caption, Disable Notification, Duration, Parse Mode, Performer, Reply To Message ID, Message Thread ID, Title, Thumbnail |
| Send Chat Action | Chat ID, Action (typing / upload_photo / record_video / upload_video / record_voice / upload_voice / upload_document / find_location / record_video_note / upload_video_note) |
| Send Document | Chat ID, Document (file_id / URL / binary), Reply Markup; optional: binaryData (boolean toggle), binaryPropertyName (binary field name), Caption, Disable Notification, Parse Mode, Reply To Message ID, Message Thread ID, Thumbnail |
| Send Location | Chat ID, Latitude, Longitude, Reply Markup; optional: Disable Notification, Reply To Message ID, Message Thread ID |
| Send Media Group | Chat ID, Media (array of {type: photo/video, media: file_id/URL/binary, optional additionalFields: {caption, parse_mode}}); optional: Disable Notification, Reply To Message ID, Message Thread ID |
| Send Message | Chat ID, Text (max 4096 chars); optional: Append n8n Attribution, Disable Notification, Disable WebPage Preview, Parse Mode, Reply To Message ID, Message Thread ID |
| Send Photo | Chat ID, Photo (file_id / URL / binary), Reply Markup; optional: binaryData (boolean toggle), binaryPropertyName (binary field name), Caption, Disable Notification, Parse Mode, Reply To Message ID, Message Thread ID |
| Send Sticker | Chat ID, Sticker (file_id / URL / binary), Reply Markup; optional: binaryData (boolean toggle), binaryPropertyName (binary field name), Disable Notification, Reply To Message ID, Message Thread ID |
| Send Video | Chat ID, Video (file_id / URL / binary), Reply Markup; optional: binaryData (boolean toggle), binaryPropertyName (binary field name), Caption, Disable Notification, Duration, Height, Parse Mode, Reply To Message ID, Message Thread ID, Thumbnail, Width |
| Unpin Chat Message | Chat ID, Message ID |
| Send and Wait for Response | Chat ID, Message; Response Type (Approval / Free Text / Custom Form); includes limit-wait-time options |

### Callback operations

| Operation | Key parameters |
|-----------|----------------|
| Answer Query | Query ID; optional additionalFields: Cache Time, Show Alert, Text (max 200 chars), URL |
| Answer Inline Query | Query ID; optional additionalFields: Cache Time, Show Alert, Text (max 200 chars), URL |

### File operations

| Operation | Key parameters |
|-----------|----------------|
| Get | File ID; optional: Download (boolean) |

### Reply Markup parameters

Send-type Message operations support these Reply Markup options:
- **Force Reply**: Shows reply interface; optional Selective flag
- **Inline Keyboard**: Rows of buttons (Text + URL or Callback Data)
- **Reply Keyboard**: Custom keyboard with Resize, One Time Keyboard, Selective flags
- **Reply Keyboard Remove**: Removes custom keyboard; optional Selective flag

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "Send and Wait for Response" operation has a dual-output contract: output[0] carries the sent message confirmation, output[1] carries the human response (approval/denial/free-text input)

## Runtime behavior

### Input

Consumes items from `main` input. For send operations using binary files, set `binaryData` to true and reference the input binary field name via `binaryPropertyName`.

### Output

**Output[0]** — main result:
- Chat operations: Chat object from Telegram API
- Message operations: Message object from Telegram API (or success confirmation for actions like Pin, Delete)
- Callback operations: `{ "success": true }` on success
- File operations: File metadata object, plus downloaded binary data if Download is enabled

**Output[1]** — human response (only when using "Send and Wait for Response"):
- For Approval response type: contains the approval/denial decision from the human reviewer
- For Free Text response type: contains the user's text input
- For Custom Form response type: contains the form fields submitted by the user

### Errors

- Telegram API errors (invalid bot token, chat not found, message too old to edit, rate limiting) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error

### Expressions

Parameters tagged as AI-populatable accept expression strings including `$fromAI()`. All string fields accept standard n8n expressions.

## Acceptance tests

### Test: Send a simple text message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "sendMessage",
  "chatId": "@testchannel",
  "text": "Hello from workflow"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "message_id": 123,
    "chat": { "id": -1001234567890, "type": "channel", "title": "Test Channel" },
    "date": 1700000000,
    "text": "Hello from workflow"
  }
}]
```

### Test: Get chat administrators

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "chat",
  "operation": "getAdministrators",
  "chatId": "@testchannel"
}
```

**Expect** output[0]:
```json
[{
  "json": [
    {
      "user": { "id": 123456, "is_bot": false, "first_name": "Admin" },
      "status": "creator"
    }
  ]
}]
```

### Test: Send a photo from binary data

**Given** input items:
```json
[{ "json": {}, "binary": { "photo": { "fileName": "image.jpg", "mimeType": "image/jpeg", "data": "..." } } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "sendPhoto",
  "chatId": "@testchannel",
  "binaryData": true,
  "binaryPropertyName": "photo"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "message_id": 124,
    "chat": { "id": -1001234567890, "type": "channel", "title": "Test Channel" },
    "date": 1700000001,
    "photo": [{ "file_id": "AgAD...", "file_size": 1234, "width": 320, "height": 240 }]
  }
}]
```

### Test: Answer a callback query

**Given** input items:
```json
[{ "json": { "queryId": "1234567890" } }]
```

**Parameters:**
```json
{
  "resource": "callback",
  "operation": "answerQuery",
  "queryId": "={{ $json.queryId }}",
  "additionalFields": {
    "text": "Action completed"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": { "success": true }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact resource/operation names | documented | Public docs enumerate all operations with their Bot API method mappings |
| AI tool $fromAI() support | documented | Public docs confirm tool mode but specific field-level AI-population is per-convention |
| Reply Markup structure | documented | ForceReply, InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove follow Telegram Bot API shapes |
| Send and Wait response output shape | documented | Second output branch for approval/denial documented in Send and Wait for Response |
| Binary file upload behavior | documented | Uses binaryData (boolean toggle) + binaryPropertyName (input binary field); file_id/URL fallback when binaryData is false |
| Send Media Group array structure | documented | Each media entry has Type (Photo/Video), Media File, optional Caption and Parse Mode |
| Exact default values per field | inferred | Public docs describe behavior but don't list every default |
| Version differences (v1, v1.1, v1.2) | inferred from corpus | v1.1 added chat/user ID restrictions; v1.2 may include Send and Wait features |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.telegramTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
