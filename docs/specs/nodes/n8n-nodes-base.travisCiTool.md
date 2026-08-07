---
type: n8n-nodes-base.travisCiTool
displayName: Travis CI (Tool)
category: Development
versions: [1]
priority: medium
status: specced
---

# Travis CI (Tool)

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.travisci.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/travisci.md | Public docs only |

A temporary package descriptor was used only to confirm the wire type string,
the required credential name, the resource/operation list, parameter names, and
defaults. No implementation source was copied into this repository.

## Wire format

- **Type string:** `n8n-nodes-base.travisCiTool`
- **Aliases:** none known
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** required `travisCiApi` credential containing a Travis CI
  personal API token. The credentials page identifies API token as the sole
  supported auth method.

The node is an action node (not a trigger) and is usable as an AI agent tool.
It communicates with the Travis CI API v3.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed selection | build | yes | always | Single supported resource: Build. |
| operation | selection | cancel | yes | resource = build | Cancel, Get, Get Many, Restart, or Trigger a build. |
| buildId | string | empty | conditional | cancel, get, restart | Numeric build identifier for the target build. Expression-capable. |
| returnAll | boolean | false | conditional | getAll | Return all matching builds or cap at a limit. |
| limit | number | 100 | conditional | getAll and returnAll = false | Max results. Min 1, max 500. Expression-capable. |
| slug | string | empty | conditional | trigger | Repository slug in `{owner}/{repo}` format (e.g. `n8n-io/n8n`). Expression-capable. |
| branch | string | empty | conditional | trigger | Branch name to build. Expression-capable. |
| additionalFields | collection | {} | no | get, getAll, trigger | Sub-parameter group for per-operation options. |

### additionalFields sub-parameters

For **Get** and **Get All**:
- **Include** (string) — Comma-separated list of attributes to eager-load (e.g.
  `build.commit`). Expression-capable.

For **Get All** only:
- **Sort By** (selection) — Field to sort results by: `created_at`,
  `finished_at`, `id`, `number`, `started_at`. Default: `number`.
- **Order** (selection) — Sort direction: `asc` or `desc`. Default: `asc`.

For **Trigger**:
- **Message** (string) — Status message attached to the Travis CI request.
  Expression-capable.
- **Merge Mode** (selection) — How to merge the request config into the
  existing build configuration: `deep_merge`, `deep_merge_append`,
  `deep_merge_prepend`, `merge`, `replace`.

## Runtime behavior

### Input

The node consumes items from `main[0]`. Expression-enabled parameters resolve
per item before validation and the API call.

For the **Trigger** operation, the node submits a build request to the Travis CI
API for the given slug and branch. The response is the immediate API result —
the node does not poll for build completion.

For the **Cancel** and **Restart** operations, the node performs the state
transition via the Travis CI API and emits the API response.

For the **Get** operation, the node fetches a single build by ID and emits the
build object.

For the **Get Many** operation, the node fetches builds (optionally sorted and
filtered). When `returnAll = false`, at most `limit` results are returned. The
collection is emitted according to the host's per-item expansion convention.

### Output

Every successful result is emitted on `main[0]` as an item whose `json` value
represents the Travis CI API response for the performed operation.

No binary output is required.

### Errors

- Missing credential, missing buildId (cancel/get/restart), missing slug/ branch
  (trigger), and invalid parameter combinations fail validation before a remote
  request.
- API errors (authentication, authorization, not-found, rate-limit, server
  errors) fail the node with an actionable message including the API error where
  available.
- With `continueOnFail`, a failed item produces an error item on the same output
  branch rather than aborting unrelated items.

### Expressions

The following parameters accept expression strings: `buildId`, `slug`, `branch`,
`limit`, `include`, `message`. Other parameters may also be expression-capable
where the host node property model supports it.

## Acceptance tests

The Travis CI API is mocked in these fixtures. Assertions concern functional
outcomes, not a replica of the Travis CI response schema.

### Test: cancel a build

**Given** input items:

```json
[{ "json": { "id": "12345" } }]
```

**Parameters:**

```json
{
  "resource": "build",
  "operation": "cancel",
  "buildId": "={{ $json.id }}"
}
```

**Expect:** exactly one successful item on `main[0]` containing the Travis CI
API response for the cancelled build.

### Test: get a build

**Given** input items:

```json
[{ "json": { "id": "12345" } }]
```

**Parameters:**

```json
{
  "resource": "build",
  "operation": "get",
  "buildId": "={{ $json.id }}"
}
```

**Expect:** one output item containing the build object from the Travis CI API.

### Test: get many builds with a limit

**Given** a mocked response containing 3 builds:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "build",
  "operation": "getAll",
  "returnAll": false,
  "limit": 2
}
```

**Expect:** at most 2 build results emitted, each from the mocked response.

### Test: trigger a build

**Given** a valid credential and mocked successful trigger response:

```json
[{ "json": { "branch": "main" } }]
```

**Parameters:**

```json
{
  "resource": "build",
  "operation": "trigger",
  "slug": "acme/widget",
  "branch": "={{ $json.branch }}"
}
```

**Expect:** one output item containing the Travis CI API response for the
requested build. The node does not poll or fabricate a completion status.

### Test: missing buildId

**Given** configured credentials with `operation = get` and no `buildId`.

**Expect:** validation fails before the API call with a missing-buildId error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource (Build) and 5 operations | documented | Public node page lists Build with Cancel, Get, Get All, Restart, Trigger. |
| Authentication | documented | Credentials page specifies an API token; no OAuth2 mentioned. |
| Input/output channels | confirmed by descriptor metadata | One `main` input and one `main` output; descriptor used only for this high-level fact. |
| Exact parameter names, defaults, and enum values | confirmed by descriptor | Used to verify the parameter table above; no internal algorithm was extracted. |
| Exact response shape | gap | Public docs do not document the Travis CI API response schema; executor must pass through the Travis CI API response faithfully. |
| Pagination / cursor mechanics | gap | The node's "Get Many" returns a page of builds; the exact pagination behaviour (cursor, offset, etc.) is an implementation detail. |
| Restart operation response | gap | The API response for restart is not publicly documented; the executor should pass through the API response as-is. |

Confidence is high for the node identity, credential model, the single Build
resource, and all five operations. Confidence is limited for exact response
shapes and pagination mechanics.

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/travis-ci.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
