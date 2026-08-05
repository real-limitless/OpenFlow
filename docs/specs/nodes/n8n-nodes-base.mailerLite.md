---
type: n8n-nodes-base.mailerLite
displayName: MailerLite
category: Communication & Marketing
versions: [1, 2]
priority: medium
status: specced
---

# MailerLite

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailerlite.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mailerlite.md | Public docs only |
| https://developers.mailerlite.com/api/subscribers | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mailerLite`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mailerLiteApi` (API key, optional Classic toggle)

## Parameters

The node has two major versions that share the same type string. Version 1 targets the MailerLite Classic API (`https://api.mailerlite.com/api/v2/`); version 2 targets the modern MailerLite API (`https://connect.mailerlite.com/api/`). Version selection is automatic based on the credential's Classic API toggle.

### Resource: Subscriber (both versions)

One resource, Subscriber, with four operations:

| Operation | Summary |
|-----------|---------|
| Create | Subscribe a new email (upsert — update if exists). |
| Get | Fetch a single subscriber by ID or email. |
| GetAll | List subscribers with optional status filter and pagination. |
| Update | Modify fields and group membership of an existing subscriber. |

### Create

| Parameter | Type | Notes |
|-----------|------|-------|
| Email | string (expression) | Required. Valid RFC 2821 address. |
| Subscriber Fields | object | Name, last name, company, city, state, country, phone, zip. V2 also supports custom fields by name. |
| Resubscribe | boolean | When true, re-activates an unsubscribed subscriber. V2 only. |
| Groups | array of strings | Group IDs to add the subscriber to. V2 only. |

### Get

| Parameter | Type | Notes |
|-----------|------|-------|
| Subscriber ID / Email | string (expression) | Required. Accepts the subscriber ID string or email address. |

### GetAll

| Parameter | Type | Notes |
|-----------|------|-------|
| Return All | boolean | If true, fetch every page by following the cursor/offset. If false, a Limit applies. |
| Limit | number | Max items per page (default 25 for V2, 100 for V1). Ignored when Return All is true. |
| Filters | object | V2: filter by status (active / unsubscribed / unconfirmed / bounced / junk). V1: filter by status (subscribed / unsubscribed / unconfirmed / bounced / junk). |

### Update

| Parameter | Type | Notes |
|-----------|------|-------|
| Subscriber ID | string (expression) | Required. |
| Subscriber Fields | object | Same shape as Create. Omitted fields are not cleared. |
| Groups | array of strings | V2 only. Replaces group membership — omitted groups are removed. |

## Runtime behavior

### Input

Each input item is processed independently. Parameters may be static or expression-based (referencing fields on the current input item).

### Output (V2 — modern API)

Successful operations emit one output item per processed subscriber, with the subscriber object nested under the key matching the API response data envelope. The subscriber object has these top-level fields:

- `id` (string) — unique subscriber ID
- `email` (string)
- `status` (string) — active, unsubscribed, unconfirmed, bounced, junk
- `source` (string)
- `sent` (number)
- `opens_count` (number)
- `clicks_count` (number)
- `open_rate` (number)
- `click_rate` (number)
- `ip_address` (string or null)
- `subscribed_at` (string, datetime)
- `unsubscribed_at` (string or null)
- `created_at` (string, datetime)
- `updated_at` (string, datetime)
- `fields` (object) — key/value pairs for name, last_name, company, city, state, country, phone, z_i_p, and custom fields
- `groups` (array of objects, when requested with include=groups)
- `opted_in_at` (string or null)
- `optin_ip` (string or null)

For GetAll, a `meta` object with `links` (first, last, prev, next URLs for cursor-based pagination) is also included.

### Output (V1 — Classic API)

The Classic API returns flatter subscriber objects with `id` (integer), `name`, `email`, `sent`, `opened`, `clicked`, `type`, `country_id`, `signup_ip`, `signup_timestamp`, `fields` (array of key/value/type), and date fields. The executor is expected to normalize field names where feasible.

### Empty / not-found handling

- **Create:** Always emits one item (the created or updated subscriber).
- **Get:** Returns a 404 from the API when the subscriber does not exist. The node emits **no items** for that input; it does not throw unless `continueOnFail` is off.
- **GetAll:** Emits zero items when the list is empty (no subscribers match). Emits one item per subscriber otherwise.
- **Update:** Emits the updated subscriber on success. A 404 emits no items.
- **Delete:** Not exposed as an operation in this node (the MailerLite API supports DELETE but n8n does not surface it in Subscriber operations).

### Expressions

Email, Subscriber ID, and all field values accept expressions referencing the incoming item data.

### Errors

The node throws a `NodeApiError` wrapping the MailerLite API error on unexpected HTTP statuses (e.g., 401, 403, 422, 500). When `continueOnFail` is enabled, the failing item is skipped and no output item is emitted for it.

## Acceptance tests

### Test: create subscriber (V2)

**Given** input items:
```json
[{ "json": { "email": "test@example.com", "name": "Alice" } }]
```

**Parameters:**
```json
{
  "resource": "subscriber",
  "operation": "create",
  "email": "={{ $json.email }}",
  "subscriberFields": { "name": "={{ $json.name }}" }
}
```

**Expect** output[0]:
- One item emitted.
- The first output item's JSON contains `id` (non-empty string), `email` equal to `"test@example.com"`, `status` equal to `"active"`, and `fields.name` equal to `"Alice"`.

### Test: get subscriber — found

**Given** a known subscriber ID `"31986843064993537"`.

**Parameters:**
```json
{
  "resource": "subscriber",
  "operation": "get",
  "subscriberId": "31986843064993537"
}
```

**Expect** output[0]:
- One item emitted.
- The item's JSON contains `id` equal to `"31986843064993537"` and `email` equal to the subscriber's email.

### Test: get subscriber — not found (404)

**Given** a non-existent subscriber ID `"nonexistent-id"`.

**Parameters:**
```json
{
  "resource": "subscriber",
  "operation": "get",
  "subscriberId": "nonexistent-id"
}
```

**Expect** output[0]:
- Zero items emitted.
- No error thrown when `continueOnFail` is true.

### Test: list all subscribers with pagination

**Given** a MailerLite account with more than 25 subscribers.

**Parameters:**
```json
{
  "resource": "subscriber",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0]:
- One item emitted per subscriber in the account.
- All subscribers are collected by following the `meta/links/next` cursor until exhausted.

### Test: update subscriber fields

**Given** a subscriber with ID `"31986843064993537"`.

**Parameters:**
```json
{
  "resource": "subscriber",
  "operation": "update",
  "subscriberId": "31986843064993537",
  "subscriberFields": { "last_name": "Updated" }
}
```

**Expect** output[0]:
- One item emitted.
- The item's JSON contains `fields.last_name` equal to `"Updated"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| API base URL (V2 modern) | publicly documented | `https://connect.mailerlite.com/api/subscribers` |
| API base URL (V1 Classic) | publicly documented | `https://api.mailerlite.com/api/v2/subscribers` |
| Resource/Operation list | publicly documented | Subscriber: Create, Get, GetAll, Update |
| Subscriber output shape (V2) | publicly documented | Full response schema in MailerLite API docs |
| Subscriber output shape (V1) | publicly documented | Different shape (numeric id, flat fields) |
| Credential format | publicly documented | API key with Classic toggle |
| Pagination mechanism (V2) | publicly documented | Cursor-based via `meta/links/next` |
| Pagination mechanism (V1) | publicly documented | Offset/limit via `offset` and `limit` params |
| Classic vs Modern toggle | inferred from credential structure | Strictly an n8n credential concern |
| Group attachment details | publicly documented | Groups array of IDs on create/update |
| Error handling behavior | inferred from n8n patterns | `NodeApiError` + `continueOnFail` |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/mailerLite.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
