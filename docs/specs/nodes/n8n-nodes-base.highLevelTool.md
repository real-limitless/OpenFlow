---
type: n8n-nodes-base.highLevelTool
displayName: HighLevel (AI Tool)
category: AI Tool
versions: [1]
priority: high
status: specced
---

# HighLevel (AI Tool)

A reduced-surface AI agent tool variant of the HighLevel node. When connected to an AI Agent, the model can dynamically populate parameters using the `$fromAI()` function. Supports **Contact**, **Opportunity**, **Task**, and **Calendar** resources against the HighLevel REST API with a focused set of operations suitable for agent-driven workflows.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.highlevel.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/highlevel.md | Public docs only |
| https://marketplace.gohighlevel.com/docs/ | Third-party service API docs |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.highLevelTool`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `highLevelApi` (API key) **or** `highLevelOAuth2Api` (OAuth2); OAuth2 preferred as v1 API key auth is deprecated

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `oAuth2` | no | `oAuth2` (OAuth2) or `apiKey` (API key for legacy v1) |

### Resource and operation selection

The user selects a resource (Contact, Opportunity, Task, Calendar) which determines available operations:

| Resource | Operations |
|----------|------------|
| Contact | Create or Update (upsert by email/phone), Delete, Get, Get Many, Update |
| Opportunity | Create, Delete, Get, Get Many, Update |
| Task | Create, Delete, Get, Get Many, Update |
| Calendar | Book an Appointment, Get Free Slots |

### Contact operations

| Operation | Key parameters |
|-----------|----------------|
| Create or Update | Email (string), Phone (string), optional: First Name, Last Name, Name, Company, Address, City, State, Postal Code, Website, Tags, Timezone, Custom Fields, Source, Do Not Disturb |
| Delete | Contact ID |
| Get | Contact ID |
| Get Many | Return All (boolean), Limit (number), optional: Query filter, Order, Sort By |
| Update | Contact ID, optional: same fields as Create |
| Lookup | Email (string), Phone (string) — searches by email then phone |

### Opportunity operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Pipeline ID, Stage ID, Contact Identifier (email/phone/ID), Title, Status (open/won/lost/abandoned), optional: Assigned To, Company Name, Monetary Value, Name, Tags |
| Delete | Pipeline ID, Opportunity ID |
| Get | Pipeline ID, Opportunity ID |
| Get Many | Pipeline ID, Return All, Limit, optional: filters (Assigned To, Campaign ID, Stage ID, Status, Query, Start Date, End Date) |
| Update | Pipeline ID, Opportunity ID, optional: same fields as Create |

### Task operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Contact ID, Title, Due Date, optional: Assigned To, Description, Status |
| Delete | Contact ID, Task ID |
| Get | Contact ID, Task ID |
| Get Many | Contact ID, Return All, Limit |
| Update | Contact ID, Task ID, optional: Title, Due Date, Assigned To, Description, Status |

### Calendar operations

| Operation | Key parameters |
|-----------|----------------|
| Book an Appointment | Calendar/Location parameters, start time, end time, contact info |
| Get Free Slots | Calendar/Location parameters, date range |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Resource locators (pipeline, stage, user pickers) are backed by load-options methods that query the HighLevel API
- The surface is a focused subset of full node operations suited for autonomous agent use
- Binary file uploads are not supported in this tool variant

## Runtime behavior

### Input

Consumes items from `main` input. For write operations, field values can be supplied via expressions or AI-populated parameters. Each item triggers one API call using the resolved parameters and the configured credential.

The external service contract is HighLevel's REST API at `https://rest.gohighlevel.com/v1` (API key) or `https://services.leadconnectorhq.com` (OAuth2 v2). Authentication must use the selected credential type.

### Output

**Output[0]** — main result:
- Contact, Opportunity, Task, or Calendar data returned from the HighLevel API
- Create/update operations return the created or updated object data
- Get operations return the requested object
- List operations (`getMany`) return arrays of objects with pagination metadata
- Delete operations return a success confirmation
- Book Appointment returns the appointment details
- Get Free Slots returns an array of available time slots

### Errors

- API errors (auth failures, rate limits, invalid IDs, missing required fields) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Invalid contact identifiers, pipeline IDs, or missing required fields produce actionable error messages
- Rate limiting: HighLevel API rate limits should surface as HTTP 429 errors; automatic retry is not implemented

### Expressions

Parameters tagged as AI-populatable accept expression strings including `$fromAI()`. All string and number fields accept standard n8n expressions. Resource locator fields (Contact ID, Pipeline ID, etc.) accept expressions that resolve to valid HighLevel IDs.

## Acceptance tests

### Test: Create or update a contact via AI agent

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters** (populated by AI model via `$fromAI()`):
```json
{
  "resource": "contact",
  "operation": "create",
  "email": "jane@example.com",
  "additionalFields": {
    "firstName": "Jane",
    "lastName": "Doe",
    "phone": "+12025551234"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<contact-id>",
    "email": "jane@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "phone": "+12025551234"
  }
}]
```

The response must contain the created contact's data from the HighLevel API.

### Test: Get free slots then book appointment

**Given** input items:
```json
[{ "json": {} }]
```

**Step 1** — Get free slots:
```json
{
  "resource": "calendar",
  "operation": "getFreeSlots",
  "calendarId": "<valid-calendar-id>",
  "startDate": "2026-08-10",
  "endDate": "2026-08-10"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "slots": [
      { "start": "2026-08-10T09:00:00Z", "end": "2026-08-10T09:30:00Z" },
      { "start": "2026-08-10T10:00:00Z", "end": "2026-08-10T10:30:00Z" }
    ]
  }
}]
```

**Step 2** — Book appointment using selected slot:
```json
{
  "resource": "calendar",
  "operation": "bookAppointment",
  "calendarId": "<valid-calendar-id>",
  "startTime": "2026-08-10T09:00:00Z",
  "endTime": "2026-08-10T09:30:00Z",
  "email": "jane@example.com",
  "firstName": "Jane",
  "lastName": "Doe"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<appointment-id>",
    "status": "booked",
    "startTime": "2026-08-10T09:00:00Z",
    "endTime": "2026-08-10T09:30:00Z",
    "contactEmail": "jane@example.com"
  }
}]
```

### Test: List opportunities (paginated)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "opportunity",
  "operation": "getAll",
  "pipelineId": "<valid-pipeline-id>",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0]:
```json
[{
  "json": [
    {
      "id": "<opportunity-id-1>",
      "title": "Deal A",
      "status": "open",
      "contactId": "<contact-id>",
      "monetaryValue": 5000
    },
    {
      "id": "<opportunity-id-2>",
      "title": "Deal B",
      "status": "won",
      "contactId": "<contact-id>",
      "monetaryValue": 12000
    }
  ]
}]
```

Each item is an opportunity object. Array length ≤ 10.

### Test: Create and complete a task

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters (create):**
```json
{
  "resource": "task",
  "operation": "create",
  "contactId": "<valid-contact-id>",
  "title": "Follow up on proposal",
  "dueDate": "2026-08-15T00:00:00Z"
}
```

**Expect** output[0] contains the created task with `id`, `title`, `dueDate`, `status: "incompleted"`.

**Parameters (update to completed):**
```json
{
  "resource": "task",
  "operation": "update",
  "contactId": "<valid-contact-id>",
  "taskId": "<task-id-from-create>",
  "updateFields": {
    "status": "completed"
  }
}
```

**Expect** output[0] contains the updated task with `status: "completed"`.

### Test: Error on invalid contact ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": "nonexistent-id-12345"
}
```

**Expect:** Execution fails with an error identifying the invalid contact ID or a 404 from the HighLevel API. With `continueOnFail`, the item appears as an error item per the SDK contract.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | High | Matches the documented full HighLevel node public surface |
| Credential types & auth flow | High | Public credentials docs confirm API key (v1) and OAuth2 (v2) |
| AI tool wrapping pattern | High | Consistent with `slackTool`, `gmailTool`, `googleSheetsTool` and similar AI tool variants |
| Exact parameter names and defaults | Medium | Tool variant reduces surface; exact parameter names inferred from full node and tool pattern |
| API endpoint selection by auth type | Medium | v1 uses `rest.gohighlevel.com/v1`, v2 uses `services.leadconnectorhq.com` |
| `$fromAI()` field coverage | Medium | All string parameters accept expressions; resource locators use load-options |
| Binary upload support | Not supported | Intentionally excluded from this tool variant |
| Calendar-specific parameters | Low | Calendar operations (endpoint, field shapes) not detailed in public n8n docs; inferred from HighLevel API docs |

**Intentionally excluded from this AI Tool variant (available in full `n8n-nodes-base.highLevel`):**
- Contact Lookup operation (email/phone lookup)
- Contact complex Custom Fields nested collection
- Extended Opportunity filter combinations
- Binary send-attachment or file upload paths

## OpenFlow mapping

| Property | Value |
|----------|-------|
| **Definition group** | `tools` |
| **Executor file** | `src/lib/engine/executors/n8n-nodes-base.highLevelTool.ts` |
| **SDK entry point** | `defineNode('n8n-nodes-base.highLevelTool', ...)` |
| **Credential aliases** | `highLevelApi` -> `highLevelApiKey`, `highLevelOAuth2Api` -> `highLevelOAuth2` |

---

## Clean-Room Citation

This spec was produced without reading n8n source implementation. All behavioral details derived from:
1. Public n8n documentation (docs.n8n.io)
2. HighLevel Marketplace API docs (marketplace.gohighlevel.com/docs)
3. CORPUS_DIR used **only** for: type string confirmation on the `highLevel` base node, resource/operation enumeration, and credential class names.
4. Existing `n8n-nodes-base.highLevel` spec consulted for base-level API surface details.
5. Tool pattern established by `n8n-nodes-base.slackTool` spec for AI tool variant structure.

No implementation algorithms, nested parameter schemas, or internal utility functions were copied.
