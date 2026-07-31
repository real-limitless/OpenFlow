---
type: n8n-nodes-base.circleCi
displayName: CircleCI
category: Development
versions: [1]
priority: medium
status: specced
---

# CircleCI

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.circleci.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/circleci.md | Public docs only |

The temporary descriptor was used only to confirm the wire type, the required
credential name, and the high-level resource/operation list. It was not copied
into the repository and was not used to derive nested schemas, defaults, or
internal algorithms.

## Wire format

- **Type string:** `n8n-nodes-base.circleCi`
- **Aliases:** none known
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** required `circleCiApi` credential containing a CircleCI personal API token. The credential documentation identifies personal API tokens as the supported authentication method.

The node is an action node, not a trigger. It requires a configured CircleCI
credential and communicates with the CircleCI API. It does not define a special
binary channel.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed selection | pipeline | yes | always | The public node documentation exposes Pipeline as the supported resource. |
| operation | selection | get | yes | resource = pipeline | Get a pipeline, get many pipelines, or trigger a pipeline. |
| source-control provider | selection | none documented | yes for pipeline requests | pipeline operations | Identifies whether the project is hosted on a supported source-control provider such as GitHub or Bitbucket. |
| project slug | string | none | yes | all pipeline operations | Identifies the repository/project whose pipelines are read or triggered. |
| pipeline identifier | number or string | none | conditional | get a pipeline | Identifies the individual pipeline to retrieve. |
| return-all / limit controls | boolean and/or number | node-defined | conditional | get many pipelines | Controls whether the node returns all available pipelines or bounds the result set. Exact pagination behavior is an implementation detail unless exposed by the chosen OpenFlow UI. |
| trigger options | structured values | none | conditional | trigger a pipeline | Carries only values supported by the CircleCI API and exposed by OpenFlow. Do not require undocumented nested fields for the base contract. |

String and numeric values should support OpenFlow expressions where the host
node property model permits expressions. The node must validate operation-
specific required values before making a remote request.

## Runtime behavior

### Input

The node consumes items from `main[0]`. Input JSON may supply values for
expression-enabled parameters, but project and pipeline identifiers must come
from the resolved node configuration or the resolved input expressions.

For ordinary item processing, the executor performs the selected operation for
each input item. If the selected operation is configured as a collection read,
the executor may emit one output item per returned pipeline so downstream nodes
can process the results individually. This per-item behavior is an OpenFlow
mapping inference, not a detail stated on the public CircleCI node page.

### Output

Every successful result is emitted on `main[0]` as an item whose `json` value
represents the corresponding CircleCI API result. The executor must preserve
the service's meaningful response data rather than replacing it with invented
status or log fields.

- **Get a pipeline:** emit the retrieved pipeline result.
- **Get all pipelines:** emit the returned pipeline collection according to the
  host's collection-to-items convention; if expanded, each item represents one
  pipeline and no result is silently discarded.
- **Trigger a pipeline:** emit the service response describing the newly
  requested pipeline/run.

No binary output is required.

### Errors

- Missing credentials, missing operation-specific identifiers, and invalid
  parameter combinations fail validation before a remote request.
- Authentication failures, authorization failures, malformed requests, missing
  projects/pipelines, rate limits, and other non-success API responses fail the
  node with an actionable error that includes the service error when available.
- With `continueOnFail` enabled, a failed input should produce an error item on
  the same output branch rather than aborting unrelated input items, following
  the standard OpenFlow execution contract.
- The node must not claim that a triggered pipeline has completed. The trigger
  result is the service's immediate response; later status inspection requires
  a separate get operation.

### Expressions

Project identifiers, pipeline identifiers, provider selections, collection
limits, and trigger option values may be expression-backed when those
properties are configured as expression-capable by OpenFlow. Expressions are
resolved per input item before validation and the API request.

## Acceptance tests

The service is mocked in these fixtures; assertions concern functional
outcomes, not an engine-specific copy of CircleCI's response schema.

### Test: get one pipeline

**Given** input items:

```json
[{ "json": { "slug": "acme/widget", "number": 42 } }]
```

**Parameters:**

```json
{
  "resource": "pipeline",
  "operation": "get",
  "provider": "github",
  "projectSlug": "={{ $json.slug }}",
  "pipelineNumber": "={{ $json.number }}"
}
```

**Expect:** exactly one successful item on `main[0]`, containing the mocked
CircleCI pipeline result for project `acme/widget` and pipeline `42`.

### Test: get many pipelines with a bound

**Given** an empty input item and a mocked service response containing three
pipelines:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "pipeline",
  "operation": "getAll",
  "provider": "bitbucket",
  "projectSlug": "acme/widget",
  "returnAll": false,
  "limit": 2
}
```

**Expect:** at most two pipeline results are emitted, and every emitted result
comes from the mocked service response.

### Test: trigger a pipeline

**Given** a valid credential and a mocked successful trigger response:

```json
[{ "json": { "branch": "main" } }]
```

**Parameters:**

```json
{
  "resource": "pipeline",
  "operation": "trigger",
  "provider": "github",
  "projectSlug": "acme/widget",
  "branch": "={{ $json.branch }}"
}
```

**Expect:** one output item containing the service response for the newly
requested pipeline. The executor does not poll or rewrite the response into a
fabricated completion state.

### Test: invalid get request

**Given** a configured credential but no pipeline identifier for `operation =
get`.

**Expect:** validation fails before the CircleCI client is called, with an
error identifying the missing pipeline identifier.

### Test: missing credential

**Given** otherwise valid parameters but no `circleCiApi` credential.

**Expect:** execution fails before the service request with a missing-credential
error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operations | documented | The public node page lists Pipeline with get, get all, and trigger operations. |
| Authentication | documented | The credentials page specifies a personal API token. |
| Main input/output channels | documented by isolated descriptor metadata | Confirmed as one `main` input and one `main` output; the descriptor was used only for this high-level wire fact. |
| Exact request fields and response properties | gap | The public node page does not document a complete parameter schema or response schema; this spec intentionally avoids reconstructing one. |
| Per-item and collection expansion semantics | inferred | Mapped to normal OpenFlow action-node behavior and must be verified by implementation tests. |
| Retry policy and polling | gap | No retry count, backoff policy, or post-trigger polling behavior is promised by the permitted node documentation. |

Confidence is high for the node identity, credential model, resource, and three
documented operations. Confidence is deliberately limited for exact field
names, defaults, pagination mechanics, and response normalization.

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/circle-ci.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
