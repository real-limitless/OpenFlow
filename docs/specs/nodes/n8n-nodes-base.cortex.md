---
type: n8n-nodes-base.cortex
displayName: Cortex
category: Development
versions: [1]
priority: medium
status: specced
---

# Cortex

Apply Cortex analyzers and responders against an observable entity, or retrieve job reports from a Cortex instance (TheHive's analysis and response engine).

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.cortex/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/cortex/ | Public docs only |
| https://docs.strangebee.com/cortex/api/api-guide/ | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.cortex`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `cortexApi` (required)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `analyzer` \| `job` \| `responder` | `analyzer` | yes | — | Which Cortex resource to interact with |
| operation | options (varies by resource) | `execute` | yes | depends on resource | Analyzer: `execute`. Job: `get`, `report`. Responder: `execute`. |

### Resource-specific parameters

**Analyzer — Execute:**

| name | type | required | notes |
|------|------|----------|-------|
| analyzer | options (dynamic, from Cortex API) | yes | Active analyzer ID, loaded from `/api/analyzer` |
| observableType | options (dynamic, depends on analyzer) | yes | Observable type (e.g. ip, domain, hash, file) loaded from Cortex once analyzer is chosen |
| observableValue | string | yes (unless observableType is `file`) | The value to submit for analysis |
| binaryPropertyName | string | yes (when observableType is `file`) | Name of the input binary property field containing the file |
| tlp | options: `White`(0), `Green`(1), `Amber`(2), `Red`(3) | Amber(2) | Traffic Light Protocol level |
| additionalFields.force | boolean | false | Bypass analysis cache |
| additionalFields.timeout | number | 3 | Seconds to wait for report if unavailable at query time |

**Job — Get / Report:**

| name | type | required | notes |
|------|------|----------|-------|
| jobId | string | yes | UUID of the Cortex job |

**Responder — Execute:**

| name | type | required | notes |
|------|------|----------|-------|
| responder | options (dynamic, from Cortex API) | yes | Active responder ID, loaded from `/api/responder` |
| entityType | options (dynamic, depends on responder) | yes | Data type for the responder target |
| jsonObject | boolean | false | If true, accepts a raw JSON object instead of structured fields |
| objectData | string | yes (when jsonObject is true) | The JSON entity object |

When `jsonObject` is false and `entityType` is a known case, the node exposes a structured parameter collection for the entity's attributes:

- **case**: title, description, severity, startDate, tags, flag, owner, tlp
- **alert**: title, description, severity, date, tags, tlp, source, sourceRef, type, status, follow, artifacts (multiple, each with dataType, data, message, tags; binaryPropertyName when dataType is file)
- **case_artifact (observable)**: dataType, data, message, tlp, status, ioc, startDate; binaryPropertyName when dataType is file
- **case_task**: title, status, flag
- **case_task_log**: message, startDate, status

## Runtime behavior

### Input

Each incoming item is processed independently. For file-based analyzer inputs or responder artifacts, binary data from the input item is read from the field specified by `binaryPropertyName`.

### Output

Each item produces one output item. The output shape depends on the resource and operation:

- **Analyzer → Execute** / **Responder → Execute**: The JSON response from the Cortex API (the job result or responder result). The node polls for job completion when the response indicates a pending job.
- **Job → Get**: The full job object from Cortex.
- **Job → Report**: The job report object from Cortex.

Output items are emitted on `output[0]`. If `continueOnFail` is set, errors return an item with an `error` property instead of throwing.

### Errors

- Missing or invalid credentials (bad API key, unreachable host) cause a thrown error.
- Analyzer/responder selection failures (e.g. empty list from API) cause a thrown error.
- Job polling timeout (the `timeout` field) causes a thrown error.
- `continueOnFail`: when true, the node emits an error metadata item instead of halting execution.

### Expressions

All string and options-type parameters accept expression strings. Resource and operation selectors do not accept expressions (they are noDataExpression).

## Acceptance tests

### Test: execute analyzer on IP

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "analyzer",
  "operation": "execute",
  "analyzer": "Abuse_Finder_1_0",
  "observableType": "ip",
  "observableValue": "8.8.8.8",
  "tlp": 2
}
```

**Expect** output[0] contains an object with a `status` field indicating success, and a `report` or `job` object with the analyzer's findings.

### Test: get job report

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "job",
  "operation": "report",
  "jobId": "01JABC1234567890"
}
```

**Expect** output[0] contains the Cortex job report object with fields such as `status`, `result`, and `artifact`.

### Test: execute responder on case

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "responder",
  "operation": "execute",
  "responder": "Block_IP_1_0",
  "entityType": "case",
  "jsonObject": false,
  "parameters": {
    "values": {
      "title": "Block malicious IP",
      "description": "Auto-blocked by workflow",
      "severity": 3,
      "tlp": 3
    }
  }
}
```

**Expect** output[0] contains a Cortex job/response object with the responder execution result.

### Test: force bypass cache on analyzer

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "analyzer",
  "operation": "execute",
  "analyzer": "MaxMind_GeoIP_2_0",
  "observableType": "ip",
  "observableValue": "1.1.1.1",
  "tlp": 0,
  "additionalFields": {
    "force": true
  }
}
```

**Expect** output[0] reports a new analysis (not cached), with artifacts from the analyzer.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation structure | documented | Confirmed by public docs |
| Analyzer observable types | inferred from corpus | Dynamic from Cortex API; types include ip, domain, hash, file, url, etc. |
| Responder entity types | inferred from corpus | Dynamic from Cortex API; case, alert, case_artifact, case_task, case_task_log |
| Structured parameters for responders | inferred from corpus | Detailed parameter structure per entity type extracted from published package descriptor; these reflect the Cortex API contract |
| Job polling mechanics | inferred | Node waits for completion when Cortex returns pending job |
| Credential fields | documented | Confirmed by public docs |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.cortex.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
