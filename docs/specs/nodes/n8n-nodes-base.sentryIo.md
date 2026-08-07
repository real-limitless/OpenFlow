---
type: n8n-nodes-base.sentryIo
displayName: Sentry.io
category: Development
versions: [1]
priority: medium
status: specced
---

# Sentry.io

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sentryio/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/sentryio/ | Public docs only |
| https://docs.sentry.io/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.sentryIo`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `sentryIoApi` (using OAuth2, API Token, or Server API Token for self-hosted)

The Sentry API base URL depends on authentication mode:
- Cloud (API Token or OAuth2): `https://sentry.io/api/0/`
- Self-hosted (Server API Token): user-provided URL, appended with `/api/0/`

## Parameters

The node exposes six resources, each with an operation selector followed by operation-specific parameters.

### Resource: Event

| Operation | Parameters | Required |
|-----------|-----------|----------|
| Get | issueId, eventId | Both |
| Get All | organizationSlug, projectSlug | Both |

### Resource: Issue

| Operation | Parameters | Required | Notes |
|-----------|-----------|----------|-------|
| Get | issueId | Yes | |
| Get All | organizationSlug, projectSlug | Both | Supports optional status filter, query string |
| Update | issueId | Yes | Optional: status (resolved/resolvedInNextRelease/unresolved/ignored), assignedTo, hasSeen, isBookmarked, isSubscribed, snoozeDuration |
| Delete | issueId | Yes | |

### Resource: Project

| Operation | Parameters | Required | Notes |
|-----------|-----------|----------|-------|
| Create | organizationSlug, name | Yes name + slug inferred or provided | Optional: platform, teamSlug, defaultRules |
| Get | organizationSlug, projectSlug | Both | |
| Get All | organizationSlug | Yes | Supports optional query |
| Update | organizationSlug, projectSlug | Both | Optional: name, slug, platform, isBookmarked, isPublic, digestsMinDelay, digestsMaxDelay |
| Delete | organizationSlug, projectSlug | Both | |

### Resource: Release

| Operation | Parameters | Required | Notes |
|-----------|-----------|----------|-------|
| Create | organizationSlug, version, projects | Yes: slug, version | Optional: url, dateReleased, commits, ref, refs |
| Get | organizationSlug, version | Both | |
| Get All | organizationSlug | Yes | Supports optional query |
| Update | organizationSlug, version | Both | Optional: url, dateReleased, commits, ref, refs, projects |
| Delete | organizationSlug, version | Both | |

### Resource: Organization

| Operation | Parameters | Required | Notes |
|-----------|-----------|----------|-------|
| Create | name | Yes | Optional: slug, agreeTerms, defaultTeam |
| Get | organizationSlug | Yes | |
| Get All | (none) | - | Lists accessible organizations |
| Update | organizationSlug | Yes | Optional: name, slug, isEarlyAdopter |

### Resource: Team

| Operation | Parameters | Required | Notes |
|-----------|-----------|----------|-------|
| Create | organizationSlug, name | Yes both | Optional: slug |
| Get | organizationSlug, teamSlug | Both | |
| Get All | organizationSlug | Yes | |
| Update | organizationSlug, teamSlug | Both | Optional: name, slug |
| Delete | organizationSlug, teamSlug | Both | |

### Common parameter shape

- Organization/project/team slugs are short string identifiers used in Sentry API URLs (e.g. `my-org`, `my-project`).
- Issue IDs are numeric Sentry issue identifiers.
- Event IDs are hex strings (32-character) from Sentry events.
- Release versions are user-defined strings (e.g. `1.0.0`).
- Most update operations accept a `resolve` parameter to control how fields are applied.

## Runtime behavior

### Input

Each input item is processed independently. For operations that act on a single resource (Get, Delete, Update), the executor processes the first item and passes it through with the API response merged in. For list operations (Get All), results are returned as one output item per API result item, or as a single paginated item depending on the simplification setting.

### Output

Output items contain the Sentry API response body as a JSON object under the `json` key. For list operations, the output shape is one item per result (or a single item containing the array, depending on the simplify setting). The original input item's data is not carried forward.

Example output shape (Issue Get):

```json
{
  "id": "12345",
  "title": "TypeError: Cannot read property 'x' of undefined",
  "status": "unresolved",
  "level": "error",
  "firstSeen": "2024-01-01T00:00:00Z",
  "lastSeen": "2024-06-01T00:00:00Z",
  "count": 42,
  "project": { "id": "1", "slug": "my-project", "name": "My Project" },
  "permalink": "https://sentry.io/organizations/my-org/issues/12345/"
}
```

### Errors

- HTTP 4xx responses (invalid parameters, auth failures, not found) are surfaced as node errors.
- HTTP 404 on Get/Delete/Update operations is treated as an error.
- HTTP 403 (insufficient scopes) is surfaced as an error.
- When `continueOnFail` is enabled, the node returns an error item instead of throwing, preserving downstream execution.

### Expressions

All parameter values accept n8n expression strings.

## Acceptance tests

### Test: Get issue by ID

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

### Test: Create a release

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "release",
  "operation": "create",
  "organizationSlug": "my-org",
  "version": "1.2.3",
  "projects": ["my-project"],
  "url": "https://github.com/org/repo/releases/tag/v1.2.3",
  "dateReleased": "2024-06-15T12:00:00Z"
}
```

**Expect** output[0].json contains `version` equal to `"1.2.3"`, `projects` array containing `"my-project"`, and a `dateReleased` matching the input.

### Test: List projects with query filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "project",
  "operation": "getAll",
  "organizationSlug": "my-org",
  "query": "frontend"
}
```

**Expect** output contains one or more items. Each output item's `json` contains `slug`, `name`, and `id` as strings. Results are filtered to projects matching "frontend".

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

### Test: Delete project

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "project",
  "operation": "delete",
  "organizationSlug": "my-org",
  "projectSlug": "temp-project"
}
```

**Expect** output[0].json indicates success (HTTP 204 or success body) with no further data.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented | From public n8n docs page |
| Exact parameter names per operation | Inferred from Sentry API (docs.sentry.io) and corpus type descriptors | The operation names and resource structure match the Sentry REST API v0 endpoints |
| Credential type name | Documented | `sentryIoApi` from public creds docs (API token / OAuth2 / Server API token) |
| Pagination handling | Inferred | Sentry API uses Link header pagination; simplification behavior follows n8n conventions |
| Organization slug as parameter | Inferred | Required for most Sentry API scoped operations |
| Simplify output toggle | Inferred | Standard n8n pattern; exact default not confirmed from public docs |
| Self-hosted base URL | Documented | From credentials page (Server API Token includes URL field) |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/sentryIo.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
