---
type: n8n-nodes-base.sendGrid
displayName: SendGrid
category: Communication
versions: [1]
priority: medium
status: specced
---

# SendGrid

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sendgrid.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/sendgrid.md | Public docs only |
| https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send | Public API docs only |
| https://www.twilio.com/docs/sendgrid/api-reference/contacts/add-or-update-a-contact | Public API docs only |
| https://www.twilio.com/docs/sendgrid/api-reference/contacts/delete-contacts | Public API docs only |
| https://www.twilio.com/docs/sendgrid/api-reference/lists/create-list | Public API docs only |
| https://www.twilio.com/docs/sendgrid/api-reference/lists/get-all-lists | Public API docs only |
| https://www.twilio.com/docs/sendgrid/api-reference/lists/delete-a-list | Public API docs only |
| https://www.twilio.com/docs/sendgrid/api-reference/lists/update-list | Public API docs only |
| n8n-nodes-base descriptor metadata (v2.15.1) under /tmp isolation | Public descriptor metadata |

> Note: the literal corpus URL `n8n-nodes-base.sendGrid.md` is a 404; the
> canonical docs page is the lowercase `n8n-nodes-base.sendgrid.md` under
> `builtin/app-nodes/`.

## Wire format

- **Type string:** `n8n-nodes-base.sendGrid`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `sendGridApi` (required) — single `apiKey` string (Twilio SendGrid v3 API key)
- **Group:** `transform`
- **Subtitle:** `={{$parameter["operation"] + ":" + $parameter["resource"]}}`
- **Usable as AI tool:** yes

## External service contract (SendGrid v3 API)

Base URL `https://api.sendgrid.com/v3` (EU subusers: `https://api.eu.sendgrid.com`).
All requests send `Authorization: Bearer <apiKey>` and JSON request bodies.

| Operation | Endpoint | Method | Success status |
|-----------|----------|--------|----------------|
| Mail — send | `/mail/send` | POST | 202 (empty body) |
| Contact — upsert | `/marketing/contacts` | PUT | 202 `{ job_id }` (async) |
| Contact — delete | `/marketing/contacts` | DELETE | 202 `{ job_id }` or 204 |
| Contact — get | `/marketing/contacts/{id}` | GET | 200 |
| Contact — getAll | `/marketing/contacts` | GET | 200 `{ result, _metadata }` |
| List — create | `/marketing/lists` | POST | 201 |
| List — get | `/marketing/lists/{id}` | GET | 200 |
| List — getAll | `/marketing/lists` | GET | 200 `{ result, _metadata }` |
| List — update | `/marketing/lists/{id}` | PATCH | 200 |
| List — delete | `/marketing/lists/{id}` | DELETE | 204 or 202 `{ job_id }` |

Errors are JSON `{ errors: [{ field, message }] }` with 4xx/5xx status.

## Parameters

### Common fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | options | `list` | yes | — | Options: `contact`, `list`, `mail` |
| `operation` | options | — | yes | depends on `resource` | See per-resource tables below |

### Resource: `contact`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `upsert` | yes | `resource:contact` | Options: `upsert`, `delete`, `get`, `getAll` |
| `email` | string | `''` | yes | `operation:upsert` | Primary contact email (identifier) |
| `additionalFields` | collection | `{}` | no | `operation:upsert` | Contact attributes: `first_name`, `last_name`, `city`, `country`, `postal_code`, `state_province_region`, `address_line_1`, `address_line_2`, `alternate_emails`, `custom_fields` (custom field IDs → values). Also list IDs to add the contact to. |
| `contactId` | string | `''` | yes | `operation:get` | Contact ID |
| `by` | options | — | yes | `operation:delete` | Selector: `ids` (comma-separated contact IDs) or `deleteAll` |
| `ids` | string | `''` | no | `operation:delete`, `by:ids` | Comma-separated list of contact IDs to delete |
| `deleteAll` | boolean | `false` | no | `operation:delete`, `by:deleteAll` | Delete all contacts in the account |
| `returnAll` | boolean | `false` | no | `operation:getAll` | Fetch all pages vs cap at `limit` |
| `limit` | number | `50` | no | `operation:getAll`, `returnAll:false` | Max results (API max page size 1000) |

### Resource: `list`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `create` | yes | `resource:list` | Options: `create`, `delete`, `get`, `getAll`, `update` |
| `name` | string | `''` | yes | `operation:create\|update` | List name |
| `listId` | string | `''` | yes | `operation:get\|update\|delete` | List UUID |
| `deleteContacts` | boolean | `false` | no | `operation:delete` | Also delete the contacts on the list (async) |
| `returnAll` | boolean | `false` | no | `operation:getAll` | Fetch all pages vs cap at `limit` |
| `limit` | number | `50` | no | `operation:getAll`, `returnAll:false` | Max results (API max page size 1000) |

### Resource: `mail`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `send` | yes | `resource:mail` | Options: `send` |
| `fromEmail` | string | `''` | no | `operation:send` | Verified sender address (API requires `from`) |
| `fromName` | string | `''` | no | `operation:send` | Sender display name |
| `toEmail` | string | `''` | no | `operation:send` | Recipient address (becomes a `personalizations[].to` entry) |
| `subject` | string | `''` | no | `operation:send` | Message subject |
| `contentType` | options | `text` | no | `operation:send` | Body MIME type: `text` (text/plain) or `html` (text/html) |
| `contentValue` | string | `''` | yes | `operation:send` | Message body for the selected MIME type |
| `dynamicTemplate` | boolean | `false` | yes | `operation:send` | Whether to use a SendGrid (dynamic) template |
| `templateId` | options | `''` | no | `operation:send`, `dynamicTemplate:true` | Template ID (`d-…`) |
| `dynamicTemplateFields` | fixedCollection | `{}` | no | `operation:send`, `dynamicTemplate:true` | Key/value pairs merged into `personalizations[].dynamic_template_data` |
| `additionalFields` | collection | `{}` | no | `operation:send` | See mail additional fields below |

#### `mail` additional fields

SendGrid Mail Send supports `cc`/`bcc`, `replyTo`, `attachments` (base64 content, filename, mime type, disposition), `headers`, `categories`, `sendAt`, `batchId`, `asm` (suppression group), `ipPoolName`, `mailSettings` (sandbox mode, footer, bypass suppressions), `trackingSettings` (open/click/subscription tracking). The node should expose a practical subset at outcome level; see Gaps.

## Runtime behavior

### Input

Consumes items on `main` input (0-indexed). Each item is processed
independently. Strings and numbers accept expressions (`{{ ... }}` / `=…`).
For `getAll`, one request is made per input item unless the operation is
expression-driven per item.

### Output

Each input item yields one output item on `main` whose `json` holds the parsed
SendGrid API response body (e.g. list object, contact object, `{ result, _metadata }`
for getAll, `{ job_id }` for async ops). For `mail/send` the API returns an empty
202 body; the node emits an item indicating the accepted send (e.g. `{ success: true }`
plus any useful response header such as `X-Message-Id` if surfaced). `getAll`
with `returnAll: true` follows `_metadata.next` links and emits one item per
record.

### Errors

- Throws on HTTP 4xx/5xx with the API error message (and field when available).
- Respects `continueOnFail`: on failure returns the error in `json.error` for
  that item instead of throwing.
- Upsert / delete responses are asynchronous (`job_id`); success does not mean
  the contact was already indexed.

### Expressions

All string, number, and boolean parameters accept expressions.

## Acceptance tests

### Test: Mail — send a simple email

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "mail",
  "operation": "send",
  "fromEmail": "orders@example.com",
  "fromName": "Example Orders",
  "toEmail": "alex@example.com",
  "subject": "Your order",
  "contentType": "text",
  "contentValue": "Hello Alex!",
  "dynamicTemplate": false
}
```

**Expect** a single `POST https://api.sendgrid.com/v3/mail/send` with body
(assert the HTTP contract; exact shape of emitted item may vary):
```json
{
  "personalizations": [{ "to": [{ "email": "alex@example.com" }] }],
  "from": { "email": "orders@example.com", "name": "Example Orders" },
  "subject": "Your order",
  "content": [{ "type": "text/plain", "value": "Hello Alex!" }]
}
```

**Expect** output[0] to signal success:
```json
[{ "json": { "success": true } }]
```

### Test: Mail — send with dynamic template

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "mail",
  "operation": "send",
  "fromEmail": "orders@example.com",
  "toEmail": "alex@example.com",
  "dynamicTemplate": true,
  "templateId": "d-123abc456def789hij0klm123nop456qrs789tuv0xyz",
  "dynamicTemplateFields": { "values": { "customer_name": "Alex", "confirmation_number": "123456" } }
}
```

**Expect** request body carries the template id and per-recipient data:
```json
{
  "personalizations": [{
    "to": [{ "email": "alex@example.com" }],
    "dynamic_template_data": { "customer_name": "Alex", "confirmation_number": "123456" }
  }],
  "from": { "email": "orders@example.com" },
  "template_id": "d-123abc456def789hij0klm123nop456qrs789tuv0xyz"
}
```

### Test: Contact — upsert a contact

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "upsert",
  "email": "alex@example.com",
  "additionalFields": {
    "first_name": "Alex",
    "last_name": "Bloggs",
    "city": "Port Douglas"
  }
}
```

**Expect** `PUT https://api.sendgrid.com/v3/marketing/contacts` with body
containing a `contacts` array (each entry carries the identifier plus the
additional fields) and an optional `list_ids` array:
```json
{
  "contacts": [{
    "email": "alex@example.com",
    "first_name": "Alex",
    "last_name": "Bloggs",
    "city": "Port Douglas"
  }]
}
```

**Expect** output[0] carries the accepted/queued response:
```json
[{ "json": { "job_id": "abc12312-x3y4-1234-abcd-123qwe456rty" } }]
```

### Test: List — create and getAll

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "list",
  "operation": "create",
  "name": "Newsletter"
}
```

**Expect** `POST https://api.sendgrid.com/v3/marketing/lists` body `{ "name": "Newsletter" }`,
output[0] reflects the created list:
```json
[{
  "json": {
    "id": "ca7a3796-e8a8-4029-9ccb-df8937940562",
    "name": "Newsletter",
    "contact_count": 0
  }
}]
```

**getAll variant:** with `resource:list`, `operation:getAll`, `returnAll:false`,
`limit:2` and a stubbed response of 3 lists, output must contain exactly 2 items
emitted from `result`.

### Test: List — delete a list without deleting contacts

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "list",
  "operation": "delete",
  "listId": "ca7a3796-e8a8-4029-9ccb-df8937940562",
  "deleteContacts": false
}
```

**Expect** `DELETE https://api.sendgrid.com/v3/marketing/lists/ca7a3796-e8a8-4029-9ccb-df8937940562`
(no `delete_contacts` query param) and output[0] signaling success:
```json
[{ "json": { "success": true } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources & operations | documented | n8n docs: contact (create/update, delete, get, get all), list (create, delete, get, get all, update), mail (send); confirmed by descriptor (ops: upsert/delete/get/getAll, create/delete/get/getAll/update, send) |
| Wire type & credential | documented | `n8n-nodes-base.sendGrid`, `sendGridApi` with `apiKey` |
| Endpoints, methods, response statuses | documented | Twilio SendGrid v3 API reference |
| Contact delete selector (`by`: ids/deleteAll) | inferred | Mirrors the API's `ids` / `delete_all_contacts` query params; exact node-level split not documented |
| Mail `additionalFields` set | inferred | API supports many optional fields; exact subset exposed by the node is not documented |
| `mail/send` output item shape | inferred | API returns empty 202; node likely emits `{ success: true }` (+ optionally message-id header) |
| `getAll` pagination & limits | inferred | API uses `_metadata.next` / `page_token`; `limit` default 50 is descriptor-confirmed |
| Defaults (`resource:list`, `operation` defaults, `limit:50`) | documented | descriptor metadata |
| Node parameter nesting (collections/fixedCollections) | gap | Deliberately abstracted per clean-room rules; implementer maps to API contract |

## OpenFlow mapping

- **Definition group:** `core` (app node, communication)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.sendGrid.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `sendGridApi` (apiKey)
