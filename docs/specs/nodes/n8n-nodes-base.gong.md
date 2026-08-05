---
type: n8n-nodes-base.gong
displayName: Gong
category: Development, Developer Tools
versions: [1]
priority: medium
status: specced
---

# Gong

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gong/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/gong/ | Public docs only |
| https://gong.app.gong.io/settings/api/documentation | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.gong`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `gongApi` (API access key + secret) or `gongOAuth2Api` (OAuth2)

## Parameters

### Resource selector

The node exposes two resources, each with two operations:

**Call**
- **Get** — retrieve a single call recording by its Gong call ID
- **Get Many** — list or search call recordings with optional date range and filter parameters

**User**
- **Get** — retrieve a single Gong user by user ID or email
- **Get Many** — list all Gong users accessible to the authenticated account

### Common optional filters (Call — Get Many)

| name | type | notes |
|------|------|-------|
| fromDateTime | ISO-8601 string | Earliest call start time |
| toDateTime | ISO-8601 string | Latest call start time |
| limit | number | Max results per page |
| offset | number | Pagination offset |

### Expression support

All parameter values support n8n expression strings (`={{ }}`).

## Runtime behavior

### Input

Each input item triggers one API request. The node does not batch items — it processes them sequentially.

### Output

Each operation returns the Gong API response body under `json` in the output item.

- **Call → Get:** Returns a single call object with metadata (participants, duration, topics, transcript URL, etc.).
- **Call → Get Many:** Returns a `calls` array and optional pagination fields.
- **User → Get:** Returns a single user object (id, email, name, title, etc.).
- **User → Get Many:** Returns a `users` array.

### Errors

- Network errors (timeout, DNS failure) throw a non-retryable error.
- API 4xx responses (auth failure, not found, rate limited) throw with the Gong error body. `continueOnFail` can suppress per-item failures.
- API 5xx responses throw; retry is left to an external retry node.

### Expressions

All free-text parameters accept expression strings.

## Acceptance tests

### Test: call — get by id

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "call",
  "operation": "get",
  "callId": "123456789"
}
```

**Expect** output[0] contains a `json` property with Gong call fields (id, clientUniqueId, title, duration, started, participants, etc.).

### Test: call — get many with date filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "call",
  "operation": "getMany",
  "fromDateTime": "2025-01-01T00:00:00Z",
  "toDateTime": "2025-01-31T23:59:59Z"
}
```

**Expect** output[0].json contains a `calls` array (may be empty if no calls match).

### Test: user — get by id

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "get",
  "userId": "abc123"
}
```

**Expect** output[0].json contains a single user object with `id` and `email` fields.

### Test: user — get many

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "getMany"
}
```

**Expect** output[0].json contains a `users` array.

### Test: invalid operation returns empty

**Given** a non-existent operation name, the node should throw or emit an error item (if `continueOnFail` is set).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | Public n8n docs list Call (Get, Get Many) and User (Get, Get Many) |
| Credential types | documented | API access key+secret or OAuth2; both documented on n8n credentials page |
| Call filter parameters | inferred | Names and types are abstracted; Gong API docs may expose additional filters |
| Exact API endpoints | inferred | Node wraps Gong REST API; exact URL paths not documented in n8n docs |
| Call detailed fields | inferred | The Gong API returns many fields (topics, trackers, pointers, etc.) not enumerated in n8n docs |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/gong.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
