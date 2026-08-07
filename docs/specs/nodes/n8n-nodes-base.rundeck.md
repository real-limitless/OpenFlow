---
type: n8n-nodes-base.rundeck
displayName: Rundeck
category: Communication, Development
versions: [1]
priority: medium
status: missing
---

# Rundeck

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.rundeck/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/rundeck/ | Public docs only |
| https://docs.rundeck.com/docs/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.rundeck`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `rundeckApi` (URL + API Token)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `job` | `job` | yes | — | The Rundeck API resource to operate on |
| operation | options | `executeJob` | yes | depends on resource | Which action to perform on the selected resource |
| jobId | string | — | yes | `{ resource: job, operation: [executeJob, getJobMetadata] }` | UUID of the Rundeck job to execute or inspect |
| nodeFilter | string | — | no | `{ resource: job, operation: [executeJob] }` | Node filter string to limit which nodes the job runs on |
| logLevel | options: `DEBUG`, `VERBOSE`, `INFO`, `WARN`, `ERROR` | `INFO` | no | `{ resource: job, operation: [executeJob] }` | Log verbosity for the job execution |
| asUser | string | — | no | `{ resource: job, operation: [executeJob] }` | Run the job as a different user (requires `runAs` permission) |
| runAtTime | string | — | no | `{ resource: job, operation: [executeJob] }` | ISO-8601 datetime to schedule future execution |
| options | fixedCollection | — | no | `{ resource: job, operation: [executeJob] }` | Key-value map of job option values (overrides `argString`) |

### Resource: Job

#### operation: executeJob

Trigger a Rundeck job execution via `POST /api/17/job/{jobId}/run`. Accepts optional node filtering, log level override, user impersonation, scheduled time, and job option values.

#### operation: getJobMetadata

Retrieve the job definition via `GET /api/17/job/{jobId}` with optional `format` parameter (`xml`, `yaml`, `json`). Returns the full job definition document.

## Runtime behavior

### Input

Each input item is processed independently. The node executes one Rundeck API call per input item. For `executeJob`, each item triggers a separate job run.

### Output

For `executeJob`, the node returns the execution response from the Rundeck API, which includes the execution ID, status, job reference, and a link to the execution detail.

For `getJobMetadata`, the node returns the full job definition object in the requested format.

### Errors

- If the Rundeck API returns a non-2xx status (authentication failure, job not found, permission denied), the node throws a `NodeApiError` with the API error details.
- If `jobId` is empty or missing, the node should throw a validation error.
- `continueOnFail` (when enabled) suppresses the error and passes the item to the next node with a `_error` property instead of halting the workflow.

### Expressions

All parameters accept expression strings.

## Acceptance tests

### Test: execute a job with minimal options

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "job",
  "operation": "executeJob",
  "jobId": "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 1234,
    "status": "running",
    "job": {
      "id": "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a",
      "name": "restart",
      "group": "app2/dev",
      "project": "test"
    },
    "description": "restart"
  }
}]
```

### Test: execute a job with options and node filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "job",
  "operation": "executeJob",
  "jobId": "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a",
  "nodeFilter": "name: web-*",
  "logLevel": "VERBOSE",
  "options": { "timeout": "300", "region": "us-east-1" }
}
```

**Expect** output[0] contains a single item with an execution object including `id`, `status`, and `job` reference.

### Test: get job metadata

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "job",
  "operation": "getJobMetadata",
  "jobId": "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "href": "http://madmartigan.local:4440/api/17/job/3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a",
    "id": "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a",
    "name": "restart",
    "group": "app2/dev",
    "project": "test",
    "description": "",
    "options": {}
  }
}]
```

### Test: error on missing jobId

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "job",
  "operation": "executeJob",
  "jobId": ""
}
```

**Expect** the node throws a validation error indicating `jobId` is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node parameter names and structure | Documented | Based on public n8n docs and Rundeck API spec |
| Credential schema | Documented | URL + API Token per n8n credentials docs |
| Rundeck API endpoints | Documented | POST /api/17/job/{id}/run and GET /api/17/job/{id} per Rundeck API docs |
| Exact response shape | Inferred | Based on Rundeck API JSON response documented structure |
| Exact collection/dropdown options | Inferred | High-level — no exact option enums from corpus used |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/rundeck.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
