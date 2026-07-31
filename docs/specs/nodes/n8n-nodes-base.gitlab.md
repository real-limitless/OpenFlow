---
type: n8n-nodes-base.gitlab
displayName: GitLab
category: Development
versions: [1]
priority: medium
status: specced
---

# GitLab

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gitlab.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/gitlab.md | Public docs only |
| https://docs.gitlab.com/api/rest/ | Third-party service API docs |
| https://docs.gitlab.com/api/projects/ | Third-party service API docs |
| https://docs.gitlab.com/api/repository_files/ | Third-party service API docs |
| https://docs.gitlab.com/api/issues/ | Third-party service API docs |
| https://docs.gitlab.com/api/notes/ | Third-party service API docs |
| https://docs.gitlab.com/api/releases/ | Third-party service API docs |
| https://docs.gitlab.com/api/users/ | Third-party service API docs |
| https://docs.gitlab.com/api/repositories/ | Third-party service API docs |

All sources used for this specification are public documentation. The temporary
corpus was not used to derive nested schemas, defaults, display conditions, or
implementation algorithms.

## Wire format

- **Type string:** `n8n-nodes-base.gitlab`
- **Aliases:** none known
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** one GitLab credential. Public n8n documentation supports either a GitLab API access token or OAuth2; the credential also identifies the GitLab server URL for self-managed instances.

This is an action node, not a trigger. It uses GitLab's versioned REST API and
does not require a binary input or output channel.

## Parameters

The node selects a resource family and an operation. OpenFlow may expose these
choices in any equivalent UI or property grouping; the behavioral contract is
the operation outcome, not the original editor nesting.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | selection | none documented | yes | always | One of File, Issue, Release, Repository, or User. |
| operation | selection | none documented | yes | resource-dependent | The operation described below for the selected resource. |
| project identifier | integer or URL-encoded path | none | conditional | project resources | Identifies the GitLab project. GitLab accepts a numeric ID or namespaced project path. |
| file path and repository ref | strings | none | conditional | file resources | Identifies a file and branch, tag, or commit. File paths and namespaced paths must be encoded as required by the service API. |
| issue identifier | integer | none | conditional | issue resources | Project issue operations use the project's internal issue IID, not an unrelated global issue ID. |
| release tag | string | none | conditional | release resources | Identifies the tag associated with a release. |
| user identifier or search | string, number, or search text | none | conditional | user resources | Selects a user or filters the user repository listing as supported by the service. |
| content and commit metadata | strings and structured values | none | conditional | file create/edit | Carries file content, target branch, and commit message; optional author and encoding information may be passed when supported by GitLab. |
| issue fields | structured values | none | conditional | issue create/edit | Carries title, description, state, labels, assignees, milestone, due date, and other fields supported by the selected issue operation. |
| release fields | structured values | none | conditional | release create/update | Carries tag/ref, name, description, release time, milestones, and asset links where the service operation supports them. |
| list and pagination controls | boolean, number, and service-supported filters | none documented | conditional | list/get-all operations | Controls filtering, ordering, page size, and whether additional pages are retrieved. Exact UI defaults are not part of this spec. |
| expression-capable values | expression-backed scalar or structured values | none | conditional | wherever supported | Resolved per input item before validation and the remote request. |

### Documented resource operations

- **File:** Create, Delete, Edit, Get, and List repository files. Create and Edit
  write content to a branch with a commit message; Get reads file metadata and
  Base64-encoded content; List returns repository tree/file entries.
- **Issue:** Create a new issue, create a new comment on an issue, edit an issue,
  get one issue, and lock an issue. Project issue identifiers are scoped to the
  project.
- **Release:** Create, Delete, Get, Get all, and Update releases. A release is
  associated with a Git tag; creating it may use a branch, tag, or commit ref
  when the tag does not already exist.
- **Repository:** Get one repository and return the issues of a repository.
- **User:** Return the repositories of a user.

## Runtime behavior

### Input

Each input item is processed independently. Configuration values may be static
or expression-backed. Resolved values must identify the selected resource and
operation and satisfy the required service inputs before a request is sent.

The executor must use the configured GitLab server and credential. GitLab REST
requests use the `/api/v4` API root. Namespaced project paths and file paths are
URL-encoded, and issue requests use project-scoped issue IIDs where applicable.

### Output

Each successful operation emits its meaningful GitLab result on `main[0]`.

- A single-resource read emits the returned repository, issue, file, or release
  result.
- A create or edit emits the service response describing the created or changed
  resource or commit.
- A list operation emits all selected records according to the host's
  collection-to-items convention. No returned record may be silently dropped.
- A delete or lock operation emits the service's successful response when one is
  available; an empty successful response is still a successful operation.

The executor must preserve service response data rather than replacing it with
an invented normalized schema. This outcome-level collection behavior is an
OpenFlow mapping requirement inferred from the item-based workflow contract,
not a claim about an undocumented original response wrapper.

### Pagination

GitLab collection endpoints are paginated. The node must support a bounded read
and, where its list configuration requests it, continue through available pages
until the requested bound or end of collection. It must honor service pagination
constraints and avoid fabricating a next page when the service supplies no next
page. The exact page size and UI control names are implementation choices unless
the service requires them for interoperability.

### Errors

- Missing credentials, missing resource identifiers, missing operation-specific
  required values, and invalid combinations fail validation before the request.
- Authentication and authorization failures, missing projects or resources,
  invalid refs, malformed content, rate limits, and other non-success GitLab
  responses fail the node with an actionable service error when available.
- A missing file or repository tree path is an error when GitLab reports `404`;
  it must not be silently converted into an empty successful result.
- With `continueOnFail`, the failed input produces an error item on the same
  output branch and processing continues for unrelated input items, following
  the standard OpenFlow execution contract.

### Expressions

Project, file, issue, release, and user identifiers; content; commit metadata;
issue/release fields; filters; and pagination values may be expression-backed
where the OpenFlow property model permits expressions. Expressions resolve per
input item before validation and the API call.

## Acceptance tests

The GitLab service is mocked. Assertions verify functional outcomes and required
request semantics, not a copy of GitLab's complete response JSON.

### Test: get a repository file

**Given**:

```json
[{ "json": { "project": "acme%2Fwidget", "path": "README.md", "ref": "main" } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "get",
  "project": "={{ $json.project }}",
  "filePath": "={{ $json.path }}",
  "ref": "={{ $json.ref }}"
}
```

**Expect:** one successful `main[0]` item containing the mocked file result,
including the service's content and file identity data. The request targets the
project file endpoint with the requested ref.

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
  "project": "acme/widget",
  "filePath": "docs/hello.txt",
  "branch": "main",
  "content": "hello\n",
  "commitMessage": "Add greeting"
}
```

**Expect:** one successful item. The mocked request contains the project,
encoded file path, branch, content, and commit message, and the output contains
the service's creation response.

### Test: create an issue comment

**Parameters:**

```json
{
  "resource": "issue",
  "operation": "createComment",
  "project": "acme/widget",
  "issueIid": 7,
  "body": "Investigated in the latest run."
}
```

**Expect:** a comment request scoped to project `acme/widget` and issue IID `7`,
with the exact body. The output contains the created note/comment result.

### Test: list releases with a bound

**Parameters:**

```json
{
  "resource": "release",
  "operation": "getAll",
  "project": "acme/widget",
  "returnAll": false,
  "limit": 2
}
```

**Expect:** no more than two release results are emitted, every emitted result
comes from the mocked GitLab collection, and pagination stops at the bound.

### Test: service failure with continue-on-fail

**Given** two input items and a mocked `404` for the first project's issue.

**Expect:** the first item becomes an error item containing an actionable
service failure, the second item is still processed, and the node does not
convert the missing issue into an empty successful result.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation families | documented | Listed on the public n8n GitLab node page. |
| GitLab API root, project path encoding, file refs, issue IID semantics | documented | Defined by GitLab REST, Projects, Repository Files, Issues, and REST overview docs. |
| File, issue note, release, repository, and user outcomes | documented | Derived from the corresponding GitLab API resource docs. |
| API token and OAuth2 credential choices | documented | Listed in the public n8n credential documentation. |
| One input item per operation and output item mapping | inferred | Required as the practical OpenFlow SDK mapping; n8n's public overview does not specify engine item mechanics. |
| Exact property names, nesting, defaults, and display conditions | unknown | Deliberately omitted because they are not required by the public behavioral contract. |
| Full response normalization and collection expansion details | inferred | Implementer should preserve service data and use OpenFlow's standard item convention. |
| Complete GitLab endpoint coverage behind each high-level n8n operation | partial | The public n8n page names outcomes but does not document every field or endpoint mapping. Unsupported fields should remain pass-through only when the GitLab API documents them. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/gitlab.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
