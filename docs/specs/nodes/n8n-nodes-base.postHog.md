---
type: n8n-nodes-base.postHog
displayName: PostHog
category: Analytics
versions: [1]
priority: medium
status: specced
---

# PostHog

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.posthog.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/posthog.md | Public docs only |
| https://posthog.com/docs/api | Public docs only |
| https://posthog.com/docs/api/capture | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.postHog`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `posthogApi` (API key + URL)

## Parameters

The node exposes four functional resources, each with one or more operations. Parameters are expressed at the behavioral level.

| Resource | Operation | Parameter | type | required | notes |
|----------|-----------|-----------|------|----------|-------|
| Alias | Create an alias | Distinct ID (alias) | string | yes | The existing distinct ID that will receive the new alias |
| | | Alias | string | yes | The new alias to merge into the existing distinct ID |
| Event | Create an event | Event Name | string | yes | The event type string sent to PostHog |
| | | Distinct ID | string | yes | The user or device identifier |
| | | Properties | JSON | no | Additional properties attached to the event; nested key-value object |
| | | Timestamp | string (ISO 8601) | no | Optional override for when the event occurred |
| Identity | Create/update person properties | Distinct ID | string | yes | The user identifier to update |
| | | Properties to Set | JSON | yes | Key-value object of person properties to upsert (wraps the `$set` payload) |
| | | Timestamp | string (ISO 8601) | no | Optional override |
| Track | Track a page view | Distinct ID | string | yes | The user or device identifier |
| | | Page Name | string | no | The current URL or page identifier (maps to `$current_url`) |
| | | Properties | JSON | no | Additional event properties |
| | | Timestamp | string (ISO 8601) | no | Optional override |
| Track | Track a screen view | Distinct ID | string | yes | The user or device identifier |
| | | Screen Name | string | no | The name of the screen viewed (maps to `$screen_name`) |
| | | Properties | JSON | no | Additional event properties |
| | | Timestamp | string (ISO 8601) | no | Optional override |

All string parameters support expression evaluation.

## Runtime behavior

### Input

The node processes each input item independently. If an input item's JSON data contains fields matching parameter names, the values can be used as expressions or overrides.

### Output

The node emits one output item per processed input item. The output JSON contains the PostHog API response status:

```json
{ "status": "ok" }
```

On success the status string is `"ok"`. On failure the node either throws (hard error) or, if `continueOnFail` is enabled on the node, emits the input item with an `error` property attached.

### Errors

- Missing required parameters (Distinct ID, Event Name, etc.) produce a hard error before any API call.
- Network errors or non-2xx HTTP responses from PostHog produce a hard error unless `continueOnFail` is set.
- The PostHog capture API returns `200 OK` even for some invalid payloads (missing event name, missing distinct ID, empty distinct ID). These events are silently dropped by PostHog — the node does not throw for this case.

### Expressions

All string, JSON, and timestamp parameters accept expression strings.

## Acceptance tests

### Test: event — basic

**Given** input items:

```json
[{ "json": { "eventName": "page_view", "userId": "user_abc" } }]
```

**Parameters:**
```json
{
  "resource": "Event",
  "operation": "Create an event",
  "eventName": "page_view",
  "distinctId": "user_abc"
}
```

**Expect** output[0]:
```json
[{ "json": { "status": "ok" } }]
```

### Test: alias

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Alias",
  "operation": "Create an alias",
  "distinctId": "old_user_id",
  "alias": "new_user_id"
}
```

**Expect** output[0]:
```json
[{ "json": { "status": "ok" } }]
```

### Test: identity with person properties

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Identity",
  "operation": "Create",
  "distinctId": "user_abc",
  "propertiesToSet": { "plan": "enterprise", "signupDate": "2024-01-15" }
}
```

**Expect** output[0]:
```json
[{ "json": { "status": "ok" } }]
```

### Test: track page view

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Track",
  "operation": "Track a page",
  "distinctId": "user_abc",
  "pageName": "/pricing"
}
```

**Expect** output[0]:
```json
[{ "json": { "status": "ok" } }]
```

### Test: event with properties

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Event",
  "operation": "Create an event",
  "eventName": "purchase",
  "distinctId": "user_abc",
  "properties": { "revenue": 49.99, "currency": "USD" }
}
```

**Expect** output[0]:
```json
[{ "json": { "status": "ok" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event properties field shape | Public docs + n8n docs | PostHog API accepts arbitrary JSON properties; node exposes a freeform JSON Properties input |
| Batch endpoint support | Public docs | PostHog supports `/batch` but the n8n node sends single-event requests per item; batching not exposed |
| Group identify support | Public docs | PostHog supports `$groupidentify` events, but n8n docs do not list it as a resource; excluded from spec |
| Survey / other special events | Public docs | Not listed in n8n node operations; excluded from spec |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/postHog.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
