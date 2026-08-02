---
type: n8n-nodes-base.gmailTrigger
displayName: Gmail Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Gmail Trigger

Polling trigger that starts a workflow on the single supported event, **Message Received**, which fires for new messages in a connected Gmail mailbox at the configured **Poll Time**. On each scheduled poll it asks the Gmail API for messages matching the active filters, emits one workflow item per new message, and keeps enough per-message state that a message already emitted in an earlier cycle is not re-emitted.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.gmailtrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.gmailtrigger/poll-mode-options.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.gmailtrigger/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only (credentials) |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service.md | Public docs only (credentials) |
| https://developers.google.com/gmail/api/guides | Public docs only (Gmail API) |

## Wire format

- **Type string:** `n8n-nodes-base.gmailTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger node — no incoming connections)
- **Outputs:** `main` × 1
- **Credentials:** required — Google credential (`gmailOAuth2`, extending the Google OAuth2 credential)
- **Node version:** `1.0`
- **Category:** `Communication`

### Credential: `gmailOAuth2`

Google OAuth2 credential scoped to Gmail. OAuth2 is the recommended and most reliable method (the Google credentials page directs Gmail to the single-service OAuth2 flow and to enabling the Gmail API under *APIs & Services → Library*). A Google Service Account credential is technically usable for Gmail only with domain-wide delegation enabled, which must also include the Gmail API; n8n recommends OAuth2 for Gmail.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| pollTimes.mode | select | `everyX` | yes | — | How often to poll: Every Hour, Every Day, Every Week, Every Month, Every X, or Custom (cron) |
| pollTimes.minute | number | — | per mode | Every Hour / Every Day / Every Week / Every Month | Minute of the hour to poll, `0`–`59` |
| pollTimes.hour | number | — | per mode | Every Day / Every Week / Every Month | Hour of the day to poll, 24-hour `0`–`23` |
| pollTimes.weekday | select | — | per mode | Every Week | Day of the week to poll |
| pollTimes.dayOfMonth | number | — | per mode | Every Month | Day of the month to poll, `0`–`31` |
| pollTimes.value | number | — | per mode | Every X | Interval magnitude |
| pollTimes.unit | select | `minutes` | per mode | Every X | Interval unit: minutes or hours |
| pollTimes.cronExpression | string | — | per mode | Custom | Six-field cron expression (`second minute hour dayOfMonth month dayOfWeek`); the leading seconds field is optional — `30 8 4 * * *` fires daily at 04:08:30, `8 4 * * *` daily at 04:08 |
| simplify | boolean | `true` | no | — | Emit a simplified per-message object (message IDs, labels, and email headers such as From, To, CC, BCC, Subject) instead of the raw Gmail message resource |
| maxEmailsPerPoll | number | `10` | no | — | Maximum messages fetched per poll cycle (max `50`). Matching messages beyond the limit are queued and fetched on subsequent polls until drained |
| filters.includeSpamAndTrash | boolean | `false` | no | — | Whether messages in the Spam and Trash folders should also trigger |
| filters.labelIds | multi-select | `[]` | no | — | Only trigger on messages carrying the selected label(s); the dropdown populates from the credential, and label names resolve to Gmail label IDs (expressions may supply IDs directly) |
| filters.search | string | `""` | no | — | Gmail search-query syntax (e.g. `from:`) applied as an additional filter |
| filters.readStatus | select | `unreadOnly` | no | — | Unread and read emails, Unread emails only (default), or Read emails only |
| filters.sender | string | `""` | no | — | Email address or partial sender name; only messages from that sender trigger |

## Runtime behavior

### Input

None. This is a trigger node; it is activated by the workflow runtime and produces items asynchronously, never consumed from upstream nodes.

### Poll lifecycle

1. **Activation:** the node opens a Gmail API session using the configured Google credential and starts a scheduler that fires on the schedule derived from `pollTimes`. Invalid or impossible schedules surface an activation error.
2. **Each poll tick — discovery:** the node queries the Gmail API (`messages.list`) for all messages matching the active filters. The Gmail API's documented query parameters are the contract here: `labelIds` (one or more — the selected labels from `filters.labelIds`), `q` (the combined Gmail search expression built from `filters.search`, read status, and sender), `includeSpamAndTrash` (mirrors `filters.includeSpamAndTrash`), `maxResults`, and `pageToken`. Discovery must not be capped at the emission limit: it must use a raised `maxResults` and/or follow `nextPageToken` pagination until either no further pages exist or a safe discovery cap is reached, so that overflow beyond `maxEmailsPerPoll` is actually discovered.
3. **Each poll tick — emission:** the node merges the discovered message IDs with any IDs still queued from previous cycles, drops IDs already emitted in earlier cycles (deduplication), emits at most `maxEmailsPerPoll` items this cycle, and stores the unused matching IDs in the queue.
4. **Queue draining:** leftover queued IDs are re-considered on subsequent polls and emitted until drained; because each poll re-discovers the current match set, newly arrived messages are picked up alongside the queued remainder.
5. **Deactivation:** the scheduler stops and the API session is closed.

### Output

One item per new matching message, on output `main`.

**Simplified mode (`simplify: true`, default):** each item carries the message identity and its envelope headers, including the documented set (message IDs, labels, From, To, CC, BCC, Subject):

```json
{
  "id": "185f2b3c4d5e6f70",
  "threadId": "185f2b3c4d5e6f70",
  "labelIds": ["INBOX", "UNREAD"],
  "subject": "Project update",
  "from": "Ada Lovelace <ada@example.com>",
  "to": "me@example.com",
  "cc": "",
  "bcc": "",
  "date": "Mon, 1 Aug 2026 10:00:00 +0000"
}
```

**Raw mode (`simplify: false`):** each item carries the full Gmail message resource as returned by the Gmail API, including the base64 (URL-safe) encoded MIME payload.

### Error handling

- **Authentication / authorization failures** (e.g. HTTP 401 `unauthorized_client`): the credential is missing the required Gmail scope or the Gmail API is not enabled for the project. For OAuth2, the Gmail API must be enabled under *APIs & Services → Library*; for Service Account, domain-wide delegation must be enabled and the Gmail API added to it. Activation fails with a descriptive error.
- **Transient API errors** during a poll tick: the poll fails for that cycle; with `continueOnFail` the node continues scheduling and retries on the next tick.
- A poll that finds no new messages emits zero items (no error).
- `continueOnFail` applies to per-tick failures; activation-time errors (bad credential, bad schedule) cannot be bypassed by `continueOnFail`.

### Expressions

All parameter fields accept expression strings.

## Acceptance tests

### Test: simplified emission of a new message

**Given** a Gmail mailbox with one new unread message from `ada@example.com` subject `Project update`.

**Parameters:**
```json
{
  "pollTimes": { "mode": "everyX", "value": 5, "unit": "minutes" },
  "simplify": true,
  "maxEmailsPerPoll": 10,
  "filters": { "includeSpamAndTrash": false, "labelIds": [], "search": "", "readStatus": "unreadOnly", "sender": "" }
}
```

**Expect** output[0] contains exactly one item with the message identity, its `labelIds`, and envelope headers:
```json
{
  "id": "<gmail message id>",
  "threadId": "<gmail thread id>",
  "labelIds": ["INBOX", "UNREAD"],
  "subject": "Project update",
  "from": "Ada Lovelace <ada@example.com>",
  "to": "me@example.com"
}
```

Running the same poll again with no new mail in the mailbox **expects** zero items (deduplication across cycles).

### Test: raw output mode

**Parameters:** same as the simplified test but with `"simplify": false`.

**Expect** output[0] contains one item whose `json` is the raw Gmail message resource, including the base64url-encoded MIME body under the message's raw payload field.

### Test: read-status filter

**Parameters:**
```json
{
  "pollTimes": { "mode": "everyX", "value": 5, "unit": "minutes" },
  "simplify": true,
  "maxEmailsPerPoll": 10,
  "filters": { "includeSpamAndTrash": false, "labelIds": [], "search": "", "readStatus": "readOnly", "sender": "" }
}
```

**Given** the mailbox contains an unread message and a read message. **Expect** output[0] emits only the read message. The same fixture with `readStatus: "unreadOnly"` emits only the unread message.

### Test: max emails per poll queues overflow

**Parameters:** same as the simplified test with `"maxEmailsPerPoll": 10` and a mailbox containing 25 new matching unread messages.

**Expect** the first poll emits 10 items; subsequent polls continue emitting the queued remainder until all 25 have been emitted exactly once across cycles, with no duplicates between cycles.

### Test: sender and label filtering

**Parameters:**
```json
{
  "pollTimes": { "mode": "everyX", "value": 5, "unit": "minutes" },
  "simplify": true,
  "maxEmailsPerPoll": 10,
  "filters": { "includeSpamAndTrash": false, "labelIds": ["Label_1"], "search": "from:ada@example.com", "readStatus": "unreadOnly", "sender": "ada@example.com" }
}
```

**Given** an unread message from `ada@example.com` labeled `Label_1`, and an unread message from another sender without the label. **Expect** output[0] contains exactly one item (the first message); a mailbox with only a spam-folder message **expects** zero items with `includeSpamAndTrash: false`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, category, node version | documented | Confirmed from corpus package metadata (`n8n-nodes-base.gmailTrigger`, v1.0, Communication) |
| Event ("Message Received") and polling model | documented | Docs: triggers for new messages at the selected Poll Time |
| Poll mode options and schedule fields | documented | Public poll-mode-options page enumerates all modes and their fields, including optional cron seconds |
| Simplify output semantics | documented | Docs: simplified returns message IDs, labels, and headers incl. From, To, CC, BCC, Subject |
| Max Emails per Poll default/max and queuing | documented | Docs: default 10, max 50, overflow queued to next poll |
| Filters (labels, search, read status, sender, spam/trash) | documented | Public node-parameters page lists each filter's purpose |
| Gmail search syntax reuse | documented | Docs link to Gmail refine-search help (`from:` style queries) |
| Credential (OAuth2, service account caveat) | documented | Google credentials page; `gmailOAuth2` scope string confirmed from corpus metadata |
| 401 / scope troubleshooting | documented | Common-issues page: enable Gmail API, domain-wide delegation |
| Exact key names of the simplified output | inferred | Docs describe semantics (ID, labels, From/To/CC/BCC/Subject); concrete key names are a clean-room abstraction |
| Raw output shape | inferred | Gmail API message resource; `raw` base64 payload implied by API contract |
| "New message" deduplication mechanism | inferred | Docs specify new-message triggering; cross-cycle state tracking is a clean-room abstraction |
| Poll API surface (users.messages.list with query) | inferred | Consistent with Gmail API and documented search syntax |
| Manual-trigger single-shot behavior | inferred | Standard n8n polling-trigger pattern |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/gmail-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Polling trigger. The executor must schedule polls from `pollTimes`, authenticate with the `gmailOAuth2` Google credential, query the Gmail API for matching messages (applying `includeSpamAndTrash` on the list call), apply per-cycle deduplication (persisted between cycles so a message is emitted once), enforce `maxEmailsPerPoll` with overflow queuing, and shape the output per the `simplify` flag. Requires a Gmail API client and access to the credential scopes.
