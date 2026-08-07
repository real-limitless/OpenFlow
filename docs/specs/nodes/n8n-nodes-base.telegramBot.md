---
type: n8n-nodes-base.telegramBot
displayName: Telegram Bot
category: Communication
versions: [1]
priority: low
status: specced
---

# Telegram Bot

Action node that wraps the Telegram Bot API to send, edit, delete, and pin messages; send files, animations, locations, and stickers; manage chat metadata; answer callback and inline queries; and retrieve file data.

This is a type-alias variant of the canonical `n8n-nodes-base.telegram` node. It exposes the exact same resources, operations, parameters, and credential requirements. Workflows referencing `n8n-nodes-base.telegramBot` should execute identically to `n8n-nodes-base.telegram`.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/chat-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/callback-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/file-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/message-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/telegram.md | Public docs only (credentials) |
| https://core.telegram.org/bots/api | Public docs only (Telegram Bot API) |

## Wire format

- **Type string:** `n8n-nodes-base.telegramBot`
- **Aliases:** `human`, `form`, `wait`, `hitl`, `approval`
- **Canonical type:** `n8n-nodes-base.telegram`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** required — `telegramApi` (bot access token)

### Credential: `telegramApi`

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| accessToken | string (password) | (empty) | yes | Telegram bot access token issued by BotFather (`<digits>:<alphanumeric>`). |

## Parameters

Identical to `n8n-nodes-base.telegram`. See [n8n-nodes-base.telegram.md](./n8n-nodes-base.telegram.md) for the full parameter reference.

**Resource selection:**

| value | operations |
|-------|------------|
| Chat | Get, Get Administrators, Get Member, Leave, Set Description, Set Title |
| Callback | Answer Query, Answer Inline Query |
| File | Get |
| Message | Delete Chat Message, Edit Message Text, Pin Chat Message, Send Animation, Send Audio, Send Chat Action, Send Document, Send Location, Send Media Group, Send Message, Send and Wait for Response, Send Photo, Send Sticker, Send Video, Unpin Chat Message |

Each operation maps to the corresponding Telegram Bot API method (e.g. Send Message → `sendMessage`, Get Chat → `getChat`).

## Runtime behavior

### Input

Consumes one input item. For send-type operations with media, the file can be provided as either:
- A `file_id` string (recommended for files already on Telegram servers) or HTTP URL
- Binary data from the input item (via `binaryFile`/`inputBinaryField` toggle)

### Output

Each output item's `json` field contains the Telegram Bot API response object (`{ ok: true, result: ... }`). The `result` shape varies by operation (Message object for sends, Chat object for getChat, boolean for deletes, etc.).

### Errors

- Telegram API errors (403 Forbidden, 401 Unauthorized, 429 rate limited) propagate as node errors
- `continueOnFail` allows workflow to proceed on error
- Rate limit: 30 messages/second enforced by Telegram

### Expressions

All parameter values accept expression strings.

## Acceptance tests

The acceptance tests are identical to those for `n8n-nodes-base.telegram`. Refer to [n8n-nodes-base.telegram.md](./n8n-nodes-base.telegram.md) for test fixtures covering send message, get chat administrators, answer callback query, send photo from binary, and get file with download.

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

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Compatibility with n8n-nodes-base.telegram | documented | All public docs reference the canonical `n8n-nodes-base.telegram` type; `telegramBot` is a usage-scraped alias |
| Resource and operation list | documented | Same as canonical telegram spec |
| Credentials | documented | Same `telegramApi` credential |
| Rate limits | documented | Telegram Bot API enforces 30 msg/s |
| Parameter surface | documented | Full parameter reference in canonical telegram spec |
| Wire type string | documented | Corpus descriptor confirms canonical type is `n8n-nodes-base.telegram` |
| Catalog priority | inferred | Catalog lists telegramBot at priority 611 (core tier) — likely from legacy/scraped workflow references |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/telegram.ts`
- **Notes:** Alias type. The executor registered for `n8n-nodes-base.telegram` must also handle the `n8n-nodes-base.telegramBot` type string. Shares runtime implementation, credential schema, and parameter definitions with the canonical type. No separate executor needed.
