---
type: n8n-nodes-base.mailerLiteTool
displayName: MailerLite Tool
category: Communication, Marketing
versions: [2]
defaultVersion: 2
priority: medium
status: specced
---

# MailerLite Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailerlite/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mailerlite/ | Public docs only |
| https://developers.mailerlite.com/api/subscribers | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mailerLiteTool`
- **Aliases:** (none at type-string level; the v2 MailerLite node at `n8n-nodes-base.mailerLite` sets `usableAsTool: true`, which causes n8n to surface this alias in the AI Agent tool panel)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mailerLiteApi` (API key, optional Classic toggle for legacy V1 API)

## Parameters

The MailerLite Tool is the **v2 only** AI agent tool variant of the base MailerLite node. The v1 (Classic API) version does not expose `usableAsTool`. It targets the MailerLite modern API at `https://connect.mailerlite.com/api/`. When placed in an AI Agent workflow, the LLM can dynamically determine which resource and operation to invoke.

### Resource: Subscriber

| Operation | Summary |
|-----------|---------|
| Create | Subscribe a new email (upsert — update if exists). |
| Get | Fetch a single subscriber by email address. |
| GetAll | List subscribers with optional status filter and pagination. |
| Update | Modify fields and status of an existing subscriber. |

### Create

| Parameter | Type | Notes |
|-----------|------|-------|
| Email | string (expression) | Required. Valid email address. |
| Additional Fields | collection | Status, Subscribed At, IP Address, Opted In At, Opt In IP, Unsubscribed At, Custom Fields (dynamic list loaded from MailerLite account). |

### Get

| Parameter | Type | Notes |
|-----------|------|-------|
| Subscriber Email | string (expression) | Required. The email address of the subscriber to retrieve. |

### GetAll

| Parameter | Type | Notes |
|-----------|------|-------|
| Return All | boolean | If true, fetch every page by following the cursor. |
| Limit | number | Max items per page (default 50, max 100). Ignored when Return All is true. |
| Filters | collection | Optional status filter (Active / Bounced / Junk / Unconfirmed / Unsubscribed). |

### Update

| Parameter | Type | Notes |
|-----------|------|-------|
| Subscriber Email | string (expression) | Required. Email of the subscriber to update. |
| Additional Fields | collection | Same fields as Create. Omitted fields are not cleared. Can change subscriber status. |

### AI tool behavior

This node appears in the AI Agent's tool panel. When connected to an AI Agent, the LLM can dynamically determine which operation to invoke based on the user's natural language request. Parameters may be:

- Explicitly configured by the workflow author with static values.
- Populated by `$fromAI(key, description?, type?, defaultValue?)` expressions, which instruct the AI model to determine the value from context, other tools, or by asking the user.
- Left empty for the LLM to fill in — the tool field's "stars" button enables automatic AI population.

The `dynamicParameters` handling means the executor must accept that certain parameters may arrive as `$fromAI()` expression strings that resolve at execution time rather than at design time.

## Runtime behavior

### Input

Each incoming item is processed independently. Items from the execution context flow through as-is. This is identical to the non-tool MailerLite node behavior.

### Output

Successful operations emit one output item per processed subscriber, with the subscriber object from the MailerLite API under the `json` property. The subscriber object contains:

- `id` (string) — unique subscriber ID
- `email` (string)
- `status` (string) — active, unsubscribed, unconfirmed, bounced, junk
- `source` (string)
- `sent`, `opens_count`, `clicks_count`, `open_rate`, `click_rate` (numbers)
- `ip_address` (string or null)
- `subscribed_at`, `unsubscribed_at`, `created_at`, `updated_at` (ISO datetime strings)
- `fields` (object) — key/value pairs for standard and custom fields
- `groups` (array of objects)
- `opted_in_at`, `optin_ip` (string or null)

For GetAll, pagination metadata (`meta.links`) is included for cursor-based navigation.

### Empty / not-found handling

- **Create:** Always emits one item (the created or updated subscriber).
- **Get:** Returns 404 if subscriber does not exist. Emits zero items; does not throw unless `continueOnFail` is off.
- **GetAll:** Emits zero items when the list is empty. Emits one item per subscriber otherwise.
- **Update:** Emits the updated subscriber on success. A 404 emits zero items.

### Errors

A `NodeOperationError` is thrown when the MailerLite API responds with a non-2xx status (401, 403, 404, 422, 500). When `continueOnFail` is enabled, the failing item is skipped and no output item is emitted for it.

### Expressions

All parameter values accept expression strings. The resource and operation selectors are marked `noDataExpression: true` (dropdown-selected at design time). When used as an AI agent tool, the AI model may override or populate these via the `$fromAI()` mechanism.

## Acceptance tests

### Test: Create subscriber via AI tool

**Given** an AI Agent workflow where the LLM decides to create a subscriber:

```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters** (as resolved by the AI at runtime):
```json
{
  "resource": "subscriber",
  "operation": "create",
  "email": "={{ $fromAI('email', 'Email address of the subscriber', 'string') }}",
  "additionalFields": { "status": "active" }
}
```

**Expect** output[0][0].json to contain `id` (non-empty string), `email` equal to `"test@example.com"`, and `status` equal to `"active"`.

### Test: Look up subscriber by email

**Given** input items:
```json
[{ "json": { "subscriberEmail": "existing@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "subscriber",
  "operation": "get",
  "subscriberId": "={{ $json.subscriberEmail }}"
}
```

**Expect** output[0][0].json to contain `id` (non-empty string) and `email` equal to `"existing@example.com"`.

### Test: Subscriber not found (404 with continueOnFail)

**Given** a non-existent subscriber email:
```json
[{ "json": { "email": "nonexistent@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "subscriber",
  "operation": "get",
  "subscriberId": "nonexistent@example.com"
}
```

**Expect** output[0]:
- Zero items emitted.
- No error thrown when `continueOnFail` is true.

### Test: Update subscriber status

**Given** input items:
```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "subscriber",
  "operation": "update",
  "subscriberId": "={{ $json.email }}",
  "additionalFields": { "status": "unsubscribed" }
}
```

**Expect** output[0][0].json to contain `status` equal to `"unsubscribed"`.

### Test: List subscribers with pagination

**Given** a MailerLite account with more than 50 subscribers.

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
- All subscribers are collected by following the cursor until exhausted.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool type string existence | Inferred from published JSON | `mailerLiteTool` is an auto-generated alias for the `mailerLite` v2 node with `usableAsTool: true` |
| Resource/operation list | Documented (public n8n docs) | Identical to base MailerLite v2 node — Subscriber only |
| `$fromAI()` support | Documented (public n8n tool docs) | Standard for all Tool variant nodes |
| V1 vs V2 scope | Inferred from package source | Only v2 exposes `usableAsTool: true`; v1 does not |
| Credential type | Documented (public n8n docs) | Uses `mailerLiteApi` with API key and optional Classic toggle |
| Response shapes | Public MailerLite API docs | Follow MailerLite modern API at https://developers.mailerlite.com/ |
| Delete operation | Inferred from SubscriberDescription | Not exposed as a tool operation (not in menu) |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mailerLiteTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
