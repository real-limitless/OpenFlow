---
type: n8n-nodes-base.jenkins
displayName: Jenkins
category: App
versions: [1]
priority: medium
status: specced
---

# Jenkins

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.jenkins.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/jenkins.md | Public docs only |
| https://www.jenkins.io/doc/book/using/remote-access-api/ | Third-party service API docs |

The temporary corpus was used only to confirm the published type identity and
the high-level resource/operation inventory. No package source was consulted or
copied.

## Wire format

- **Type string:** `n8n-nodes-base.jenkins`
- **Aliases:** none documented
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** required Jenkins API credential containing a Jenkins username,
  personal API token, and Jenkins instance URL. The credential uses the token
  with the username for authenticated Jenkins requests.

## Parameters

The node exposes a resource and an operation. Exact UI nesting and defaults are
not part of this contract; the executor must accept equivalent configuration
that expresses these actions.

| Parameter | Type | Default | Required | Notes |
|-----------|------|---------|----------|-------|
| `resource` | enum-like string | implementation-defined | yes | One of `build`, `instance`, or `job`. |
| `operation` | enum-like string | implementation-defined | yes | Operation valid for the selected resource. |
| `job` | string or expression | none | for job-specific actions | Identifies the Jenkins job, including jobs addressed through nested paths. |
| `sourceJob` | string or expression | none | for copy | Existing job to copy. |
| `destinationJob` | string or expression | none | for copy/create as applicable | New or target job name. |
| `jobConfiguration` | string/object | none | for create | Jenkins job configuration supplied in the form accepted by the service. |
| `buildParameters` | object/map | none | for parameterized trigger | Values to submit to a job configured to accept build parameters. |

Resource operations documented by the node are:

- **Build:** list builds for a selected job.
- **Instance:** cancel quiet-down, enter quiet mode, immediate restart, safe
  restart after running jobs finish, safe shutdown after running jobs finish,
  and immediate shutdown.
- **Job:** copy a job, create a job, trigger a job, and trigger a job with
  parameters.

## Runtime behavior

### Input

Consume the incoming `main` items according to the workflow engine's normal
node execution model. Configuration identifies the Jenkins instance and the
selected action. Where an action is independent of item data, one request is
made for the execution; expressions may resolve configuration from the current
item when supported by the OpenFlow expression runtime.

### External service contract

Use Jenkins' remote access API beneath the configured instance URL. Jenkins
exposes resource-specific API paths rather than one universal endpoint. A job
without parameters is triggered through the job build action; a parameterized
job uses the corresponding build-with-parameters action. Requests requiring
authentication use HTTP Basic authentication with the configured username and
API token. API tokens are preferred over legacy password/crumb approaches.

The executor must preserve job names and nested job paths as service
identifiers, URL-encode path components as required, and send build parameter
values without silently dropping false, zero, or empty-string values.

### Output

Return successful service results on output index 0 as OpenFlow items. Each
result must retain the service response data needed to use the operation's
outcome downstream, without requiring one invented universal response schema.

- List Builds returns the selected job's build records or the service's
  equivalent collection.
- Trigger operations return the service acknowledgement and any queue/build
  reference supplied by Jenkins.
- Create and copy return the service acknowledgement and resulting job
  reference when supplied.
- Instance operations return the service acknowledgement/status when supplied.

Input item data should remain available when the operation produces a result
that is associated with an input item. An operation that has no response body
still emits a successful item containing a minimal success/acknowledgement
record rather than fabricating build completion data.

### Errors

Fail the node for missing credentials, missing action-specific identifiers,
invalid action combinations, transport failures, authentication failures, and
non-success Jenkins responses unless the workflow explicitly enables
`continueOnFail`. Errors should include the selected resource/operation and
the service status or message when available. A trigger acknowledgement is not
the same as build completion; the node must not claim a build completed unless
the service response explicitly reports that outcome.

### Expressions

String identifiers and request values that are exposed as configurable node
parameters may accept OpenFlow expression strings. Expressions resolve before
validation and request construction. Secret credential values are supplied by
the credential system and are not copied into ordinary output data.

## Acceptance tests

### Test: list builds

**Given** one input item and a configured Jenkins credential, with resource
`build`, operation `list`, and a valid job identifier.

**Expect** one output item whose data contains the build collection returned by
the mock Jenkins API, and no request is made to a trigger endpoint.

### Test: trigger without parameters

**Given** resource `job`, operation `trigger`, and job `release`.

**Expect** a POST to the job's build action using the configured Jenkins base
URL and Basic authentication. The output contains the returned queue/build
acknowledgement and does not report completion unless the mock response does.

### Test: trigger with parameters

**Given** resource `job`, operation `trigger with parameters`, job `release`,
and `{ "environment": "staging", "dryRun": false }`.

**Expect** the parameterized build action receives both values unchanged,
including the boolean `false`, and the output contains the service
acknowledgement.

### Test: instance safe restart

**Given** resource `instance` and the safe-restart operation.

**Expect** the executor calls the Jenkins instance action for restarting after
running jobs finish, returns the service acknowledgement, and does not treat
the request as an immediate restart.

### Test: service failure

**Given** a valid operation and a Jenkins response with HTTP 401 or 404.

**Expect** execution fails with the HTTP status and operation context. With
`continueOnFail`, the workflow receives the engine's standard error item rather
than a fabricated successful Jenkins result.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type, credentials, resources, and operation families | documented | Listed by the n8n Jenkins node and credential pages; type and ports are confirmed by published node metadata. |
| Jenkins username, API token, and instance URL | documented | Required credential concepts are listed in the public credential guide. |
| Remote API style, build triggers, parameterized triggers, and job creation/copying | documented | Covered by Jenkins' Remote Access API documentation. |
| Exact parameter names, defaults, UI visibility rules, and response property names | not documented | Intentionally abstracted to avoid reconstructing the original schema. |
| Per-item versus once-per-execution request granularity | inferred | Use normal OpenFlow execution semantics and avoid duplicate independent requests where the selected action has no item-dependent values. |
| Exact endpoint for each instance lifecycle action and job copy/create payload | inferred | Jenkins documents the capabilities and points to instance-local API help; executor tests should bind these actions to a mock service contract. |
| Build-list pagination/depth behavior | inferred | Jenkins' API supports depth controls, but the node page does not define whether or how the node exposes them. |

## OpenFlow mapping

- **Definition group:** `core` (app integration)
- **Executor file:** `src/lib/engine/executors/jenkins.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
