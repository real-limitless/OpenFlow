---
type: n8n-nodes-base.emailReadImap
displayName: Email Trigger (IMAP)
category: Communication
versions: [1, 2, 2.1]
priority: medium
status: specced
---

# Email Trigger (IMAP)

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.emailimap/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/imap/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.emailReadImap`
- **Aliases:** (none)
- **Category:** Communication, Core Nodes
- **Subcategory:** Other Trigger Nodes
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `imap` (required, tested by `imapConnectionTest`)

## Parameters

A polling-based trigger that connects to an IMAP mailbox and emits one output item per unseen email.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `mailbox` | string | `INBOX` | no | Mail folder name to poll |
| `postProcessAction` | options | `read` | no | `read` — mark fetched emails as read; `nothing` — leave unread |
| `downloadAttachments` | boolean | `false` | no | Whether to download binary attachment data (increases processing cost) |
| `format` | options | `simple` | no | Output format: `raw` (base64url-encoded raw RFC 2822 message), `resolved` (full parsed email with binary attachments), `simple` (full parsed email without inline-attachment binary data) |
| `dataPropertyAttachmentsPrefixName` | string | `attachment_` | no | Prefix used when naming binary attachment properties in the output item |

### Options (collection)

| name | type | default | notes |
|------|------|---------|-------|
| `customEmailConfig` | string | — | IMAP search query criteria (node-imap search function syntax) for filtering which emails to fetch |
| `forceReconnect` | number | — | Interval in minutes after which the IMAP connection is force-reconnected |
| `trackLastMessageId` | boolean | — | When enabled, only fetches emails whose UID is greater than the last seen UID (incremental fetch) |

### Credential (imap)

| name | type | default | notes |
|------|------|---------|-------|
| `user` | string | — | Email address |
| `password` | string (password) | — | Email password or app password |
| `host` | string | — | IMAP server hostname |
| `port` | number | `993` | IMAP server port |
| `secure` | boolean | `true` | Whether to use SSL/TLS |
| `allowUnauthorizedCerts` | boolean | `false` | Whether to allow self-signed certificates |

## Runtime behavior

### Trigger lifecycle

The node is a polling trigger. On each poll cycle it connects to the configured IMAP mailbox using the imap credential, searches for unseen (or new, if `trackLastMessageId` is set) emails, parses each matching message, and emits one output item per email.

### Output shape

Each output item contains email metadata as JSON and optional binary data for attachments:

- `json.subject` — email subject line
- `json.from` — sender address
- `json.to` — recipient address(es)
- `json.date` — send date
- `json.text` — plaintext body (when format is not `raw`)
- `json.html` — HTML body (when format is not `raw`)
- `json.messageId` — RFC 2822 Message-ID header
- `json.mailbox` — source mailbox name
- `json.size` — message size in bytes
- `binary` — attachment binary data, keyed by the `dataPropertyAttachmentsPrefixName` prefix (e.g. `attachment_0`, `attachment_1`)

In `raw` format, `json.raw` contains the full base64url-encoded raw message instead of the parsed body fields.

### Error handling

- Connection failures (wrong host/port/credentials) throw an error; the workflow run fails unless `continueOnFail` is set, in which case the error is emitted as a single output item with a `json.error` property.
- `continueOnFail` is supported and follows the standard trigger continue-on-fail contract.
- Parsing errors on individual messages should not abort the entire poll; affected messages should either be skipped or emitted with an error annotation.

### Expressions

Parameters `mailbox`, `customEmailConfig`, and `dataPropertyAttachmentsPrefixName` accept expressions.

## Acceptance tests

### Test: basic poll — simple format, mark as read

**Given** an IMAP credential pointing to a test mailbox with a single unseen email (subject "Hello", body "World").

**Parameters:**
```json
{
  "mailbox": "INBOX",
  "postProcessAction": "read",
  "format": "simple",
  "downloadAttachments": false
}
```

**Expect** output[0] to contain one item with `json.subject === "Hello"`, `json.text === "World"`, no `binary` key, and the email is marked as read on the server after fetch.

### Test: poll with attachment download

**Given** a test mailbox with an email containing one file attachment.

**Parameters:**
```json
{
  "mailbox": "INBOX",
  "postProcessAction": "nothing",
  "format": "resolved",
  "downloadAttachments": true,
  "dataPropertyAttachmentsPrefixName": "attachment_"
}
```

**Expect** output[0] to have one item with `binary.attachment_0` containing the attachment data and `json.attachment_0` containing attachment metadata (filename, mimeType, size).

### Test: raw format output

**Given** a test mailbox with one unseen email.

**Parameters:**
```json
{
  "mailbox": "INBOX",
  "format": "raw"
}
```

**Expect** output[0] to have one item where `json.raw` is a non-empty base64url-encoded string and no `json.text` or `json.html` fields are present.

### Test: no emails — empty poll

**Given** a test mailbox with no unseen emails.

**Parameters:**
```json
{
  "mailbox": "INBOX"
}
```

**Expect** no output items are emitted (the trigger yields an empty batch).

### Test: custom email rule filtering

**Given** a test mailbox with multiple unseen emails, only one of which matches a custom IMAP search criterion (e.g. FROM "sender@example.com").

**Parameters:**
```json
{
  "mailbox": "INBOX",
  "options": {
    "customEmailConfig": "UNSEEN FROM \"sender@example.com\""
  }
}
```

**Expect** only the matching email is emitted.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Polling interval / schedule | inferred | The trigger polls at the workflow's configured interval; exact mechanism is engine-defined |
| Output field names (subject, from, etc.) | inferred from format descriptions | Field names are standard RFC 2822 headers; exact casing/spelling may vary by implementation |
| `trackLastMessageId` behavior | inferred from name + descriptor | Incremental UID tracking typical of IMAP polling triggers |
| `customEmailConfig` syntax | documented via node-imap reference | Delegates to node-imap's search function; exact syntax may vary |
| Connection test | documented | Credential includes `imapConnectionTest` method |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/email-read-imap.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only