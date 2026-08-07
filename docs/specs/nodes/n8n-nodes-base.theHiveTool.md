---
type: n8n-nodes-base.theHiveTool
displayName: TheHive Tool
category: Development
versions: [1]
priority: medium
status: specced
---

# TheHive Tool

AI agent tool variant of the [TheHive (v3/v4) node](n8n-nodes-base.theHive.md). Exposes the same 5 resources (Alert, Case, Log, Observable, Task) and their CRUD-plus operations against the TheHive REST API, as tools an AI Agent can invoke dynamically. Parameter values are populated by the AI via `$fromAI()` rather than being set statically in the workflow designer.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.thehive.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/thehive.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.thehivetrigger.md | Public docs only |
| https://docs.thehive-project.org/thehive/legacy/thehive3/api/ | External API docs |
| https://docs.thehive-project.org/thehive/ | External API docs |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

**Note:** No dedicated public docs page exists for `theHiveTool` — the URL `https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.theHiveTool` returns 404. This spec is derived from the base `theHive` node's public docs and the standard Tool-variant patterns documented for other nodes.

## Wire format

- **Type string:** `n8n-nodes-base.theHiveTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `theHiveApi` (required)

### Credential shape (`theHiveApi`)

| field | type | notes |
|-------|------|-------|
| url | string | TheHive server base URL |
| apiKey | string | API key generated from Organization > Create API Key |
| apiVersion | enum | `theHive3` (api v0) or `theHive4` (api v1) |
| ignoreSSLIssues | boolean | Skip SSL certificate validation when enabled |

## Parameters

The node shares the same resource/operation model as the base `theHive` node. The available operations for each resource depend on the API version selected in the credential. Unlike the base node, all parameter values are eligible for `$fromAI()` dynamic population by the AI Agent.

### Resource & Operation

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options: `alert` \| `case` \| `log` \| `observable` \| `task` | `alert` | yes | Which TheHive entity to act on |
| operation | options (dynamic per resource + API version) | varies | yes | CRUD + resource-specific actions |

### Common operation parameters

Each operation accepts parameters appropriate to the selected resource and operation. At the abstraction level required for an AI tool variant:

- **ID** (string) — entity identifier for Get/Update/Delete/Execute Responder/Single-entity operations
- **Body / Fields** (key-value or JSON) — entity fields for Create/Update operations
- **Search filters** (key-value) — filtering criteria for GetAll/Search/Count operations
- **Pagination** — `returnAll` (boolean), `limit` (number, max 500)
- **Sort** — string with `+` (asc) or `-` (desc) prefix, e.g. `+status`

### Resource-specific actions

The following actions are available when supported by the credential's API version:

| Resource | Actions beyond CRUD |
|----------|---------------------|
| Alert | Promote to Case, Merge Into Case, Execute Responder, Update Status |
| Case | Add/Get/Delete Attachment, Get Timeline, Execute Responder |
| Log | Add/Get/Delete Attachment, Execute Responder |
| Observable | Execute Analyzer, Execute Responder |
| Task | Execute Responder |
| Alert/Case | Count (aggregate query) |

### Observable-specific fields

When the resource is `observable`, fields include dataType, data, message, TLP, IOC flag, status, tags, sighted flag, and date range.

## Runtime behavior

### Input

Each input item is processed independently. All parameter values (except the resource/operation selection itself) support `$fromAI()` expressions, allowing the AI agent to supply them dynamically from conversation context.

### Output

Each output item corresponds to one API operation result. For list/search operations that return multiple entities, one output item is produced per result. For single-entity operations (Create, Get, Update, Delete), a single output item contains the API response body. For Delete operations, the output is the deleted entity or an empty confirmation depending on the API version.

### Errors

- API errors (4xx/5xx) surface as node-level errors with the upstream status code and message.
- When `continueOnFail` is enabled, failed items produce zero output rather than halting.
- Network errors (connection refused, timeout) throw immediately regardless of `continueOnFail`.

### Expressions

All value-type parameters accept expression strings, including `$fromAI()` for AI-agent-driven parameter population.

## Acceptance tests

### Test: create an alert via AI tool

**Given** an AI Agent workflow with the TheHive Tool connected.

**When** the AI agent invokes this tool with:
- Resource: `alert`
- Operation: `Create`
- Parameters: `{ "title": "AI-discovered IOC", "description": "Flagged by AI agent", "severity": 2, "type": "internal" }`

**Expect** the tool returns a single output item whose JSON body contains an `id` field (non-empty string) and a `title` matching the input.

### Test: search cases with pagination

**Given** the tool is invoked with:
- Resource: `case`
- Operation: `GetAll`
- Filters: `{ "status": "Open" }`
- `returnAll`: `false`, `limit`: `10`

**Expect** output contains 0–10 items, each with `json.id` and `json.title` fields. If no matching cases exist, output is empty.

### Test: get single observable by ID

**Given** the tool is invoked with:
- Resource: `observable`
- Operation: `Get`
- ID: `~123456`

**Expect** output contains one item with `json.dataType`, `json.data`, and `json.id` fields reflecting the observable entity.

### Test: execute responder on a case

**Given** the tool is invoked with:
- Resource: `case`
- Operation: `Execute Responder`
- ID: `~caseId`
- Responder: selected from the dynamic responder list

**Expect** output contains the responder execution result including a `responderName` or `operation` field indicating which responder was executed.

### Test: update task status

**Given** the tool is invoked with:
- Resource: `task`
- Operation: `Update`
- ID: `~taskId`
- Update Fields: `{ "status": "Completed" }`

**Expect** the returned task has `json.status` equal to `"Completed"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact operation list per resource/version | inferred | Same as base `theHive` node — operations depend on credential API version |
| `$fromAI()` support | inferred from pattern | Standard for all Tool-variant nodes in n8n; no public doc page confirms this specifically |
| Parameter structure | inferred | Shared with the base `theHive` node; the Tool variant merely exposes the same parameters for AI-agent population |
| Response shapes | inferred | Follow the TheHive v3/v4 REST API contract |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/theHiveTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
