---
type: n8n-nodes-base.telegram
displayName: Telegram
category: Communication
versions: [1]
priority: medium
status: specced
---

# Telegram

Action node that wraps the Telegram Bot API to send, edit, delete, and pin messages; send files, animations, locations, and stickers; manage chat metadata; answer callback and inline queries; and retrieve file data. Usable as an AI tool and as a human-in-the-loop (HITL) approval channel.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/chat-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/callback-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/file-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/message-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/telegram.md | Public docs only (credentials) |
| https://core.telegram.org/bots/api | Public docs only (Telegram Bot API) |

## Wire format

- **Type string:** `n8n-nodes-base.telegram`
- **Aliases:** `human`, `form`, `wait`, `hitl`, `approval`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** required — `telegramApi` (bot access token)

### Credential: `telegramApi`

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| accessToken | string (password) | (empty) | yes | Telegram bot access token issued by BotFather (`<digits>:<alphanumeric>`). |

## Parameters

The node exposes a three-level resource/operation selection followed by operation-specific parameters.

### Resource selection

| value | operations |
|-------|------------|
| Chat | Get, Get Administrators, Get Member, Leave, Set Description, Set Title |
| Callback | Answer Query, Answer Inline Query |
| File | Get |
| Message | Delete Chat Message, Edit Message Text, Pin Chat Message, Send Animation, Send Audio, Send Chat Action, Send Document, Send Location, Send Media Group, Send Message, Send and Wait for Response, Send Photo, Send Sticker, Send Video, Unpin Chat Message |

### Shared parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed-select | (none) | yes | — | Which resource group to operate on |
| operation | fixed-select | (none) | yes | depends on `resource` | Which operation within the resource |
| chatId | string | `""` | yes (most ops) | — | Chat ID or `@channelusername`; required for all operations |
| additionalFields | collection | `{}` | no | — | Operation-specific optional fields (see below) |
| replyMarkup | fixed-select | `none` | no | send-type Message operations | None, Force Reply, Inline Keyboard, Reply Keyboard, Reply Keyboard Remove |

### Chat resource parameters

| operation | required params | notes |
|-----------|-----------------|-------|
| Get | chatId | Returns full chat info via Bot API `getChat` |
| Get Administrators | chatId | Returns list of chat administrators via `getChatAdministrators` |
| Get Member | chatId, userId | Returns member info via `getChatMember`; userId required |
| Leave | chatId | Via `leaveChat` |
| Set Description | chatId, description | Via `setChatDescription`; description max 255 chars |
| Set Title | chatId, title | Via `setChatTitle`; title max 255 chars |

### Callback resource parameters

| operation | required params | notes |
|-----------|-----------------|-------|
| Answer Query | queryId, results | Via `answerCallbackQuery`; queryId from inline keyboard; results is JSON array of InlineQueryResult objects |
| Answer Inline Query | queryId, results | Via `answerInlineQuery`; max 50 results |

Additional fields for both callback operations: cacheTime (seconds), showAlert (boolean), text (max 200 chars), url.

### File resource parameters

| operation | required params | notes |
|-----------|-----------------|-------|
| Get | fileId, download (boolean) | Via `getFile`; when download=true, binary data is fetched and attached to the output item |

### Message resource parameters (send-type operations)

For Send Animation, Send Audio, Send Document, Send Photo, Send Sticker, Send Video:

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| binaryFile | boolean | `false` | no | If true, file is read from the input binary field |
| inputBinaryField | string | `""` | yes (when binaryFile) | Name of the binary data field on the input item |
| file* | string | `""` | conditional | file_id (recommended) or HTTP URL; used when binaryFile=false |

*Field name varies by media type: animation, audio, document, photo, sticker, video.

Additional fields common to send-type operations: caption (max 1024 chars), disableNotification (boolean), parseMode (HTML / Markdown (Legacy) / MarkdownV2), replyToMessageId (string), messageThreadId (string). Some media types also support duration, height, width, performer, title, thumbnail.

### Send Message specific parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| text | string | `""` | yes | Max 4096 characters after entity parsing |

Additional fields: appendAttribution (boolean, default true), disableNotification, disableWebPagePreview, parseMode, replyToMessageId, messageThreadId.

### Send Chat Action specific parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| action | fixed-select | (none) | yes | Typing, Find Location, Recording Audio, Recording Video, Uploading Document, Uploading Photo, Uploading Video, Uploading Voice |

### Send Media Group specific parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| media | array of media items | `[]` | yes | Each item has: type (Photo or Video), mediaFile (file_id or URL), additionalFields (caption, parseMode) |

Additional fields: disableNotification, replyToMessageId, messageThreadId.

### Send Location specific parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| latitude | number | `""` | yes | WGS84 latitude |
| longitude | number | `""` | yes | WGS84 longitude |

### Edit Message Text specific parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| messageId | string | `""` | yes | Unique message identifier |
| text | string | `""` | yes | Replacement text |

Additional fields: disableWebPagePreview, parseMode, replyMarkup (Inline Keyboard only).

### Delete Chat Message / Pin Chat Message / Unpin Chat Message specific parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| messageId | string | `""` | yes | Unique message identifier |

Pin Chat Message additional field: disableNotification (boolean).

### Send and Wait for Response specific parameters

HITL operation that pauses workflow execution until the user responds.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| message | string | `""` | yes | Message text to display |
| responseType | fixed-select | (none) | yes | Approval, Free Text, or Custom Form |
| responseOptions | collection | `{}` | conditional | Response-type-specific fields |

Approval response options: typeOfApproval (approve only / approve and decline), buttonLabel, limitWaitTime, approveWithinChat (with sub-options: restrictWhoCanApprove, unauthorizedReply, afterDecision).

Free Text / Custom Form response options: messageButtonLabel (default "Respond"), responseFormTitle, responseFormDescription, responseFormButtonLabel (default "Submit"), limitWaitTime, formElements (Custom Form only).

### Reply Markup parameters

When replyMarkup is not `none`, the following sub-configurations apply:

- **Force Reply:** forceReply (boolean), selective (boolean)
- **Inline Keyboard:** array of keyboard rows, each containing buttons with text and optional fields (url, callbackData, switchInlineQuery, etc.)
- **Reply Keyboard:** array of keyboard rows, with options: resizeKeyboard, oneTimeKeyboard, selective
- **Reply Keyboard Remove:** removeKeyboard (boolean), selective

## Runtime behavior

### Input processing

The node processes each input item independently. Non-send operations (Get, Delete, Leave, etc.) produce one output item per input item, carrying the Telegram API response in the `json` field. Send operations produce one output item per input item with the Telegram API response.

For media uploads, when `binaryFile` is enabled, the file content is read from the input item's binary data and sent to Telegram via multipart/form-data upload. When `binaryFile` is disabled, a `file_id` string or HTTP URL is passed as the media parameter.

### Output

Each output item's `json` field contains the Telegram Bot API response object (typically `{ ok: true, result: {...} }`). The `result` shape varies by operation:

- Message send operations: the sent `Message` object
- Chat Get operations: the `Chat` object
- Delete operations: `true`
- Get File: the `File` object; if `download` is true, the downloaded binary content is attached to the item's binary data under a field named after the media type
- Answer Query: `true`

### Errors

- **Authentication errors** (bad token, revoked): fail the item with an appropriate Telegram API error (403, 401).
- **Rate limiting** (429 Too Many Requests): Telegram enforces a limit of 30 messages per second; the node surfaces the API error. Workflow authors should batch items through a SplitInBatches node to stay under the limit.
- **Permission errors** (bot not in channel, insufficient rights): fail with the Telegram error description (e.g. "Forbidden: bot is not a participant of the channel").
- **Media download failures** (Get File with download=true): fail the item unless `continueOnFail` is set.
- **Invalid parameters** (text too long, media too large): fail with the Telegram API validation error.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: send plain text message

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Message",
  "operation": "Send Message",
  "chatId": "@mychannel",
  "text": "Hello from OpenFlow",
  "additionalFields": { "appendAttribution": false }
}
```

**Expect** output[0] contains one item. The `json.ok` field is `true`, `json.result` is a Message object with `text` = `"Hello from OpenFlow"`.

### Test: get chat administrators

**Parameters:**

```json
{
  "resource": "Chat",
  "operation": "Get Administrators",
  "chatId": "-1001234567890"
}
```

**Expect** output[0] contains one item. `json.ok` is `true`, `json.result` is an array of ChatMember objects.

### Test: answer callback query

**Parameters:**

```json
{
  "resource": "Callback",
  "operation": "Answer Query",
  "queryId": "123456789:abc123",
  "text": "Processing complete"
}
```

**Expect** output[0] contains one item. `json.ok` is `true`, `json.result` is `true`.

### Test: send photo from binary data

**Given** input item with binary data at field `imageData`:

```json
[{ "json": {}, "binary": { "imageData": { "data": "base64...", "mimeType": "image/png", "fileName": "photo.png" } } }]
```

**Parameters:**

```json
{
  "resource": "Message",
  "operation": "Send Photo",
  "chatId": "@mychannel",
  "binaryFile": true,
  "inputBinaryField": "imageData"
}
```

**Expect** output[0] contains one item. `json.ok` is `true`, `json.result.message_id` is a positive integer.

### Test: get file with download

**Parameters:**

```json
{
  "resource": "File",
  "operation": "Get",
  "fileId": "AgADBAAD_xyz",
  "download": true
}
```

**Expect** output[0] contains one item. `json.ok` is `true`, `json.result` is a Telegram File object with `file_id` and `file_size`. Binary data is attached to the item with the downloaded file content.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | documented | Public docs enumerate all resources and operations |
| Chat per-operation parameters | documented | Fields documented per operation on public sub-pages |
| Message send-type media fields | documented | File-id vs binary-file toggle documented for each send type |
| Reply Markup taxonomy | documented | Force Reply, Inline Keyboard, Reply Keyboard, Reply Keyboard Remove documented |
| Send and Wait HITL fields | documented | Approval, Free Text, Custom Form modes documented with sub-parameters |
| Wire type string | documented | Confirmed from corpus metadata: `n8n-nodes-base.telegram` |
| Credentials | documented | Public Telegram credentials page: bot access token |
| Output shape (Telegram API response) | inferred | Standard Telegram Bot API response format; result shape documented in Telegram Bot API reference |
| Alias list | documented | Corpus JSON descriptor: `["human", "form", "wait", "hitl", "approval"]` |
| n8n attribution default (true) | documented | Common-issues page describes removal; default true inferred from docs |
| Rate limit (30/s) | documented | Common-issues page and Telegram Bot API FAQ |
| Chat ID prefix requirement (groups = `-`) | documented | Common-issues page |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/telegram.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** App node. Requires an HTTP client to the Telegram Bot API at `https://api.telegram.org/bot<token>/`. The executor must map resource/operation pairs to Bot API method names. Media uploads use multipart/form-data encoding. The HITL ("Send and Wait for Response") operation requires integration with the workflow's waiting/approval mechanism. Shares the `telegramApi` credential with the Telegram Trigger node.
