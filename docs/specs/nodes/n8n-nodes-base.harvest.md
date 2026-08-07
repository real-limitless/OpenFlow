---
type: n8n-nodes-base.harvest
displayName: Harvest
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Harvest

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.harvest.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/harvest.md | Public docs only |
| https://help.getharvest.com/api-v2/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.harvest`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `harvestApi` (Personal Access Token with Account ID) or `harvestOAuth2Api` (OAuth2)

## Parameters

Resource selection is required for all operations. Each resource exposes CRUD-like operations against the Harvest REST API v2.

### Resources and operations

| Resource | Operations |
|----------|-----------|
| Client | Create, Delete, Get, GetAll, Update |
| Company | Get (retrieves the currently authenticated user's company) |
| Contact | Create, Delete, Get, GetAll, Update |
| Estimate | Create, Delete, Get, GetAll, Update |
| Expense | Create, Delete, Get, GetAll, Update |
| Invoice | Create, Delete, Get, GetAll, Update |
| Project | Create, Delete, Get, GetAll, Update |
| Task | Create, Delete, Get, GetAll, Update |
| Time Entry | Create, Create via start/end time, Delete, DeleteExternalReference, Get, GetAll, Restart, Stop, Update |
| User | Create, Delete, Get, GetAll, GetMe, Update |

### Common parameter families

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | — | yes | — | One of: Client, Company, Contact, Estimate, Expense, Invoice, Project, Task, Time Entry, User |
| operation | options | — | yes | — | Determined by resource selection |
| returnAll | boolean | false | no | getAll operations | Returns all matching records instead of paginating |
| limit | number | 50 | no | getAll operations, returnAll=false | Max items per page (Harvest default is 50) |
| filters | collection | — | no | getAll operations | Query parameters for filtering result sets (updatedSince, clientId, projectId, etc.) |
| updateFields | collection | — | no | update operations | Modifiable fields for the selected resource |
| additionalFields | collection | — | no | create/update operations | Optional fields beyond the minimum required |

### Resource-specific notes

- **Client:** Create/Update accept `name`, `is_active` (default true), `address`, `currency` (default "USD").
- **Company:** No write operations; returns company profile for the authenticated account.
- **Contact:** Create/Update accept `client_id`, `first_name`, `last_name`, `email`, `phone`, `title`.
- **Estimate:** Create/Update accept `client_id`, `number`, `currency`, `line_items` (array of { kind, description, quantity, unit_price, taxable }), `notes`.
- **Expense:** Create requires `project_id`, `expense_category_id`, `spent_date`, `units` (or `total_cost`). Update accepts `notes`, `billable`, `receipt`.
- **Invoice:** Create requires `client_id`. Accepts line items, discounts, taxes, notes, payment terms. Update accepts same fields.
- **Project:** Create requires `client_id`, `name`. Accepts `code`, `is_active`, `is_billable`, `bill_by`, `budget`, `budget_by`, `notify_when_over_budget`, `over_budget_notification_percentage`, `show_budget_to_all`, `cost_budget`, `cost_budget_include_expenses`, `fee`, `notes`, `starts_on`, `ends_on`.
- **Task:** Create requires `name`. Accepts `billable_by_default` (default true), `default_hourly_rate`, `is_active` (default true), `will_create_as_project_task`.
- **Time Entry:** Create by duration requires `project_id`, `task_id`, `spent_date`, `hours`. Create by start/end time requires `project_id`, `task_id`, `spent_date`, `started_time`, `ended_time`. Other operations: Restart (reopens a stopped entry), Stop (stops a running entry), DeleteExternalReference (removes external reference).
- **User:** Create requires `first_name`, `last_name`, `email`. Accepts `timezone`, `is_active`, `is_contractor`, `is_admin`, `is_project_manager`, `can_see_rates`, `can_create_projects`, `can_create_invoices`, `default_hourly_rate`, `cost_rate`, `roles`, `access_roles`. **GetMe** returns the currently authenticated user.

## Runtime behavior

### Input

Each input item is processed independently. For create/update/delete operations, one API call is made per item. For getAll/get operations, a single API call retrieves data and the result is attached to every input item.

### Output

- **Create/Update:** Returns the API response object for the created or updated resource (e.g., `{ "id": 123, "name": "...", ... }`) including all server-defined fields.
- **Get:** Returns a single resource object.
- **GetAll:** Returns an object with `results` (array of resource objects) and `pageCount` (number of pages). If `returnAll` is true, all pages are fetched and coalesced into a single `results` array.
- **Delete:** Returns `{ "success": true }`.
- **GetMe (User):** Returns the authenticated user profile object.
- **Company Get:** Returns the company object for the authenticated account.
- **Restart/Stop (Time Entry):** Returns the updated time entry object.
- **DeleteExternalReference (Time Entry):** Returns `{ "success": true }`.

### Errors

- Non-2xx responses from the Harvest API throw an error with the HTTP status code and response body.
- If `continueOnFail` is enabled, the failing item is returned with an `error` property and processing continues to the next item.
- Rate limiting (429) is handled at the HTTP client level; the node does not implement retry logic.

### Expressions

All string, number, and boolean parameters accept expressions.

### API mapping

The node wraps the Harvest REST API v2 (`https://api.harvestapp.com/v2/`). Each resource maps to a corresponding endpoint path:

- Clients: `/v2/clients`
- Company: `/v2/company`
- Contacts: `/v2/contacts`
- Estimates: `/v2/estimates`
- Expenses: `/v2/expenses`
- Invoices: `/v2/invoices`
- Projects: `/v2/projects`
- Tasks: `/v2/tasks`
- Time Entries: `/v2/time_entries`
- Users: `/v2/users`

Authentication uses a Bearer token (personal access token) or OAuth2 access token, with the Harvest Account ID sent in the `Harvest-Account-ID` header.

## Acceptance tests

### Test: get all clients

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Client",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0].json has `results` (array) and `pageCount` (number). Each result has `id` (number), `name` (string), `is_active` (boolean), `currency` (string), `created_at` (string), `updated_at` (string).

### Test: create a time entry by duration

**Given** input items:

```json
[{ "json": { "projectId": 123, "taskId": 456 } }]
```

**Parameters:**

```json
{
  "resource": "Time Entry",
  "operation": "create",
  "project_id": "={{ $json.projectId }}",
  "task_id": "={{ $json.taskId }}",
  "spent_date": "2025-01-15",
  "hours": 3.5
}
```

**Expect** output[0].json has `id` (number), `project` (object with `id` and `name`), `task` (object with `id` and `name`), `spent_date` ("2025-01-15"), `hours` (3.5), `is_running` (false).

### Test: get authenticated user

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "User",
  "operation": "getMe"
}
```

**Expect** output[0].json has `id` (number), `first_name` (string), `last_name` (string), `email` (string), `timezone` (string).

### Test: delete a client

**Given** input items:

```json
[{ "json": { "clientId": 789 } }]
```

**Parameters:**

```json
{
  "resource": "Client",
  "operation": "delete",
  "client_id": "={{ $json.clientId }}"
}
```

**Expect** output[0].json has `success: true`.

### Test: company get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Company",
  "operation": "get"
}
```

**Expect** output[0].json has `base_uri` (string), `full_domain` (string), `name` (string), `is_active` (boolean), `week_start_day` (string), `time_format` (string).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | documented | Public n8n docs enumerate all 10 resources with their operations |
| Authentication | documented | Harvest docs: Personal Access Token + Account ID, or OAuth2 |
| Harvest REST API v2 contract | documented | Harvest API docs confirm endpoints, request/response shapes |
| Detailed field schemas per operation | inferred | Field names follow Harvest API v2 conventions; exact parameter nesting in n8n UI is not fully described in public n8n docs |
| Pagination behavior | inferred | Harvest API v2 uses pagination with `page`, `per_page` params; n8n wrapper abstracts this |
| Time entry dual creation modes | documented | Public docs list both "duration" and "start/end time" creation variants |
| Rate limiting details | documented | Harvest enforces rate limits per OAuth/PA-token; no built-in retry in node contract |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/harvest.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
