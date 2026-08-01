---
type: n8n-nodes-base.telegramTrigger
displayName: Telegram Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Telegram Trigger

Webhook-based trigger that listens for Telegram bot updates and emits one workflow item per received update. The node registers a webhook with the Telegram Bot API on activation and passes each raw `Update` object through to the workflow.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/telegram.md | Public docs only (credentials) |
| https://core.telegram.org/bots/api | Public docs only (Telegram Bot API) |

## Wire format

- **Type string:** `n8n-nodes-base.telegramTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** required — `telegramApi` (access token)

### Credential: `telegramApi`

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| accessToken | string (password) | (empty) | yes | Telegram bot access token issued by BotFather (`<digits>:<alphanumeric>`). |

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multi-select from event list | `["*"]` | yes | — | One or more Telegram update categories to react to; the wildcard `*` covers all updates except Chat Member, Message Reaction, and Message Reaction Count. |
| options | collection | `{}` | no | — | Nested options below |
| options.downloadImages | boolean | `false` | no | options | When true, attached images/files are fetched from Telegram and added as binary data to the emitted item |
| options.imageSize | fixed-select | `large` | no | options, when `downloadImages` | Which photo size variant to download when `downloadImages` is enabled (small / medium / large) |
| options.restrictToChatIds | string | `""` | no | options | Comma-separated chat IDs; only updates originating from these chats are emitted |
| options.restrictToUserIds | string | `""` | no | options | Comma-separated user IDs; only updates originating from these users are emitted |

### Event types

The selectable categories mirror the top-level fields of the Telegram Bot API `Update` object and include:

- Wildcard `*` (all updates except Chat Member, Message Reaction, Message Reaction Count)
- Message, Edited Message, Channel Post, Edited Channel Post
- Callback Query, Inline Query, Chosen Inline Result
- Business Connection, Business Message, Edited Business Message, Deleted Business Messages
- Chat Boost, Removed Chat Boost, Chat Join Request, Chat Member, My Chat Member
- Poll, Poll Answer
- Pre-Checkout Query, Shipping Query
- Purchased Paid Media
- Message Reaction, Message Reaction Count

Some categories require the bot to hold specific administrator rights in the target chat (see Telegram's *Getting updates* docs); the trigger does not grant these, it only subscribes to them.

## Runtime behavior

### Webhook lifecycle

1. **On workflow activation:** the node registers a webhook with Telegram via the Bot API `setWebhook` call, using the runtime's public HTTPS webhook URL. Telegram requires the webhook URL to be HTTPS. Because Telegram allows only one webhook registration per bot, activating a second workflow (or a test and a production instance) with the same bot overwrites the earlier registration.
2. **On webhook receive:** Telegram sends an HTTP POST whose body is a serialized `Update` object.
3. **On workflow deactivation:** the node removes the webhook registration via the Bot API `deleteWebhook` call.

### Output

Each accepted `Update` produces one output item whose `json` field is the raw Telegram `Update` object unchanged:

```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 42,
    "date": 1700000000,
    "chat": { "id": 987654321, "type": "private" },
    "from": { "id": 12345, "is_bot": false, "first_name": "Ada" },
    "text": "hello"
  }
}
```

The executor does not unwrap, rename, or restructure the update fields; nested event payloads (message, callback_query, channel_post, poll, etc.) are preserved as delivered by Telegram. When `downloadImages` is enabled, media referenced in the update is fetched via the Bot API (`getFile` + file download) and attached as binary data on the same item, alongside the unchanged JSON update.

### Event filtering

- The node inspects the update to determine which category it belongs to (by which top-level Telegram `Update` field is present) and matches it against the configured `events` list.
- If no configured category matches the received update, the node silently produces zero output items.
- If `restrictToChatIds` is set, the update's originating chat ID must be in the list; otherwise it is discarded.
- If `restrictToUserIds` is set, the update's originating user ID must be in the list; otherwise it is discarded. Restriction applies only when the update carries a resolvable chat/user — updates without one (e.g. a plain callback) are treated per the restriction semantics of the original node.

### Manual trigger

In manual (test) mode, the node listens for a single update, emits it, then completes. In active production mode it continues emitting indefinitely.

### Errors

- **Webhook registration/deletion failures** (Telegram API errors, bad token, non-HTTPS URL): surface the Telegram API error; activation fails unless `continueOnFail` is set.
- **Media download failures** when `downloadImages` is enabled: fail the item unless `continueOnFail` is set.
- **Invalid webhook payload** (not a Telegram Update): reject the request without emitting output.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: basic message update

**Given** Telegram delivers the following webhook body:

```json
{
  "update_id": 1,
  "message": {
    "message_id": 42,
    "date": 1700000000,
    "chat": { "id": 987654321, "type": "private" },
    "from": { "id": 12345, "is_bot": false, "first_name": "Ada" },
    "text": "hello"
  }
}
```

**Parameters:**
```json
{ "events": ["*"], "options": {} }
```

**Expect** output[0] contains one item whose `json` equals the received Update object verbatim (same `update_id`, `message.message_id`, `message.chat.id`, `message.text`).

### Test: event category filtering

**Parameters:**
```json
{ "events": ["Callback Query"], "options": {} }
```

Deliver a webhook body containing only a `message` field.

**Expect** zero output items.

### Test: chat ID restriction

**Parameters:**
```json
{ "events": ["*"], "options": { "restrictToChatIds": "987654321" } }
```

Deliver a message update with `chat.id` = `987654321`.

**Expect** one output item.

Deliver a message update with `chat.id` = `111222333`.

**Expect** zero output items.

### Test: media download

**Parameters:**
```json
{ "events": ["*"], "options": { "downloadImages": true, "imageSize": "large" } }
```

Deliver an update whose `message.photo` contains an array of photo-size objects with `file_id` values.

**Expect** output[0] contains one item: the raw update preserved in `json`, and the downloaded image present as binary data on the same item (file content obtained from Telegram via the `file_id`).

### Test: wildcard excludes restricted categories

**Parameters:**
```json
{ "events": ["*"], "options": {} }
```

Deliver an update containing a `message` field.

**Expect** one output item.

Deliver an update containing only a `message_reaction` field (bot is not an administrator, so it would not normally be received).

**Expect** zero output items, confirming the wildcard does not cover Chat Member / Message Reaction / Message Reaction Count categories.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event category list | documented | Public docs page enumerates all categories |
| Wildcard semantics | documented | Docs: `*` = all updates except Chat Member, Message Reaction, Message Reaction Count |
| Options (downloadImages, imageSize, restrictToChatIds, restrictToUserIds) | documented | Public docs page describes each option's purpose |
| Wire type string | documented | Confirmed from corpus package metadata (n8n-nodes-base) |
| Output = raw Telegram Update object | documented | Update object shape from Telegram Bot API docs; pass-through behavior abstracted |
| Credential (accessToken) | documented | Public Telegram credentials page: bot access token |
| Webhook lifecycle (setWebhook/deleteWebhook) | inferred | Standard Telegram Bot API webhook contract; single-webhook-per-bot constraint documented in common-issues |
| Media download mechanism (getFile + binary attach) | inferred | Behavior matches the documented option; exact binary key and size-variant enum inferred |
| Restriction matching edge cases (updates without chat/user) | inferred | Behavior abstracted at requirements level |
| Manual-trigger single-shot behavior | inferred | Standard n8n trigger pattern |
| HTTPS requirement for webhook URL | documented | Common-issues page: HTTPS required, `WEBHOOK_URL` env for reverse-proxy setups |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/telegram-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Webhook trigger. The executor must implement the trigger lifecycle (activate = register webhook, deactivate = delete webhook, manual = single-shot listen). Requires the runtime webhook base URL (HTTPS) and a Telegram HTTP client for `setWebhook`/`deleteWebhook`/media `getFile` calls. Reuses the `telegramApi` credential type shared with the Telegram app node.
