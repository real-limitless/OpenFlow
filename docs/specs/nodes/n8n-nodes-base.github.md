---
type: n8n-nodes-base.github
displayName: GitHub
category: Development
versions: [1]
priority: medium
status: specced
---

# GitHub

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.github.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/github.md | Public docs only |
| https://docs.github.com/en/rest | Third-party service API docs |

All sources used for this specification are public documentation. The temporary
corpus was used only to confirm the official type string (`n8n-nodes-base.github`)
and credential identifier (`githubApi`); no nested schemas, defaults, display
conditions, or implementation algorithms were derived from it.

## Wire format

- **Type string:** `n8n-nodes-base.github`
- **Aliases:** none known
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** one `githubApi` credential. Public n8n documentation supports
  either a personal access token or OAuth2; the credential also carries the user
  name and an optional GitHub server URL for GitHub Enterprise Server instances.

This is an action node, not a trigger. It talks to the GitHub REST API and does
not require binary input or output channels. It may also be surfaced as an AI
agent tool, in which case parameters may be populated dynamically by the model.

## Parameters

The node selects a resource family and an operation. OpenFlow may expose these
choices in any equivalent property grouping; the behavioral contract is the
operation outcome, not the original editor nesting.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | selection | none documented | yes | always | One of File, Issue, Organization, Release, Repository, Review, User, or Workflow. |
| operation | selection | none documented | yes | resource-dependent | The operation described below for the selected resource. |
| owner and repository | strings | none | conditional | repository-scoped operations | Identifies the GitHub repository (`owner/name`). Some operations require only the owner. |
| file path and branch/ref | strings | none | conditional | file operations | Identifies a file and the branch or commit ref to operate on. File create/edit also carry content, a commit message, and optional author details. |
| issue identifier | integer | none | conditional | issue operations | GitHub issues are identified by their repository-scoped issue number. |
| issue fields | structured values | none | conditional | issue create/edit | Carries title, body, state, labels, assignees, milestone, and other fields the selected issue operation supports. |
| pull request identifier | integer | none | conditional | review operations | Pull request reviews are scoped to a pull request number within a repository. |
| release identifier | integer | none | conditional | release operations | Releases are identified by their release ID; creating one is tied to a Git tag or ref. |
| user identifier or search | string, number, or search text | none | conditional | user operations | Selects a user or filters the user repository listing as supported by the service. |
| workflow identifier | string | none | conditional | workflow operations | Identifies a GitHub Actions workflow by its ID or file name. |
| content and structured payloads | strings and structured values | none | conditional | create/edit/dispatch operations | Carries file content, commit metadata, issue/release fields, review body/event, and workflow dispatch inputs. |
| list and pagination controls | boolean, number, and service-supported filters | none documented | conditional | list/get-all operations | Controls filtering, ordering, page size, and whether additional pages are retrieved. Exact UI defaults are not part of this spec. |
| expression-capable values | expression-backed scalar or structured values | none | conditional | wherever supported | Resolved per input item before validation and the remote request. |

### Documented resource operations

- **File:** Create, Delete, Edit, Get, and List repository files. Create and Edit
  write content to a branch with a commit message; Get reads file metadata and
  Base64-encoded content; List returns the file entries of a path or directory.
- **Issue:** Create a new issue, create a comment on an issue, edit an issue,
  get one issue, and lock an issue.
- **Organization:** Get the repositories of an organization.
- **Release:** Create, Delete, Get, Get many, and Update releases. A release is
  associated with a Git tag or ref.
- **Repository:** Get one repository, get a repository's issues, get the license
  of a repository, get a user profile, get a repository's pull requests, list
  popular (top-referral) paths, and list referrers (traffic sources).
- **Review:** Create, Get, Get many, and Update pull request reviews.
- **User:** Get the repositories of a user and invite a user to a repository.
- **Workflow:** Disable, Dispatch (trigger), Enable, Get, Get usage, and List
  GitHub Actions workflows.

## Runtime behavior

### Input

Each input item is processed independently. Configuration values may be static
or expression-backed. Resolved values must identify the selected resource and
operation and satisfy the required service inputs before a request is sent.

The executor must use the configured GitHub server and `githubApi` credential.
Repository-scoped requests target the configured owner/name; user and
organization repository listings use the owner scope provided by the service.

### Output

Each successful operation emits its meaningful GitHub result on `main[0]`.

- A single-resource read emits the returned repository, file, issue, release,
  review, user profile, license, or workflow result.
- A create or edit emits the service response describing the created or changed
  resource or commit.
- A list operation emits all selected records according to the host's
  collection-to-items convention. No returned record may be silently dropped.
- A delete, lock, disable, enable, or dispatch operation emits the service's
  successful response when one is available; an empty successful response is
  still a successful operation.

The executor must preserve service response data rather than replacing it with
an invented normalized schema. This outcome-level collection behavior is an
OpenFlow mapping requirement inferred from the item-based workflow contract, not
a claim about an undocumented original response wrapper.

### Pagination

GitHub collection endpoints are paginated. The node must support a bounded read
and, where its list configuration requests it, continue through available pages
until the requested bound or end of collection. It must honor service pagination
constraints and avoid fabricating a next page when the service supplies no next
page. The exact page size and UI control names are implementation choices unless
the service requires them for interoperability.

### Errors

- Missing credentials, missing owner/repository or resource identifiers, missing
  operation-specific required values, and invalid combinations fail validation
  before the request.
- Authentication and authorization failures, missing repositories, files,
  issues, or releases, invalid refs, malformed content, rate limits, and other
  non-success GitHub responses fail the node with an actionable service error
  when available.
- A missing repository, file, issue, release, or workflow is an error when
  GitHub reports `404`; it must not be silently converted into an empty
  successful result.
- With `continueOnFail`, the failed input produces an error item on the same
  output branch and processing continues for unrelated input items, following
  the standard OpenFlow execution contract.

### Expressions

Owner, repository, file, ref, issue, pull request, release, user, workflow, and
repository identifiers; content; commit metadata; issue/release/review fields;
workflow dispatch inputs; filters; and pagination values may be expression-backed
where the OpenFlow property model permits expressions. Expressions resolve per
input item before validation and the API call.

## Acceptance tests

The GitHub service is mocked. Assertions verify functional outcomes and required
request semantics, not a copy of GitHub's complete response JSON.

### Test: get a repository file

**Given**:

```json
[{ "json": { "owner": "acme", "repo": "widget", "path": "README.md", "branch": "main" } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "get",
  "owner": "={{ $json.owner }}",
  "repository": "={{ $json.repo }}",
  "filePath": "={{ $json.path }}",
  "branch": "={{ $json.branch }}"
}
```

**Expect:** one successful `main[0]` item containing the mocked file result,
including the service's content and file identity data. The request targets the
repository file endpoint with the requested ref.

### Test: create a file with a commit

**Given** a valid credential and an empty input item:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "create",
  "owner": "acme",
  "repository": "widget",
  "filePath": "docs/hello.txt",
  "branch": "main",
  "content": "hello\n",
  "commitMessage": "Add greeting"
}
```

**Expect:** one successful item. The mocked request contains the owner,
repository, encoded file path, branch, content, and commit message, and the
output contains the service's creation response.

### Test: create an issue and comment

**Parameters:**

```json
{
  "resource": "issue",
  "operation": "create",
  "owner": "acme",
  "repository": "widget",
  "title": "Bug report",
  "body": "The widget crashes on startup."
}
```

**Expect:** a create-issue request scoped to `acme/widget` with the exact title
and body, and an output containing the created issue result. A second fixture
using `operation: "createComment"` and an issue number must target the issue
comment endpoint with the provided body.

### Test: list releases with a bound

**Parameters:**

```json
{
  "resource": "release",
  "operation": "getAll",
  "owner": "acme",
  "repository": "widget",
  "returnAll": false,
  "limit": 2
}
```

**Expect:** no more than two release results are emitted, every emitted result
comes from the mocked GitHub collection, and pagination stops at the bound.

### Test: workflow dispatch

**Parameters:**

```json
{
  "resource": "workflow",
  "operation": "dispatch",
  "owner": "acme",
  "repository": "widget",
  "workflowId": "ci.yml",
  "ref": "main",
  "inputs": { "environment": "production" }
}
```

**Expect:** a workflow-dispatch request for workflow `ci.yml` on `acme/widget`
with the given ref and inputs, and a successful (possibly empty) operation
result.

### Test: service failure with continue-on-fail

**Given** two input items and a mocked `404` for the first repository's file.

**Expect:** the first item becomes an error item containing an actionable
service failure, the second item is still processed, and the node does not
convert the missing file into an empty successful result.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation families | documented | Listed on the public n8n GitHub node page. |
| Credential modes and fields | documented | API access token or OAuth2; user name and optional GitHub server URL for Enterprise, per the public n8n credential docs. |
| Underlying GitHub REST API | documented | GitHub's public REST documentation covers the contents, issues, repos, releases, pulls/reviews, traffic, and actions/workflows endpoints these operations map to. |
| One input item per operation and output item mapping | inferred | Required as the practical OpenFlow SDK mapping; n8n's public overview does not specify engine item mechanics. |
| Exact property names, nesting, defaults, and display conditions | unknown | Deliberately omitted because they are not required by the public behavioral contract. |
| Full response normalization and collection expansion details | inferred | Implementer should preserve service data and use OpenFlow's standard item convention. |
| Exact endpoint mapping behind each high-level n8n operation | partial | The public n8n page names outcomes but does not document every endpoint or field. Unsupported fields should remain pass-through only when the GitHub REST API documents them. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/github.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
