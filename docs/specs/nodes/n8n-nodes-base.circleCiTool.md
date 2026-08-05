---
type: n8n-nodes-base.circleCiTool
displayName: CircleCI Tool
category: Development
versions: [1]
priority: medium
status: specced
---

# CircleCI Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.circleci/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/circleci/ | Public docs only |
| https://circleci.com/docs/api/v2/index.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.circleCiTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `circleCiApi` (Personal API Token)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `pipeline` | yes | — | Single resource: pipeline |
| operation | enum | — | yes | — | `get`, `getAll`, `trigger` |
| vcs | enum | — | only for get/getAll/trigger | — | `github`, `bitbucket` |
| projectSlug | string | — | only for get/getAll/trigger | — | VCS-slug/org-name/repo-name format |
| pipelineNumber | number | — | only for get | — | Pipeline number for the `get` operation |
| returnAll | boolean | — | only for getAll | — | Return all pipelines matching filters |
| limit | number | 50 | only for getAll | show when returnAll=false | Max items to return |
| filters | object | — | only for getAll | — | Collection of filter criteria |
| filters.branch | string | — | only for getAll | — | Filter pipelines by branch name |
| additionalFields | object | — | only for trigger | — | Collection of optional trigger fields |
| additionalFields.branch | string | — | only for trigger | — | Branch to trigger pipeline on |
| additionalFields.tag | string | — | only for trigger | — | Tag to trigger pipeline on |

All string/number/boolean parameters accept expressions.

## Runtime behavior

### Input

Inbound items are passed through as input data. For the `trigger` operation, item-level data (such as the JSON payload from previous nodes) can be used in expressions that populate `projectSlug`, `branch`, or `tag`.

### Output

Each operation produces one or more output items with the JSON response from the CircleCI API v2. Operations pass through any binary data from the input unchanged.

- **get:** Returns a single output item containing the pipeline object from `GET /pipeline/{project-slug}/pipeline/{pipeline-number}`.
- **getAll:** Returns one output item per pipeline from `GET /pipeline/{project-slug}` (with optional filtering by branch). Returns all pages when `returnAll` is true, otherwise limited by `limit`.
- **trigger:** Returns a single output item containing the response from `POST /pipeline/{project-slug}` — a created pipeline object with `number`, `state`, `id`, and `created_at`.

### Errors

HTTP errors from the CircleCI API (4xx/5xx) are surfaced as node errors. Authentication failures (401) indicate an invalid or expired personal API token. `continueOnFail` is supported for graceful error handling.

### Expressions

The following parameters accept expressions: `projectSlug`, `pipelineNumber`, `returnAll`, `limit`, `filters.branch`, `additionalFields.branch`, `additionalFields.tag`.

## Acceptance tests

### Test: trigger a pipeline on a branch

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "pipeline",
  "operation": "trigger",
  "vcs": "github",
  "projectSlug": "gh/my-org/my-repo",
  "additionalFields": {
    "branch": "main"
  }
}
```

**Expect** output[0] to contain a JSON object with `number` (integer), `state` (string), `id` (string), and `created_at` (ISO date string).

### Test: get a specific pipeline

**Parameters:**

```json
{
  "resource": "pipeline",
  "operation": "get",
  "vcs": "github",
  "projectSlug": "gh/my-org/my-repo",
  "pipelineNumber": 42
}
```

**Expect** output[0] to contain a single pipeline object with `id`, `number`, `state`, `created_at`, and `trigger` fields.

### Test: list all pipelines with branch filter

**Parameters:**

```json
{
  "resource": "pipeline",
  "operation": "getAll",
  "vcs": "github",
  "projectSlug": "gh/my-org/my-repo",
  "filters": {
    "branch": "main"
  },
  "returnAll": true
}
```

**Expect** output array to contain one or more pipeline objects, each with `id`, `number`, `state`, `created_at`, and `trigger` fields.

### Test: paginated pipeline list

**Parameters:**

```json
{
  "resource": "pipeline",
  "operation": "getAll",
  "vcs": "github",
  "projectSlug": "gh/my-org/my-repo",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output array to contain at most 10 pipeline objects.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations | Documented | Public n8n docs list 3 pipeline operations |
| Parameters & defaults | Inferred | From extracted Zod schema descriptors (not implementation code) |
| VCS options | Documented | `github`, `bitbucket` from schema |
| Credential shape | Documented | CircleCI Personal API Token from public n8n credentials docs |
| CircleCI API contract | Documented | CircleCI v2 API docs define exact endpoints, request shapes, and response shapes |
| Return-all pagination | Inferred | Standard n8n pattern; schema confirms `returnAll` + `limit` fields |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.circleCiTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
