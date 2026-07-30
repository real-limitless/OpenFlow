---
type: n8n-nodes-base.telegram
displayName: Telegram
category: Communication
versions: [1, 1.1, 1.2]
priority: medium
status: specced
---

# Telegram

Send, edit, delete, and pin messages in a Telegram chat; manage chats, members,
and administrators; answer callback and inline queries; download files via the
Telegram Bot API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/chat-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/callback-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/file-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/message-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/telegram.md | Public docs only (credentials) |
| https://core.telegram.org/bots/api | Third-party service API docs (Telegram Bot API reference, paraphrased) |

## Wire format

- **Type string:** `n8n-nodes-base.telegram`
- **Aliases (palette / search):** (none in public docs)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `telegramApi` — bot access token (`accessToken`) (**documented**)
- **Categories:** Communication (**documented**)

### Resources and operations (documented)

| Resource | Operation | Telegram Bot API method | Documented |
|----------|-----------|--------------------------|------------|
| Chat | Get | `getChat` | yes |
| Chat | Get Administrators | `getChatAdministrators` | yes |
| Chat | Get Member | `getChatMember` | yes |
| Chat | Leave | `leaveChat` | yes |
| Chat | Set Description | `setChatDescription` | yes |
| Chat | Set Title | `setChatTitle` | yes |
| Callback | Answer Query | `answerCallbackQuery` | yes |
| Callback | Answer Inline Query | `answerInlineQuery` | yes |
| File | Get | `getFile` | yes |
| Message | Delete Chat Message | `deleteMessage` | yes |
| Message | Edit Message Text | `editMessageText` | yes |
| Message | Pin Chat Message | `pinChatMessage` | yes |
| Message | Send Animation | `sendAnimation` | yes |
| Message | Send Audio | `sendAudio` | yes |
| Message | Send Chat Action | `sendChatAction` | yes |
| Message | Send Document | `sendDocument` | yes |
| Message | Send Location | `sendLocation` | yes |
| Message | Send Media Group | `sendMediaGroup` | yes |
| Message | Send Message | `sendMessage` | yes |
| Message | Send and Wait for Response | `sendMessage` + workflow pause + Telegram Trigger | yes |
| Message | Send Photo | `sendPhoto` | yes |
| Message | Send Sticker | `sendSticker` | yes |
| Message | Send Video | `sendVideo` | yes |
| Message | Unpin Chat Message | `unpinChatMessage` | yes |

## Parameters

### Common

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `message` | yes | — | `chat` \| `callback` \| `file` \| `message` (**documented**) |
| operation | options | (per resource) | yes | — | Per-resource op enum (see table above) (**documented**) |
| chatId | string | | yes* | most ops | Chat ID numeric or `@channelusername` (**documented**) |
| binaryFile | boolean | `false` | no | message send-\* with file | Toggle to send from item binary instead of `*File` parameter (**documented**) |
| binaryPropertyName | string | `data` | yes* | binaryFile = true | Input binary field name to upload (**documented** / **inferred** default) |
| additionalFields | collection | | no | per op | Telegram-method optional fields (**documented**) |
| replyMarkup | options | `none` | no | message send-\* (most) | `none` \| `forceReply` \| `inlineKeyboard` \| `replyKeyboard` \| `replyKeyboardRemove` (**documented**) |

### Chat operations parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| userId | number/string | | yes* | resource=chat, operation=getMember | Target user id (**documented**) |
| description | string | | yes* | resource=chat, operation=setDescription | New chat description, max 255 chars (**documented**) |
| title | string | | yes* | resource=chat, operation=setTitle | New chat title, max 255 chars (**documented**) |

### Callback operations parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| queryId | string | | yes | resource=callback | Callback/inline query id (**documented**) |
| results | json/string | | yes | resource=callback | JSON-serialized array of InlineQueryResults; max 50 for inline (**documented** + Telegram API limit) |
| cacheTime | number | `0` (query) / `300` (inline) | no | resource=callback, additional | Max seconds client may cache the result (**documented**) |
| showAlert | boolean | `false` | no | resource=callback, additional | Show answer as alert popup (**documented**) |
| text | string | | no | resource=callback, additional | Up to 200 characters of text (**documented**) |
| url | string | | no | resource=callback, additional | URL the client opens on tap (**documented**) |

### File operation parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| fileId | string | | yes | resource=file, operation=get | Telegram `file_id` (**documented**) |
| download | boolean | `false` | no | resource=file, operation=get | If true, fetch file bytes into output binary (**documented**) |

### Message operations — common + per-op

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| messageId | number/string | | yes* | delete / editMessageText / pinChatMessage / unpinChatMessage | Telegram message id (**documented**) |
| text | string | | yes* | sendMessage, editMessageText | Up to 4096 chars after entity parsing for sendMessage (**documented**) |
| caption | string | | no | send animation/audio/document/photo/video, additional | Max 1024 chars (**documented**) |
| animation | string | | yes* | sendAnimation, binaryFile=false | `file_id` or HTTP URL (**documented**) |
| audio | string | | yes* | sendAudio, binaryFile=false | `file_id` or HTTP URL (**documented**) |
| document | string | | yes* | sendDocument, binaryFile=false | `file_id` or HTTP URL (**documented**) |
| photo | string | | yes* | sendPhoto, binaryFile=false | `file_id` or HTTP URL (**documented**) |
| sticker | string | | yes* | sendSticker, binaryFile=false | `file_id` or HTTP URL (**documented**) |
| video | string | | yes* | sendVideo, binaryFile=false | `file_id` or HTTP URL (**documented**) |
| latitude | number | | yes* | sendLocation | Latitude in degrees (**documented**) |
| longitude | number | | yes* | sendLocation | Longitude in degrees (**documented**) |
| action | options | | yes | sendChatAction | `findLocation` \| `typing` \| `recordVideo` \| `recordVoice` \| `uploadVideo` \| `uploadVoice` \| `uploadPhoto` \| `uploadDocument` \| `chooseSticker` (Bot API enum, **documented** family) |
| media | fixedCollection | | yes* | sendMediaGroup | Per-item: `type` (photo\|video), `mediaFile` (`file_id`/URL), `additionalFields` (caption, parseMode) (**documented**) |
| parseMode | options | `html` | no | text/caption ops | `html` \| `markdown` \| `markdownV2` (**documented** default + values) |
| disableNotification | boolean | `false` | no | most message ops, additional | Send silently (**documented**) |
| disableWebPagePreview | boolean | `false` | no | sendMessage / editMessageText, additional | Maps to `link_preview_options.is_disabled` (**documented** + Telegram `LinkPreviewOptions`) |
| replyToMessageId | number | | no | most message ops, additional | Reply target message id (**documented**) |
| messageThreadId | number | | no | most message ops, additional | Forum topic id (**documented**) |
| duration | number | | no | sendAnimation/Audio/Video, additional | Duration in seconds (**documented**) |
| width | number | | no | sendAnimation/Video, additional | Width (px / video) (**documented**) |
| height | number | | no | sendAnimation/Video, additional | Height (px / video) (**documented**) |
| performer | string | | no | sendAudio, additional | Performer name (**documented**) |
| title | string | | no | sendAudio, additional | Audio track title (**documented**) |
| thumbnail | string | | no | animation/audio/document/video, additional | Thumbnail (`file_id`/URL) or binary field; JPEG, <200 KB, <320×320 (**documented**) |
| appendAttribution | boolean | `true` | no | sendMessage, additional | Append `This message was sent automatically with n8n` (**documented** + default) |

### Message — Send and Wait for Response parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| message | string | | yes | operation=sendAndWait | Message to send (**documented**) |
| responseType | options | `approval` | yes | operation=sendAndWait | `approval` \| `freeText` \| `customForm` (**documented**) |
| typeOfApproval | options | `single` | no | operation=sendAndWait, responseType=approval | `single` (approve only) \| `double` (approve + decline) (**documented**) |
| buttonLabel | string | `✅ Approve` / `Respond` | no | operation=sendAndWait | Approval / form button label (**documented**) |
| declineButtonLabel | string | `❌ Decline` | no | typeOfApproval=double | Decline button label (**documented**) |
| limitWaitTime | boolean | `false` | no | operation=sendAndWait | Auto-resume after time limit (**documented**) |
| waitTime | number | | no | limitWaitTime=true | Time limit value (**documented**) |
| resumeMethod | options | `afterTime` | no | limitWaitTime=true | `afterTime` \| `atSpecifiedTime` (**documented**) |
| approveWithinChat | boolean | `false` | no | responseType=approval | Approve via in-chat button (n8n registers webhook) (**documented**) |
| restrictWhoCanApprove | string | | no | approveWithinChat=true | Comma-separated Telegram user ids allowed to respond (**documented**) |
| unauthorizedReply | string | | no | approveWithinChat=true | Popup text for unauthorized taps (**documented**) |
| afterDecision | options | `showOutcomeAndRemoveButtons` | no | approveWithinChat=true | `showOutcomeAndRemoveButtons` \| `removeButtonsOnly` \| `keepMessageUnchanged` (**documented**) |
| formTitle | string | | no | responseType ∈ freeText, customForm | Response form title (**documented**) |
| formDescription | string | | no | responseType ∈ freeText, customForm | Response form description (**documented**) |
| formButtonLabel | string | `Submit` | no | responseType ∈ freeText, customForm | Submit button label (**documented**) |
| formFields | fixedCollection | | no | responseType=customForm | Form elements (mirrors n8n Form trigger elements) (**documented**) |

### Reply markup sub-parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| forceReply.forceReply | boolean | `true` | no | replyMarkup=forceReply | Trigger reply interface (**documented**) |
| forceReply.selective | boolean | `false` | no | replyMarkup=forceReply | Restrict to @mentioned / sender (**documented**) |
| inlineKeyboard | fixedCollection | | no | replyMarkup=inlineKeyboard | Rows of `Add Keyboard Row` → `Add Button` (**documented**) |
| replyKeyboard | fixedCollection | | no | replyMarkup=replyKeyboard | Buttons + per-row options (**documented**) |
| replyKeyboardOptions.resizeKeyboard | boolean | `false` | no | replyMarkup=replyKeyboard | Resize vertically (**documented**) |
| replyKeyboardOptions.oneTimeKeyboard | boolean | `false` | no | replyMarkup=replyKeyboard | Hide after first use (**documented**) |
| replyKeyboardOptions.selective | boolean | `false` | no | replyMarkup=replyKeyboard | Restrict to @mentioned / sender (**documented**) |
| replyKeyboardRemove.removeKeyboard | boolean | `true` | no | replyMarkup=replyKeyboardRemove | Remove custom keyboard (**documented**) |
| replyKeyboardRemove.selective | boolean | `false` | no | replyMarkup=replyKeyboardRemove | Restrict to @mentioned / sender (**documented**) |

## Runtime behavior

### Input

One Telegram API call is performed per input item. Most text/file parameters
accept expression strings (**inferred** / standard n8n behaviour). For send\*
operations with `binaryFile = true`, the node uploads the named binary field
from the input item instead of a `*File` parameter value (**documented**).

### Output

| Operation | Output item shape | Documented / inferred |
|-----------|-------------------|------------------------|
| Chat → Get | `json` = `Chat` object (id, type, title, …) | documented / Telegram API |
| Chat → Get Administrators | `json` = `Array<ChatMember>` | documented / Telegram API |
| Chat → Get Member | `json` = `ChatMember` | documented / Telegram API |
| Chat → Leave | `json` = `true` (or empty `Message` on some endpoints) | documented |
| Chat → Set Description / Set Title | `json` = `true` | documented |
| Callback → Answer Query | `json` = `true` | documented |
| Callback → Answer Inline Query | `json` = `true` | documented |
| File → Get (download=false) | `json` = `{ file_id, file_path, … }` | documented / Telegram API |
| File → Get (download=true) | `json` + `binary[<fileId-or-property>]` = file bytes | documented + **inferred** binary field name |
| Message → Delete / Edit / Pin / Unpin | `json` = `true` | documented |
| Message → Send \* | `json` = `Message` object (message_id, chat, date, text/…) | documented / Telegram API |
| Message → Send Chat Action | `json` = `true` | documented |
| Message → Send and Wait for Response | `json` = `Message` on send + resumed `json` with approval/response data | documented |

### Errors

- Missing `telegramApi` credential throws (**inferred**).
- Invalid access token → 401 from Telegram, surfaced as a node error (**inferred** / standard HTTP behaviour).
- `chatId` missing for ops that require it throws (**inferred**).
- Telegram rate limit (HTTP 429) is surfaced as a node error; n8n docs warn about a hard limit of 30 messages/second globally per bot and suggest batching with a **Wait** node (**documented**).
- For `Send and Wait for Response`, exceeding the time limit (when `limitWaitTime=true`) auto-resumes the workflow (**documented**).
- For `Approve Within Chat`, the n8n instance must be reachable on port 443/80/88/8443 over public HTTPS; otherwise the node falls back to link buttons (**documented**).

### Expressions

All text and chat-id parameters accept n8n expression strings (`{{ … }}`) for
per-item templating (**inferred** / standard).

### Approve within chat (HITL)

- When `approveWithinChat=true`, n8n registers (or reuses an existing)
  `Telegram Trigger` webhook for the same bot, using ports 443/80/88/8443
  (**documented**).
- The bot must be a member of the channel to post/edit messages (**documented**).
- Telegram allows one webhook per bot; a configured **Telegram Trigger** on the
  same bot is shared automatically (**documented**).
- After a decision, the message is updated according to `afterDecision`
  (**documented**).

## Acceptance tests

### Test: send message

**Given** one input item `{}`

**Parameters:**

```json
{
  "resource": "message",
  "operation": "sendMessage",
  "chatId": "@example_channel",
  "text": "Hello from n8n",
  "additionalFields": {
    "parseMode": "markdown",
    "disableNotification": false,
    "appendAttribution": false
  }
}
```

**Expect** one outgoing HTTPS request to `POST https://api.telegram.org/bot<token>/sendMessage` with JSON body `{ chat_id: "@example_channel", text: "Hello from n8n", parse_mode: "Markdown", disable_notification: false }` and output[0][0].json = `Message` (contains `message_id` and `chat`).

### Test: send photo from binary

**Given** one input item with `binary.data` (image bytes)

**Parameters:**

```json
{
  "resource": "message",
  "operation": "sendPhoto",
  "chatId": "123456789",
  "binaryFile": true,
  "binaryPropertyName": "data",
  "additionalFields": { "caption": "Look" }
}
```

**Expect** outgoing `POST /sendPhoto` as `multipart/form-data` with the binary bytes and `chat_id=123456789`; output[0][0].json = `Message` containing the sent `photo` array.

### Test: get chat administrators

**Given** one input item `{}`

**Parameters:**

```json
{ "resource": "chat", "operation": "getAdministrators", "chatId": "@example_channel" }
```

**Expect** outgoing `POST /getChatAdministrators` with `chat_id`; output[0][0].json is an array of `ChatMember` objects (length ≥ 1 when bot is admin).

### Test: get file with download

**Given** one input item `{}`

**Parameters:**

```json
{ "resource": "file", "operation": "get", "fileId": "AgACAgIAAxk...", "download": true }
```

**Expect** two HTTPS calls: first `POST /getFile` → `file_path`; then `GET https://api.telegram.org/file/bot<token>/<file_path>`; output[0][0] has `binary.data` containing the bytes and `json.file_id`.

### Test: send and wait for response — approval

**Given** one input item `{}`

**Parameters:**

```json
{
  "resource": "message",
  "operation": "sendAndWait",
  "chatId": "@example_channel",
  "message": "Approve?",
  "responseType": "approval",
  "typeOfApproval": "double",
  "buttonLabel": "Approve",
  "declineButtonLabel": "Decline",
  "limitWaitTime": false
}
```

**Expect** outgoing `POST /sendMessage` with `reply_markup` containing two inline buttons; workflow suspends. On approve tap (via shared Telegram Trigger webhook) workflow resumes; output[0][0].json contains `data.approved` (boolean) and `user` (Telegram user id, username, name) (**documented** + **inferred** resumed shape).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact `additionalFields` wire shape for every op | partially documented | Docs enumerate the user-facing fields; the JSON shape over the wire is the underlying Telegram Bot API parameter name (e.g. `parse_mode`, `disable_notification`, `message_thread_id`, `reply_to_message_id`) |
| Output of `File → Get` when `download=true` — exact binary property name | inferred | Use a sensible name (e.g. `data`) since not pinned in docs |
| Resumed output shape of `Send and Wait for Response` | partially documented | Docs describe the user-visible fields (user id/username/name, approved); wire shape is an internal n8n convention |
| `appendAttribution` default for `sendMessage` | documented | `true` by default per docs; if `false`, no `n8n` suffix is appended |
| `action` enum for `sendChatAction` | partially documented | Docs list category names; full enum is in the Telegram Bot API (`typing`, `upload_photo`, `record_video`, …) |
| `parseMode` value mapping | documented → inferred | UI labels `Markdown (Legacy)` and `MarkdownV2` map to `markdown` and `markdownV2` on the wire |
| `Send and Wait for Response` executor model | documented at high level | Internally requires a paired Telegram Trigger; not modelled here in detail — out of scope for the first executor pass |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/telegram.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Pair `Send and Wait for Response` with the `telegramTrigger` executor (sharing the same bot token and webhook registration).
