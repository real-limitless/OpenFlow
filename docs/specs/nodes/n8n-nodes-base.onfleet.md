---
type: n8n-nodes-base.onfleet
displayName: Onfleet
category: Miscellaneous
versions: [1]
priority: medium
status: specced
---

# Onfleet

Action node that wraps the Onfleet REST API (v2, base URL `https://onfleet.com/api/v2`) for last-mile delivery management. Supports 8 resources — Administrator, Container, Destination, Hub, Organization, Recipient, Task, Team, Worker, plus Webhook management (shared with the trigger node).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.onfleet/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/onfleet/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.onfleettrigger/ | Public docs only |
| https://docs.onfleet.com/reference/introduction | Public docs only |

Public docs only. No n8n engine source was consulted.

## Wire format

- **Type string:** `n8n-nodes-base.onfleet`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `onfleetApi` (API-key-based HTTP Basic Auth)

### Credential requirements

The `onfleetApi` credential stores a single API key string. Requests are authenticated as HTTP Basic Auth with the API key as the username and an empty password, targeting `https://onfleet.com/api/v2`.

## Parameters

### Resource selector

The user first selects a resource from the following list:

- Administrator
- Container
- Destination
- Hub
- Organization
- Recipient
- Task
- Team
- Worker
- Webhook

### Resource operations and required fields

Each resource exposes a set of operations. The following tables list the operation name and the high-level parameter categories required. Detailed field names and nesting are intentionally abstracted.

#### Administrator

| operation | required inputs | notes |
|-----------|----------------|-------|
| Create | name, email, phone | Also accepts isReadOnly flag |
| Delete | adminId | ID of the admin to remove |
| GetAll | (none) | Lists all admins for the organization |
| Update | adminId | At least one updatable field (name, email, phone, isReadOnly) |

#### Container

| operation | required inputs | notes |
|-----------|----------------|-------|
| Get | containerType, containerId | Returns the container's tasks and metadata |
| Add Task | containerType, containerId, taskId | Appends a task at the given index (or end) |
| Replace Tasks | containerType, containerId, taskIds | Fully replaces all tasks in the container |

Container types are `ORGANIZATION`, `WORKER`, `TEAM`.

#### Destination

| operation | required inputs | notes |
|-----------|----------------|-------|
| Create | address object | Supports parsed (number, street, city, state, postalCode, country, apartment) or unparsed (single string) address formats; optional location [lng, lat], notes, language option |
| Get | destinationId | |

#### Hub

| operation | required inputs | notes |
|-----------|----------------|-------|
| Create | name, address | Same address format as Destination; optional teams list |
| GetAll | (none) | |
| Update | hubId | At least one field to update |

#### Organization

| operation | required inputs | notes |
|-----------|----------------|-------|
| Get | (none) | Returns own organization details (ID, name, email, phone, address, logo, timezone, etc.) |
| Get Connected Organization | organizationId | Returns details of a connected organization (for multi-org setups) |

#### Recipient

| operation | required inputs | notes |
|-----------|----------------|-------|
| Create | name, phone | Optional: notes, skipSMSNotifications, skipPhoneNumberValidation |
| Get | recipientId | |
| Update | recipientId | At least one field to update |

#### Task

| operation | required inputs | notes |
|-----------|----------------|-------|
| Create | See Create Task below | |
| Clone | taskId | Optional overrides for destination, recipients, notes, completeAfter/Before, pickupTask, serviceTime; options for includeMetadata, includeBarcodes, includeDependencies |
| Complete | taskId, completionDetails | completionDetails: { success: boolean, notes?: string } |
| Delete | taskId | |
| GetAll | (none) | Optional filters: from, to, lastId, state (comma-sep), worker, completeBefore, completeAfter, dependencies |
| Get | taskId | |
| Update | taskId | Fields to update (same subset as Create minus destination/recipients which are immutable after creation) |

**Create Task** accepts:
- **Destination** — inline object (parsed or unparsed address) or existing destination ID
- **Recipients** — array of inline recipient objects (name + phone) or existing recipient IDs (max 1)
- **Scheduling** — completeAfter (unix ms), completeBefore (unix ms)
- **Properties** — merchant, executor, pickupTask, notes, quantity, serviceTime, recipientName (override), recipientNotes (override), recipientSkipSMSNotifications (override), useMerchantForProxy
- **Assignment** — autoAssign object ({ mode: "distance" | "load" }) or container object ({ type, worker? | team? })
- **Dependencies** — array of task IDs
- **Requirements** — completion requirements object (signature, photo, notes, etc.)
- **Barcodes** — array of barcode requirement objects
- **Appearance** — triangleColor value
- **Custom fields** — array of custom field objects

#### Team

| operation | required inputs | notes |
|-----------|----------------|-------|
| Auto Dispatch | teamId | Optional: maxTasksPerRoute, taskTimeWindow, scheduleTimeWindow, serviceTime, routeEnd, maxAllowedDelay |
| Create | name | Optional: workers (IDs), managers (IDs), hub, enableSelfAssignment |
| Delete | teamId | |
| Get | teamId | |
| GetAll | (none) | |
| Get Estimated Time | teamId, dropoffLocation, pickupLocation | Optional: pickupTime, restrictedVehicleTypes, serviceTime |
| Update | teamId | At least one field to update |

#### Worker

| operation | required inputs | notes |
|-----------|----------------|-------|
| Create | name, phone | Optional: vehicle (type, description, licensePlate, color), teams, capacity, displayName |
| Delete | workerId | |
| Get | workerId | |
| GetAll | (none) | Optional filters: filter (by location string), teams (comma-sep), states (comma-sep state codes), phones (comma-sep), analytics (boolean string) |
| Get Schedule | workerId | Returns the worker's schedule entries |
| Update | workerId | At least one field to update |

#### Webhook

| operation | required inputs | notes |
|-----------|----------------|-------|
| Create | url, trigger | Trigger is a numeric ID (0–30) selecting the event type; optional name, threshold (seconds for some triggers) |
| Delete | webhookId | |
| GetAll | (none) | |

## Runtime behavior

### Input

Each input item (with a `json` property) is processed independently. The node reads parameter values from the item's JSON data (expression evaluation) or from fixed parameter values set in the workflow configuration. For resources that accept object parameters (address, destination, autoAssign, etc.), the node typically expects the user to provide these as nested JSON or through sub-parameters.

### Output

On success, each input item produces one output item containing the full API response body under `json`. For list operations (GetAll), the response is typically an array of objects — the node emits one output item per array element (fan-out).

The output shape mirrors the Onfleet REST API response for the given endpoint. For example, a Task Create returns the full task object with id, shortId, trackingURL, workers, destination, recipients, state, completionDetails, etc.

### Errors

- API errors (4xx / 5xx from Onfleet) are surfaced as thrown errors unless `continueOnFail` is set on the node, in which case the error item is passed with an `error` property.
- Invalid operation for the selected resource, missing required parameters, or malformed addresses should throw descriptive errors.
- The node does not retry on failure.

### Expressions

All parameter values accept n8n expressions (strings wrapped in `{{ }}`). The resource and operation selectors also accept dynamic expressions.

## Acceptance tests

### Test: Create a task and verify output shape

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Task",
  "operation": "Create",
  "destination": {
    "address": {
      "unparsed": "2829 Vallejo St, SF, CA, USA"
    }
  },
  "recipients": [
    { "name": "Blas Silkovich", "phone": "650-555-4481" }
  ],
  "notes": "Test delivery"
}
```

**Expect** output[0] to contain `json.id` (a non-empty string), `json.shortId`, `json.trackingURL`, `json.state` (number), `json.destination`, and `json.recipients` (array). The item count in output[0] must be exactly 1.

### Test: GetAll tasks with date filter

**Given** input items:
```json
[{ "json": { "from": 1700000000000, "to": 1700100000000 } }]
```

**Parameters:**
```json
{
  "resource": "Task",
  "operation": "GetAll",
  "filters": {
    "from": "={{ $json.from }}",
    "to": "={{ $json.to }}"
  }
}
```

**Expect** output[0] to be an array (possibly empty), where each element is an object with `id`, `state`, and `timeCreated` properties.

### Test: Get organization details

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Organization",
  "operation": "Get"
}
```

**Expect** output[0] to contain `json.id`, `json.name`, `json.email`, and `json.timezone`.

### Test: Create a destination

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Destination",
  "operation": "Create",
  "address": {
    "number": "2829",
    "street": "Vallejo St",
    "city": "San Francisco",
    "state": "CA",
    "country": "USA"
  }
}
```

**Expect** output[0] to contain `json.id`, `json.address`, `json.location` (array of two numbers).

### Test: Error on missing required parameters

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Recipient",
  "operation": "Create"
}
```

**Expect** a thrown error because `name` and `phone` are required. If `continueOnFail` is enabled, the item should pass through with an `error` property.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Full list of parameters per operation | Inferred from public n8n docs (high-level operation list) + Onfleet REST API reference | Exact sub-parameter nesting and display conditions are not reverse-engineered |
| Credential schema | Documented | API-key only, no OAuth |
| Error message format | Inferred | Standard HTTP error propagation expected |
| Webhook resource | Documented in Onfleet API reference | n8n also exposes a separate `onfleetTrigger` node; the `Webhook` resource here allows CRUD of webhook configurations |
| Organization resource | Documented | Two operations (Get, Get Connected Organization) confirmed from public docs |
| Container resource | Inferred | Operations confirmed from public docs; subtype selection (ORGANIZATION/WORKER/TEAM) inferred from Onfleet API |
| Response shapes | Documented via Onfleet REST API docs | Not reverse-engineered from n8n source |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.onfleet.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
