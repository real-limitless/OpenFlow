---
type: n8n-nodes-base.postHogTool
displayName: PostHog Tool
category: Analytics
versions: [1]
priority: medium
status: specced
---

# PostHog Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.posthog.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/posthog.md | Public docs only |
| https://posthog.com/docs/api | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.postHogTool`
- **Aliases:** (none — the base type `n8n-nodes-base.postHog` shares the same executor; this type string is the tool-registered variant)
- **Inputs:** `main` × 1 (receives input items from the AI Agent or workflow)
- **Outputs:** `main` × 1
- **Credentials:** `posthogApi` (API key + PostHog host URL)

## Parameters

The PostHog Tool exposes the same four resources and operations as the base PostHog node. Parameter names are abstracted to functional outcomes rather than exact UI labels.

| Resource | Operation | Parameter | type | required | notes |
|----------|-----------|-----------|------|----------|-------|
| Alias | Create an alias | Distinct ID | string | yes | Existing user identifier that will receive the alias |
| | | Alias | string | yes | New alias to merge into the existing distinct ID |
| Event | Create an event | Event Name | string | yes | Event type string sent to PostHog |
| | | Distinct ID | string | yes | User or device identifier |
| | | Properties | JSON | no | Arbitrary key-value properties attached to the event |
| | | Timestamp | string (ISO 8601) | no | Override for when the event occurred |
| Identity | Create/update person properties | Distinct ID | string | yes | User identifier to update |
| | | Properties to Set | JSON | yes | Key-value object of person properties to upsert |
| | | Timestamp | string (ISO 8601) | no | Override |
| Track | Track a page view | Distinct ID | string | yes | User or device identifier |
| | | Page Name | string | no | Current URL or page identifier |
| | | Properties | JSON | no | Additional event properties |
| | | Timestamp | string (ISO 8601) | no | Override |
| Track | Track a screen view | Distinct ID | string | yes | User or device identifier |
| | | Screen Name | string | no | Name of the screen viewed |
| | | Properties | JSON | no | Additional event properties |
| | | Timestamp | string (ISO 8601) | no | Override |

### AI agent integration

All parameters support `$fromAI()` expressions, allowing the AI agent to dynamically populate parameter values at runtime. The tool registers with the AI Agent as a callable function whose schema is derived from the selected resource and operation.

## Runtime behavior

### Input

The tool processes each input item independently. When connected to an AI Agent, the agent invokes the tool with parameters matching the selected resource/operation. The tool can also be used as a standalone node in a standard workflow, receiving items from any upstream node.

### Output

Each invocation produces one output item. On success the PostHog API returns `{ "status": "ok" }`:

```json
{ "json": { "status": "ok" } }
```

### Errors

- Missing required parameters produce a hard error before any API call.
- Network errors or non-2xx HTTP responses produce a hard error unless `continueOnFail` is set.
- PostHog's capture API may return `200 OK` for invalid payloads (missing event name, missing distinct ID). These events are silently dropped; the node does not error in this case.

### Expressions

All string, JSON, and timestamp parameters accept expression strings. When invoked by an AI Agent, `$fromAI()` expressions are evaluated at runtime based on the agent's conversation context.

## Acceptance tests

### Test: event creation via AI agent

**Given** the tool is registered in an AI Agent's tools list with resource `Event` and operation `Create an event`.

**Parameters (supplied via `$fromAI()`):**
```json
{
  "resource": "Event",
  "operation": "Create an event",
  "eventName": "user_signup",
  "distinctId": "user_123"
}
```

**Expect** output[0]:
```json
[{ "json": { "status": "ok" } }]
```

### Test: alias — static parameters

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
  "propertiesToSet": { "plan": "enterprise" }
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

### Test: track screen view

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Track",
  "operation": "Track a screen",
  "distinctId": "user_abc",
  "screenName": "Settings"
}
```

**Expect** output[0]:
```json
[{ "json": { "status": "ok" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation set | Public docs | n8n docs confirm 4 resources (Alias, Event, Identity, Track) with 6 total operations; identical to base PostHog node |
| $fromAI() support | Public docs | Standard for Tool variants; documented in n8n AI tool docs |
| Credential type | Public docs | posthogApi (API key + host URL) confirmed via n8n credentials docs |
| Parameter names | Public docs | Abstracted to functional outcomes per clean-room rules |
| Separate PostHogTool type string | Inferred from corpus | No separate node descriptor exists; postHogTool is an alias of the base postHog node with `usableAsTool: true` |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/postHogTool.ts` (may alias `postHog.ts` executor with tool-mode flag)
- **SDK:** `defineNode` + native `ExecutionContext` only
