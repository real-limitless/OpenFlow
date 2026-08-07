---
type: n8n-nodes-base.sentryIoTool
displayName: Sentry.io Tool
category: Development
versions: [1]
priority: medium
status: specced
---

# Sentry.io Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sentryio/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/sentryio/ | Public docs only |
| https://docs.sentry.io/api/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.sentryIoTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `sentryIoApi` (OAuth2, API Token, or Server API Token for self-hosted)

The Sentry API base URL depends on authentication mode:
- Cloud (API Token or OAuth2): `https://sentry.io/api/0/`
- Self-hosted (Server API Token): user-provided URL appended with `/api/0/`

## Parameters

This node is the AI agent tool variant of the base Sentry.io node. It exposes the same six resources and operations, plus `$fromAI()` support on parameter fields.

### Resource: Event

| Operation | Parameters | Required |
|-----------|-----------|----------|
| Get | issueId, eventId | Both |
| Get All | organizationSlug, projectSlug | Both |

### Resource: Issue

| Operation | Parameters | Required | Notes |
|-----------|-----------|----------|-------|
| Get | issueId | Yes | |
| Get All | organizationSlug, projectSlug | Both | Optional: status, query |
| Update | issueId | Yes | Optional: status (resolved/resolvedInNextRelease/unresolved/ignored), assignedTo, hasSeen, isBookmarked, isSubscribed, snoozeDuration |
| Delete | issueId | Yes | |

### Resource: Project

| Operation | Parameters | Required | Notes |
|-----------|-----------|----------|-------|
| Create | organizationSlug, name | Yes both | Optional: platform, teamSlug, defaultRules |
| Get | organizationSlug, projectSlug | Both | |
| Get All | organizationSlug | Yes | Optional: query |
| Update | organizationSlug, projectSlug | Both | Optional: name, slug, platform, isBookmarked, isPublic, digestsMinDelay, digestsMaxDelay |
| Delete | organizationSlug, projectSlug | Both | |

### Resource: Release

| Operation | Parameters | Required | Notes |
|-----------|-----------|----------|-------|
| Create | organizationSlug, version, projects | Yes: slug, version | Optional: url, dateReleased, commits, ref, refs |
| Get | organizationSlug, version | Both | |
| Get All | organizationSlug | Yes | Optional: query |
| Update | organizationSlug, version | Both | Optional: url, dateReleased, commits, ref, refs, projects |
| Delete | organizationSlug, version | Both | |

### Resource: Organization

| Operation | Parameters | Required | Notes |
|-----------|-----------|----------|-------|
| Create | name | Yes | Optional: slug, agreeTerms, defaultTeam |
| Get | organizationSlug | Yes | |
| Get All | (none) | - | |
| Update | organizationSlug | Yes | Optional: name, slug, isEarlyAdopter |

### Resource: Team

| Operation | Parameters | Required | Notes |
|-----------|-----------|----------|-------|
| Create | organizationSlug, name | Yes both | Optional: slug |
| Get | organizationSlug, teamSlug | Both | |
| Get All | organizationSlug | Yes | |
| Update | organizationSlug, teamSlug | Both | Optional: name, slug |
| Delete | organizationSlug, teamSlug | Both | |

### AI agent parameter population

All parameter fields support `$fromAI()` expressions that let the AI agent model dynamically resolve values at runtime. When a parameter is set to `$fromAI("key", "description", "type", "defaultValue")`, the AI agent infers the appropriate value from conversation context, other connected tool outputs, or by asking the user.

## Runtime behavior

### Input

Each input item is processed independently. For single-resource operations the executor uses the first item and merges the API response. For list operations results are returned as one output item per API result.

### Output

Output items contain the Sentry API response body as a JSON object under the `json` key. The original input item's data is not carried forward (standard tool behavior).

### Errors

- HTTP 4xx/5xx responses are surfaced as node errors.
- HTTP 404 on Get/Delete/Update is treated as an error.
- HTTP 403 (insufficient scopes) is surfaced as an error.
- When `continueOnFail` is enabled, the node returns an error item instead of throwing.

### Expressions

All parameter values accept n8n expression strings including `$fromAI()`.

## Acceptance tests

### Test: Get issue by ID (via AI Agent)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "issue",
  "operation": "get",
  "issueId": "54321"
}
```

**Expect** output[0] contains a `json` object with `id` equal to `"54321"`, a `title` string, and a `status` string.

### Test: Create a release with $fromAI() parameters

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "release",
  "operation": "create",
  "organizationSlug": "={{ $fromAI(\"orgSlug\", \"Sentry organization slug\", \"string\", \"my-org\") }}",
  "version": "={{ $fromAI(\"version\", \"Release version string\", \"string\", \"1.0.0\") }}",
  "projects": ["={{ $fromAI(\"project\", \"Project slug\") }}"]
}
```

**Expect** output[0].json contains `version` matching the resolved value, `projects` array, and a `dateReleased`.

### Test: List unresolved issues filtered by query

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "issue",
  "operation": "getAll",
  "organizationSlug": "my-org",
  "projectSlug": "my-project",
  "status": "unresolved",
  "query": "is:unresolved TypeError"
}
```

**Expect** output contains one or more items. Each output item's `json` contains `id`, `title`, `status` equal to `"unresolved"`, `level`, and `project`.

### Test: Update issue status

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "issue",
  "operation": "update",
  "issueId": "12345",
  "status": "resolved"
}
```

**Expect** output[0].json contains `id` equal to `"12345"` and `status` equal to `"resolved"`.

### Test: List organizations

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "organization",
  "operation": "getAll"
}
```

**Expect** output contains one or more items. Each output item's `json` contains `slug`, `name`, and `id`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented | From public n8n docs page for base Sentry.io node |
| Tool variant identity | Inferred | No separate docs page for the Tool variant; shares base node behavior and operations |
| `$fromAI()` support | Documented | From public n8n docs on AI parameter population |
| Exact parameter names per operation | Inferred | Matches Sentry REST API v0 and the base node spec |
| Credential type name | Documented | `sentryIoApi` from public creds docs |
| Pagination handling | Inferred | Follows standard Sentry API Link-header patterns |
| Self-hosted base URL | Documented | From credentials page |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/sentryIoTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
