---
type: n8n-nodes-base.sendInBlue
displayName: Brevo
category: Communication
versions: [1]
priority: medium
status: specced
---

# Brevo (formerly Sendinblue)

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.brevo.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/brevo.md | Public docs only |
| https://developers.brevo.com/reference/create-contact | Third-party service API docs |
| https://developers.brevo.com/reference/update-contact | Third-party service API docs |
| https://developers.brevo.com/reference/send-transac-email | Third-party service API docs |
| https://developers.brevo.com/reference/get-senders | Third-party service API docs |
| https://developers.brevo.com/reference/get-attributes | Third-party service API docs |
| n8n-nodes-base descriptor metadata (v2.15.1) under /tmp isolation | Public descriptor metadata |

> Note: the literal corpus URL `n8n-nodes-base.sendInBlue.md` is a 404; the
> node is documented under its current product brand **Brevo** at
> `builtin/app-nodes/n8n-nodes-base.brevo.md`. The wire type string
> `n8n-nodes-base.sendInBlue` is unchanged.

## Wire format

- **Type string:** `n8n-nodes-base.sendInBlue`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `sendInBlueApi` (required) — single **API Key** field, sent as the `api-key` request header; service base URL `https://api.brevo.com`; the credential test endpoint is `GET /v3/account`.
- **Versions:** 1 (single version)
- **AI:** declared usable as a tool (`usableAsTool`)

The node is an HTTP integration that calls the **Brevo API v3** (`https://api.brevo.com`). It exposes four resources — Contact, Contact Attribute, Email, Sender — each with a small operation set. All requests are authenticated with the credential API key in the `api-key` header.

## Parameters

Abstracted by resource. Nested option-group layout is an implementation concern; the wire names below are the ones that appear in workflow JSON and in Brevo API request bodies.

### Contact

| name | type | operations | notes |
|------|------|------------|-------|
| email | string | create, upsert | Contact email address; API body field `email`. Required when no `ext_id`/`SMS` attribute is provided. |
| attributes | collection | create, upsert, update | Key/value custom attributes; keys must be the uppercase attribute names defined in the Brevo account; API body field `attributes`. |
| listIds | array | create, upsert, update | Brevo list IDs to subscribe the contact to; API body field `listIds`. |
| updateEnabled | boolean | upsert | When set, contact creation falls back to an update if the contact already exists (API body field `updateEnabled`, `POST /v3/contacts`). This is the "Create or Update" behavior. |
| identifier | string | get, delete, update | Existing contact identifier — email or numeric contact ID; URL-encoded into `GET|PUT|DELETE /v3/contacts/{identifier}`. |
| returnAll | boolean | getAll | Fetch every page instead of honoring `limit`. |
| limit | number | getAll | Page size for `getAll`; default 50; API query params `limit`/`offset`. |
| sort | option | getAll | Result ordering (e.g. `desc` by `modifiedAt`); API query param `sort`. |
| modifiedSince | string | getAll | Only return contacts modified after the given date; API query param `modifiedSince`. |

### Contact Attribute

| name | type | operations | notes |
|------|------|------------|-------|
| attributeCategory | option | create, update, delete | Attribute category: `normal`, `transactional`, `category`, `calculated`, or `global`; URL path segment `{attributeCategory}`. |
| attributeName | string | create, update, delete | Attribute name; URL-encoded into `.../attributes/{category}/{name}`. |
| attributeType | option | create | Data type of a new attribute: `text`, `date`, `float`, `boolean` (plus `category`-specific enumeration / `calculated` value handling); API body field `type`. |
| attributeValue | string | create, update | Value/expression for the attribute; API body field `value`. |
| enumeration | collection | create, update | Enumeration values for `category`-type attributes; API body field `enumeration`. |
| returnAll / limit | boolean / number | getAll | Pagination for `GET /v3/contacts/attributes`; default limit 50. |

### Email

| name | type | operations | notes |
|------|------|------------|-------|
| sendHTML | boolean | send | Select HTML vs plain-text body. When `true`, `htmlContent` is used; otherwise `textContent`. |
| subject | string | send | Email subject; API body field `subject`. Required when no template is used. |
| textContent | string | send | Plain-text body; API body field `textContent`. |
| htmlContent | string | send | HTML body; API body field `htmlContent`. |
| sender | string | send | Sender email address (optionally with name); API body field `sender`. Required when no template is used. |
| recipients | string | send, sendTemplate | Recipient email address(es); API body field `to` (array of `{ email, name }`). |
| attachments | collection | send, sendTemplate | Attachments sourced from the input item's binary data (field name `binaryPropertyName`); API body field `attachment` (base64 `content` + `name`). |
| bcc / cc | collection | send | Additional recipients; API body fields `bcc` / `cc`. |
| tags | collection | send, sendTemplate | Free-form labels; API body field `tags`. |
| templateId | option | sendTemplate | Loaded from `GET /v3/smtp/templates` (status active, sorted by name); sent in the API body field `templateId`. |
| templateParameters | collection | sendTemplate | Key/value pairs for template variable substitution; API body field `params`. |

Both send operations issue `POST /v3/smtp/email`. When `templateId` is present the API applies the template's sender/subject and renders `params`.

### Sender

| name | type | operations | notes |
|------|------|------------|-------|
| name | string | create | From-name of the sender; API body field `name`. |
| email | string | create | From-email of the sender; API body field `email`. |
| id | string | delete | Sender ID; URL-encoded into `DELETE /v3/senders/{id}`. |
| returnAll / limit | boolean / number | getAll | Pagination for `GET /v3/senders`; default limit 10. |

### Node-level request options

| name | type | notes |
|------|------|-------|
| timeout | number | Per-request timeout in milliseconds. |
| proxy | string | Outbound HTTP(S) proxy URL. |
| allowUnauthorizedCerts | boolean | Skip TLS certificate verification. |
| batching | collection | Batch multiple input items into one request (aggregates the per-item API calls). |

## Runtime behavior

### Input

Consumes items from `main`. Each input item is processed independently: parameter values may be expressions over `$json`, and every item produces its own API call and output item. `getAll` operations with `returnAll: true` page through the API with `limit`/`offset` until the result set is exhausted.

### Output

The node emits one output item per API call:

- **List operations** (`getAll`) unwrap the envelope array and emit one item per element: `{ contacts }` → the `contacts` array elements, `{ senders }` → the `senders` array elements, `{ attributes }` → the `attributes` array elements.
- **Create/get operations that return a body** pass the response body through as the item JSON: `POST /v3/contacts` → `{ id }`; `GET /v3/contacts/{identifier}` → the contact object; `POST /v3/smtp/email` → `{ messageId, messageIds? }`; `POST /v3/senders` → the created sender object.
- **Operations whose API returns an empty 2xx** (contact update/delete, attribute create/update/delete, sender delete) emit a synthesized `{ "success": true }` item.

### Errors

- Missing required parameters are rejected before any request is sent (node-level validation).
- Non-2xx API responses (authentication failure, invalid parameters, unknown identifier, missing credits, etc.) throw an error carrying the Brevo error `code`/`message`.
- With `continueOnFail`, the failing item is emitted as `[{ json: { error: string } }]` on the single `main` output instead of throwing.

### Expressions

All string/number/boolean parameters listed above accept expression strings (`{{ ... }}`); per-item values are evaluated before each request.

## Acceptance tests

Fixtures below assume a mock Brevo transport; assertions cover the outgoing HTTP request contract and the output item shape.

### Test: create contact

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create",
  "email": "jane@example.com",
  "attributes": { "attributesValues": { "attributes": [ { "fieldName": "FNAME", "fieldValue": "Jane" } ] } },
  "listIds": [ 4 ]
}
```

**Expect** a single request:

- `POST https://api.brevo.com/v3/contacts`
- header `api-key` = credential value
- body `{ "email": "jane@example.com", "attributes": { "FNAME": "Jane" }, "listIds": [4] }`

and **output[0]** (from mocked response `{ "id": 21 }`):

```json
[{ "json": { "id": 21 } }]
```

### Test: create or update contact

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "upsert",
  "email": "jane@example.com",
  "updateEnabled": true
}
```

**Expect** `POST /v3/contacts` with body `{ "email": "jane@example.com", "updateEnabled": true }` and **output[0]** matching the mocked response `{ "id": 21 }`.

### Test: get all contacts (paged)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "getAll",
  "returnAll": false,
  "limit": 25,
  "options": { "sort": "desc" }
}
```

**Expect** `GET https://api.brevo.com/v3/contacts?limit=25&offset=0&sort=desc` and **output[0]** to be the mocked envelope unwrapped, i.e. one item per element of `contacts`.

### Test: send transactional email (HTML)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "send",
  "sendHTML": true,
  "subject": "Welcome",
  "htmlContent": "<h1>Hi</h1>",
  "sender": "no-reply@example.com",
  "recipients": "jane@example.com"
}
```

**Expect** `POST https://api.brevo.com/v3/smtp/email` with body containing `subject`, `sender`, `to: [{ "email": "jane@example.com" }]`, and `htmlContent`; **output[0]** = mocked response `{ "messageId": "<…@relay…>" }`.

### Test: send template email

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "sendTemplate",
  "templateId": 7,
  "recipients": "jane@example.com",
  "additionalFields": { "templateParameters": { "parameterValues": { "parameters": "orderNo=123" } } }
}
```

**Expect** `POST https://api.brevo.com/v3/smtp/email` with body `{ "templateId": 7, "to": [{ "email": "jane@example.com" }], "params": { "orderNo": "123" } }`; **output[0]** = mocked response `{ "messageId": "<…>" }`.

### Test: create contact attribute (empty 2xx → success)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "attribute",
  "operation": "create",
  "attributeCategory": "normal",
  "attributeName": "COMPANY",
  "attributeType": "text"
}
```

**Expect** `POST https://api.brevo.com/v3/contacts/attributes/normal/COMPANY` with body `{ "type": "text" }`, and **output[0]**:

```json
[{ "json": { "success": true } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources and operations (Contact/Attribute/Email/Sender × 13 ops) | documented | n8n Brevo node docs list all four resources and their operations |
| Credential contract (API key → `api-key` header, base URL, test endpoint) | documented | Brevo credential docs + Brevo API auth scheme |
| External API endpoints and request/response bodies | documented | Brevo API v3 reference (create/update contact, send transac email, senders, attributes) |
| Output mapping (envelope unwrap, `{ success: true }` for empty 2xx) | inferred | Standard behavior derived from the public API's response/204 contracts and confirmed against public descriptor metadata |
| `sendTemplate` uses `POST /v3/smtp/email` with body `templateId` | documented | Brevo `sendTransacEmail` accepts `templateId` in the body (modern API); template options loaded from `GET /v3/smtp/templates` |
| Exact parameter UI grouping and nested option layouts | inferred | Spec abstracts away original schema nesting; only wire-visible names and API body fields are pinned |
| `batching` request option semantics | inferred | Generic node request option; exact aggregation behavior is an implementation choice |

## OpenFlow mapping

- **Definition group:** `core` (app / communication node)
- **Executor file:** `src/lib/engine/executors/sendInBlue.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
