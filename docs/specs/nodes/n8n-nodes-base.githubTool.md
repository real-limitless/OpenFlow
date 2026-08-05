---
type: n8n-nodes-base.githubTool
displayName: GitHub Tool
category: Development
versions: [1]
priority: medium
status: specced
---

# GitHub Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.github.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/github.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.github.com/en/rest | Third-party service API docs |

All sources used for this specification are public documentation. The temporary corpus was used only to confirm the official type string (`n8n-nodes-base.githubTool`) and credential identifier (`githubApi`); no nested schemas, defaults, display conditions, or implementation algorithms were derived from it.

## Wire format

- **Type string:** `n8n-nodes-base.githubTool`
- **Aliases:** none known
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** one `githubApi` credential. Supports personal access token or OAuth2; credential also carries the user name and an optional GitHub server URL for GitHub Enterprise Server instances.

This node is an AI agent tool variant of the standard GitHub action node. It shares the same credential type and underlying GitHub REST API operations. When connected to an AI agent, it uses `$fromAI()` dynamic parameter population so that the AI model can supply resource identifiers, content, and operation-specific values at runtime. The tool surfaces a `description` and `name` that the agent uses to decide when to call it.

## Parameters

The node selects a resource family and an operation, mirroring the standard GitHub node's behavior. OpenFlow may expose these choices in any equivalent property grouping; the behavioral contract is the operation outcome, not the original editor nesting.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | selection | none documented | yes | always | One of File, Issue, Organization, Release, Repository, Review, User, or Workflow. |
| operation | selection | none documented | yes | resource-dependent | The operation described below for the selected resource. |
| owner and repository | strings | none | conditional | repository-scoped operations | Identifies the GitHub repository (`owner/name`). May be populated by `$fromAI()`. |
| file path and branch/ref | strings | none | conditional | file operations | Identifies a file and the branch or commit ref to operate on. |
| issue identifier | integer | none | conditional | issue operations | GitHub issues are identified by their repository-scoped issue number. |
| release identifier | integer | none | conditional | release operations | Releases are identified by their release ID. |
| workflow identifier | string | none | conditional | workflow operations | Identifies a GitHub Actions workflow by its file name or ID. |
| content and structured payloads | strings and structured values | none | conditional | create/edit/dispatch operations | Carries file content, issue/release fields, review body/event, and workflow dispatch inputs. May be populated dynamically by the AI model. |
| list and pagination controls | boolean, number | none documented | conditional | list/get-all operations | Controls filtering, ordering, page size, and whether additional pages are retrieved. |
| tool name | string | node name (with spaces replaced by underscores) | no | always | The tool name exposed to the AI agent for function-calling. |
| tool description | string | auto-generated | no | always | Describes when the agent should invoke this tool. |
| expression-capable values | expression-backed scalar or structured values | none | conditional | wherever supported | Resolved per input item before validation and the remote request. `$fromAI()` is supported for dynamic model-driven parameter population. |

### Documented resource operations

Same as the standard GitHub node:

- **File:** Create, Delete, Edit, Get, List
- **Issue:** Create, Create Comment, Edit, Get, Lock
- **Organization:** Get Repositories
- **Release:** Create, Delete, Get, Get Many, Update
- **Repository:** Get, Get Issues, Get License, Get Profile, Get Pull Requests, List Popular Paths, List Referrers
- **Review:** Create, Get, Get Many, Update
- **User:** Get Repositories, Invite
- **Workflow:** Disable, Dispatch, Enable, Get, Get Usage, List

## Runtime behavior

### Input

Each input item is processed independently. Configuration values may be static, expression-backed, or populated via `$fromAI()` dynamic AI model inference. Resolved values must identify the selected resource and operation and satisfy required service inputs before a request is sent.

The executor must use the configured GitHub server and `githubApi` credential. Repository-scoped requests target the configured owner/name.

### Output

Each successful operation emits its meaningful GitHub result on `main[0]`, identical to the standard GitHub node behavior:

- A single-resource read emits the returned repository, file, issue, release, review, user profile, license, or workflow result.
- A create or edit emits the service response.
- A list operation emits records according to the host's collection-to-items convention.
- A delete, lock, disable, enable, or dispatch operation emits the service's successful response or an empty successful result.

The executor must preserve service response data.

### Errors

- Missing credentials, required resource identifiers, or invalid combinations fail validation before the request.
- Authentication and authorization failures, missing resources, rate limits, and other non-success GitHub responses fail the node with an actionable service error.
- `continueOnFail` produces an error item on the same output branch and processing continues.

### Expressions

All resource identifiers, content, and operational parameters may be expression-backed where the OpenFlow property model permits expressions. `$fromAI()` function calls are supported for tool-parameter population when the agent invokes this tool.

## Acceptance tests

### Test: tool creates a GitHub issue via $fromAI

**Given** a connected AI agent workflow context with data about a repository.

**Parameters:**

```json
{
  "resource": "issue",
  "operation": "create",
  "owner": "={{ $fromAI('owner') }}",
  "repository": "={{ $fromAI('repo') }}",
  "title": "={{ $fromAI('title') }}",
  "body": "={{ $fromAI('body') }}"
}
```

**Expect:** a create-issue request is sent to the GitHub REST API with the model-supplied owner, repository, title, and body. The output contains the created issue result.

### Test: file listing with bound

**Parameters:**

```json
{
  "resource": "file",
  "operation": "list",
  "owner": "acme",
  "repository": "widget",
  "filePath": "src/",
  "branch": "main",
  "returnAll": false
}
```

**Expect:** the GitHub API is called with the repo path `acme/widget`, path `src/`, and ref `main`. The output contains the file listing entries from the service response.

### Test: workflow dispatch with inputs

**Parameters:**

```json
{
  "resource": "workflow",
  "operation": "dispatch",
  "owner": "acme",
  "repository": "widget",
  "workflowId": "ci.yml",
  "ref": "main",
  "inputs": { "environment": "staging" }
}
```

**Expect:** a workflow-dispatch request for workflow `ci.yml` on `acme/widget` with ref `main` and the provided inputs, outputting a successful (possibly empty) operation result.

### Test: release create with tag

**Parameters:**

```json
{
  "resource": "release",
  "operation": "create",
  "owner": "acme",
  "repository": "widget",
  "tag": "v1.2.3",
  "releaseName": "v1.2.3",
  "body": "Release notes"
}
```

**Expect:** a create-release request scoped to `acme/widget` with the exact tag and release body, outputting the service's release creation response.

### Test: service 404 with continue-on-fail

**Given** two input items and a mocked `404` for the first file.

**Expect:** the first item becomes an error item, the second item is processed successfully, and the node does not convert the missing file into an empty successful result.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation families | documented | Listed on the public n8n GitHub node page; the tool variant uses the same operations. |
| Credential modes and fields | documented | API access token or OAuth2; user name and optional GitHub server URL, per the public n8n credential docs. |
| `$fromAI()` dynamic parameter support | documented | Public n8n documentation states the GitHub node "can be used as an AI tool" and supports `$fromAI()` for parameter population. |
| Underlying GitHub REST API | documented | GitHub's public REST documentation covers all endpoints these operations map to. |
| Tool name derivation and description | inferred | Tool sub-nodes derive the tool name from the node name and auto-generate a description; exact behavior matches other tool-sub-node patterns. |
| Exact property names, nesting, defaults, and display conditions | unknown | Deliberately omitted because they are not required by the public behavioral contract. |
| Full response normalization and collection expansion details | inferred | Implementer should preserve service data and use OpenFlow's standard item convention. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/githubTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
