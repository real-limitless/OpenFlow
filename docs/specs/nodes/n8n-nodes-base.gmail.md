---
type: n8n-nodes-base.gmail
displayName: Gmail
category: Communication
versions: [1, 2]
priority: high
status: specced
---

# Gmail

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.gmail`
- **Aliases:** `email`, `human`, `form`, `wait`, `hitl`, `approval`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `gmailOAuth2` (OAuth2, recommended), `googleApi` (Service Account)
- **Subtype:** `action` (regular node)
- **Version policy:** v1 (legacy) and v2 (current, versions 2, 2.1, 2.2)

> **Note:** The Gmail Trigger is a separate node type (`n8n-nodes-base.gmailTrigger`) with its own spec. This spec covers the action node only.

## Parameters

### Global

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `oAuth2` | yes | — | Options: `oAuth2` (OAuth2), `serviceAccount` (Service Account) |
| resource | options | `message` | yes | — | Options: `message`, `label`, `draft`, `thread` |

### Resource: message

#### Operations

| operation | value | action |
|-----------|-------|--------|
| Send | `send` | Send a message |
| Send and Wait for Response | `sendAndWait` | Send message and wait for response (HITL) |
| Get | `get` | Get a message |
| Get Many | `getAll` | Get many messages |
| Delete | `delete` | Delete a message |
| Mark as Read | `markAsRead` | Mark a message as read |
| Mark as Unread | `markAsUnread` | Mark a message as unread |
| Reply | `reply` | Reply to a message |
| Add Label | `addLabels` | Add label to message |
| Remove Label | `removeLabels` | Remove label from message |

#### Fields by operation

**send**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| sendTo | string | `''` | yes | resource=message, operation=send | Recipient emails, comma-separated |
| subject | string | `''` | yes | resource=message, operation=send | Email subject |
| emailType | options | `html` | yes | resource=message, operation=send, @version!=2 | Options: `text`, `html` |
| emailType | options | `html` | yes | resource=message, operation=send, @version=2 | Options: `text`, `html` |
| message | string | `''` | yes | resource=message, operation=send | Email body (text or HTML) |
| options | collection | `{}` | no | resource=message, operation=send | See options below |

**send options collection:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| appendAttribution | boolean | `true` (v2.1+) | no | Append "sent automatically with n8n" |
| attachmentsUi | fixedCollection | `{}` | no | Binary attachments from input items |
| bccList | string | `''` | no | BCC recipients, comma-separated |
| ccList | string | `''` | no | CC recipients, comma-separated |
| senderName | string | `''` | no | Display name in recipient inbox |
| replyTo | string | `''` | no | Reply-to email address |

**sendAndWait** (HITL)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| sendTo | string | `''` | yes | resource=message, operation=sendAndWait | Recipient emails, comma-separated |

> The `sendAndWait` operation sends the email then pauses execution via webhook until a reply is received or timeout. Uses `sendAndWaitWebhook` internally.

**get**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| messageId | string | `''` | yes | resource=message, operation=get | Gmail message ID |
| simple | boolean | `true` | no | resource=message, operation=get | Return simplified vs raw |
| options | collection | `{}` | no | resource=message, operation=get, simple=false | See options below |

**get options collection (when simple=false):**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataPropertyAttachmentsPrefixName | string | `attachment_` | no | Binary property prefix for attachments |
| downloadAttachments | boolean | `false` | no | Download attachments to binary data |

**getAll**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | `false` | no | resource=message, operation=getAll | Return all vs limit |
| limit | number | `50` | no | resource=message, operation=getAll, returnAll=false | Max results (1-500) |
| simple | boolean | `true` | no | resource=message, operation=getAll | Return simplified vs raw |
| filters | collection | `{}` | no | resource=message, operation=getAll | See filters below |
| options | collection | `{}` | no | resource=message, operation=getAll, simple=false | Same as get options |

**getAll filters collection:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| includeSpamTrash | boolean | `false` | no | Include SPAM/TRASH |
| labelIds | multiOptions | `[]` | no | Filter by label IDs (loadOptions: getLabels) |
| q | string | `''` | no | Gmail search query (e.g. `has:attachment`) |
| readStatus | options | `unread` | no | Options: `both`, `unread`, `read` |
| receivedAfter | dateTime | `''` | no | ISO date or timestamp |
| receivedBefore | dateTime | `''` | no | ISO date or timestamp |
| sender | string | `''` | no | Sender name/email filter |

**delete**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| messageId | string | `''` | yes | resource=message, operation=delete | Gmail message ID |

**markAsRead**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| messageId | string | `''` | yes | resource=message, operation=markAsRead | Gmail message ID |

**markAsUnread**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| messageId | string | `''` | yes | resource=message, operation=markAsUnread | Gmail message ID |

**reply**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| messageId | string | `''` | yes | resource=message, operation=reply | Gmail message ID |
| emailType | options | `text` | yes | resource=message, operation=reply | Options: `text`, `html` |
| message | string | `''` | yes | resource=message, operation=reply | Reply body |
| options | collection | `{}` | no | resource=message, operation=reply | See reply options below |

**reply options collection:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| attachmentsUi | fixedCollection | `{}` | no | Binary attachments |
| bccList | string | `''` | no | BCC recipients |
| ccList | string | `''` | no | CC recipients |
| senderName | string | `''` | no | Display name |
| replyToSenderOnly | boolean | `false` | no | Reply to sender only |

**addLabels / removeLabels**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| messageId | string | `''` | yes | resource=message, operation=addLabels/removeLabels | Gmail message ID |
| labelIds | multiOptions | `[]` | yes | resource=message, operation=addLabels/removeLabels | Label IDs (loadOptions: getLabels) |

### Resource: label

#### Operations

| operation | value | action |
|-----------|-------|--------|
| Create | `create` | Create a label |
| Delete | `delete` | Delete a label |
| Get | `get` | Get a label info |
| Get Many | `getAll` | Get many labels |

#### Fields by operation

**create**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| name | string | `''` | yes | resource=label, operation=create | Label name |
| options | collection | `{}` | no | resource=label, operation=create | See options below |

**create options collection:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| labelListVisibility | options | `labelShow` | no | Options: `labelHide`, `labelShow`, `labelShowIfUnread` |
| messageListVisibility | options | `show` | no | Options: `hide`, `show` |

**get / delete**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| labelId | string | `''` | yes | resource=label, operation=get/delete | Label ID |

**getAll**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | `false` | no | resource=label, operation=getAll | Return all vs limit |
| limit | number | `50` | no | resource=label, operation=getAll, returnAll=false | Max results (1-500) |

### Resource: draft

#### Operations

| operation | value | action |
|-----------|-------|--------|
| Create | `create` | Create a draft |
| Delete | `delete` | Delete a draft |
| Get | `get` | Get a draft |
| Get Many | `getAll` | Get many drafts |

#### Fields by operation

**create**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| subject | string | `''` | yes | resource=draft, operation=create | Email subject |
| emailType | options | `text` | yes | resource=draft, operation=create | Options: `text`, `html` |
| message | string | `''` | yes | resource=draft, operation=create | Email body |
| options | collection | `{}` | no | resource=draft, operation=create | See options below |

**create options collection:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| attachmentsUi | fixedCollection | `{}` | no | Binary attachments |
| bccList | string | `''` | no | BCC recipients |
| ccList | string | `''` | no | CC recipients |
| fromAlias | options | `''` | no | Sender alias (loadOptions: getGmailAliases) |
| replyTo | string | `''` | no | Reply-to email |
| threadId | string | `''` | no | Thread ID to attach draft |
| sendTo | string | `''` | no | To recipients, comma-separated |

**get**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| messageId | string | `''` | yes | resource=draft, operation=get | Draft ID |
| options | collection | `{}` | no | resource=draft, operation=get | See options below |

**get options collection:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataPropertyAttachmentsPrefixName | string | `attachment_` | no | Binary property prefix |
| downloadAttachments | boolean | `false` | no | Download attachments |

**delete**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| messageId | string | `''` | yes | resource=draft, operation=delete | Draft ID |

**getAll**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | `false` | no | resource=draft, operation=getAll | Return all vs limit |
| limit | number | `50` | no | resource=draft, operation=getAll, returnAll=false | Max results (1-500) |
| options | collection | `{}` | no | resource=draft, operation=getAll | See options below |

**getAll options collection:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataPropertyAttachmentsPrefixName | string | `attachment_` | no | Binary property prefix |
| downloadAttachments | boolean | `false` | no | Download attachments |
| includeSpamTrash | boolean | `false` | no | Include SPAM/TRASH |

### Resource: thread

#### Operations

| operation | value | action |
|-----------|-------|--------|
| Get | `get` | Get a thread |
| Get Many | `getAll` | Get many threads |
| Delete | `delete` | Delete a thread |
| Trash | `trash` | Trash a thread |
| Untrash | `untrash` | Untrash a thread |
| Reply | `reply` | Reply to a message in thread |
| Add Label | `addLabels` | Add label to thread |
| Remove Label | `removeLabels` | Remove label from thread |

#### Fields by operation

**get**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| threadId | string | `''` | yes | resource=thread, operation=get | Thread ID |
| simple | boolean | `true` | no | resource=thread, operation=get | Return simplified vs raw |
| options | collection | `{}` | no | resource=thread, operation=get | See options below |

**get options collection:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| returnOnlyMessages | boolean | `true` | no | Return only messages array |

**getAll**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | `false` | no | resource=thread, operation=getAll | Return all vs limit |
| limit | number | `50` | no | resource=thread, operation=getAll, returnAll=false | Max results (1-500) |
| filters | collection | `{}` | no | resource=thread, operation=getAll | See filters below |

**getAll filters collection:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| includeSpamTrash | boolean | `false` | no | Include SPAM/TRASH |
| labelIds | multiOptions | `[]` | no | Filter by label IDs (loadOptions: getLabels) |
| q | string | `''` | no | Gmail search query |
| readStatus | options | `unread` | no | Options: `both`, `unread`, `read` |
| receivedAfter | dateTime | `''` | no | ISO date or timestamp |
| receivedBefore | dateTime | `''` | no | ISO date or timestamp |

**delete / trash / untrash**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| threadId | string | `''` | yes | resource=thread, operation=delete/trash/untrash | Thread ID |

**reply**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| threadId | string | `''` | yes | resource=thread, operation=reply | Thread ID |
| messageId | options | `''` | yes | resource=thread, operation=reply | Message to reply to (loadOptions: getThreadMessages, dependsOn: threadId) |
| emailType | options | `text` | yes | resource=thread, operation=reply | Options: `text`, `html` |
| message | string | `''` | yes | resource=thread, operation=reply | Reply body |
| options | collection | `{}` | no | resource=thread, operation=reply | See reply options below |

**reply options collection:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| attachmentsUi | fixedCollection | `{}` | no | Binary attachments |
| bccList | string | `''` | no | BCC recipients |
| ccList | string | `''` | no | CC recipients |
| senderName | string | `''` | no | Display name |
| replyToSenderOnly | boolean | `false` | no | Reply to sender only |
| replyToRecipientsOnly | boolean | `false` | no | Reply to recipients only (exclude sender) |

**addLabels / removeLabels**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| threadId | string | `''` | yes | resource=thread, operation=addLabels/removeLabels | Thread ID |
| labelIds | multiOptions | `[]` | yes | resource=thread, operation=addLabels/removeLabels | Label IDs (loadOptions: getLabels) |

## Runtime behavior

### Input

Consumes items on `main` input (0 or more). Each item may provide binary data for attachments via the `attachmentsUi` option (references binary property names from input items).

### Output

Produces items on `main` output. Output shape varies by operation:

- **send**: Returns the sent message object (id, threadId, labelIds, etc.)
- **sendAndWait**: Returns the input items unchanged; execution pauses until webhook receives reply or times out
- **get**: Returns single message object (simplified or raw with optional binary attachments)
- **getAll**: Returns array of message objects
- **delete/markAsRead/markAsUnread**: Returns `{ success: true }`
- **reply**: Returns the sent reply message object
- **addLabels/removeLabels**: Returns the modified message/thread object
- **label operations**: Returns label objects (id, name, type, visibility settings)
- **draft operations**: Returns draft objects (id, messageId, message with raw email)
- **thread get**: Returns thread object with messages (simplified or full)
- **thread getAll**: Returns array of thread objects
- **thread delete/trash/untrash**: Returns `{ success: true }` or thread object

When `simple=true` (default for get/getAll), output is simplified to common fields: id, threadId, from, to, subject, date, snippet, body. When `simple=false`, raw Gmail API response is returned with optional binary attachments downloaded to properties prefixed by `dataPropertyAttachmentsPrefixName`.

### Errors

- Throws `NodeOperationError` on API failures (auth expired, invalid IDs, rate limits, etc.)
- `continueOnFail` supported: on failure, outputs `[{ json: { error: string }, pairedItem: { item: index } }]` for the failed item and continues
- Invalid messageId/threadId/labelId/draftId → 404 from Gmail API → error
- Missing required parameters → validation error before execution
- OAuth2 token refresh handled by credentials layer; expired tokens → auth error

### Expressions

All string parameters support expressions (`{{ ... }}`). Notably:
- `sendTo`, `ccList`, `bccList`, `replyTo`, `subject`, `message` — full expression support
- `q` (search query) — expression support for dynamic filters
- `labelIds` (multiOptions) — can use expressions to specify IDs dynamically
- `threadId`, `messageId`, `labelId`, `draftId` — expression support
- `receivedAfter`, `receivedBefore` — ISO date strings or timestamps from expressions
- Binary property references in `attachmentsUi.property` — expression support

### Load options methods

The node provides three load-options methods for dynamic dropdowns:
- `getLabels` — fetches user's Gmail labels for labelId/labelIds fields
- `getThreadMessages` — fetches message snippets/IDs for a given threadId (used in thread:reply)
- `getGmailAliases` — fetches verified send-as aliases for draft:create fromAlias

### Version differences

- **v1** (legacy): Basic message send/get, fewer options
- **v2** (versions 2, 2.1, 2.2): Current. Adds:
  - `sendAndWait` operation (HITL)
  - `replyToSenderOnly`, `replyToRecipientsOnly` options
  - `appendAttribution` default true (v2.1+)
  - Improved attachment handling
  - `simple` parameter defaults to true
  - `emailType` default changed to `html` for send, `text` for draft/reply

## Acceptance tests

### Test: message:send basic

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "send",
  "sendTo": "recipient@example.com",
  "subject": "Test from n8n",
  "emailType": "text",
  "message": "Hello world"
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "msg-id", "threadId": "thread-id", "labelIds": ["SENT"] } }]
```

### Test: message:send with attachments

**Given** input items:
```json
[{ "json": {}, "binary": { "data": { "mimeType": "text/plain", "fileName": "test.txt", "fileSize": 12 } } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "send",
  "sendTo": "recipient@example.com",
  "subject": "With attachment",
  "emailType": "text",
  "message": "See attached",
  "options": {
    "attachmentsUi": {
      "attachmentsBinary": [{ "property": "data" }]
    }
  }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "msg-id", "threadId": "thread-id", "labelIds": ["SENT"] } }]
```

### Test: message:get simple

**Given** input items:
```json
[{ "json": { "messageId": "172ce2c4a72cc243" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "get",
  "messageId": "={{ $json.messageId }}",
  "simple": true
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "172ce2c4a72cc243", "threadId": "thread-id", "from": "sender@example.com", "to": "me@example.com", "subject": "Test", "date": "2024-01-01T00:00:00.000Z", "snippet": "Hello", "body": "Hello world" } }]
```

### Test: message:getAll with filters

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10,
  "simple": true,
  "filters": {
    "q": "has:attachment",
    "readStatus": "unread",
    "labelIds": ["INBOX"]
  }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "msg-1", "threadId": "t1", "subject": "Has attachment", "hasAttachments": true } }, { "json": { "id": "msg-2", "threadId": "t2", "subject": "Another", "hasAttachments": true } }]
```

### Test: label:create

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "label",
  "operation": "create",
  "name": "Invoices",
  "options": {
    "labelListVisibility": "labelShow",
    "messageListVisibility": "show"
  }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "Label_123", "name": "Invoices", "type": "user", "labelListVisibility": "labelShow", "messageListVisibility": "show" } }]
```

### Test: draft:create with threadId

**Given** input items:
```json
[{ "json": { "threadId": "18cc573e2431878f" } }]
```

**Parameters:**
```json
{
  "resource": "draft",
  "operation": "create",
  "subject": "Re: Your email",
  "emailType": "html",
  "message": "<p>Thanks for your email</p>",
  "options": {
    "threadId": "={{ $json.threadId }}",
    "sendTo": "sender@example.com"
  }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "draft-id", "messageId": "msg-id", "message": { "threadId": "18cc573e2431878f" } } }]
```

### Test: thread:reply

**Given** input items:
```json
[{ "json": { "threadId": "18cc573e2431878f", "messageId": "msg-123" } }]
```

**Parameters:**
```json
{
  "resource": "thread",
  "operation": "reply",
  "threadId": "={{ $json.threadId }}",
  "messageId": "={{ $json.messageId }}",
  "emailType": "text",
  "message": "Thanks for the info",
  "options": {
    "replyToSenderOnly": true
  }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "reply-msg-id", "threadId": "18cc573e2431878f", "labelIds": ["SENT"] } }]
```

### Test: sendAndWait (HITL)

**Given** input items:
```json
[{ "json": { "replyTo": "user@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "sendAndWait",
  "sendTo": "={{ $json.replyTo }}",
  "subject": "Please confirm",
  "emailType": "text",
  "message": "Reply YES to confirm"
}
```

**Expect** output[0]:
```json
[{ "json": { "replyTo": "user@example.com" } }]
```
> Note: Execution pauses at this node. On webhook callback with reply, workflow resumes with original input items.

### Test: continueOnFail on invalid messageId

**Given** input items:
```json
[{ "json": { "messageId": "invalid" } }, { "json": { "messageId": "valid-id" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "get",
  "messageId": "={{ $json.messageId }}",
  "simple": true
}
```
Node option: `continueOnFail: true`

**Expect** output[0]:
```json
[
  { "json": { "error": "Request failed with status code 404" }, "pairedItem": { "item": 0 } },
  { "json": { "id": "valid-id", "subject": "Valid message" } }
]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| sendAndWait webhook timeout | inferred | Docs mention "wait for response" but exact timeout duration not specified; likely configurable via waitTillDate |
| sendAndWait reply matching | inferred | How reply is correlated to sent message (threadId? In-Reply-To header?) not fully documented |
| Binary attachment size limits | inferred | Gmail API has 25MB/message limit; node behavior at limit not documented |
| Rate limit handling | inferred | Gmail API quotas apply; node may surface 429 errors |
| Service Account impersonation | documented | Requires domain-wide delegation; `googleApi` credential used |
| Simplified output field set | inferred | Exact fields in `simple=true` mode: id, threadId, from, to, cc, bcc, subject, date, snippet, body, labelIds, hasAttachments |
| Draft threadId association | documented | Uses `addThreadHeadersToEmail` to add In-Reply-To/References headers |
| Gmail alias load options | documented | Fetches from `/gmail/v1/users/me/settings/sendAs` |
| Label visibility enums | documented | `labelHide`, `labelShow`, `labelShowIfUnread` for labelListVisibility; `hide`, `show` for messageListVisibility |

## OpenFlow mapping

- **Definition group:** `transform` (app node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.gmail.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `gmailOAuth2` (extends `googleOAuth2Api`), `googleApi`
- **Load options:** `getLabels`, `getThreadMessages`, `getGmailAliases`
- **Webhook:** `sendAndWaitWebhook` (for HITL sendAndWait operation)