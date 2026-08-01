---
type: n8n-nodes-base.pagerDuty
displayName: PagerDuty
category: Trigger
versions: [1]
priority: medium
status: specced
---
## Sources
| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pagerDuty.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pagerDutyApi.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pagerDutyOAuth2Api.md | Public docs only |

## Wire format
- **Type string:** `n8n-nodes-base.pagerDuty`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** 
  - `pagerDutyApi` (API token)
  - `pagerDutyOAuth2Api` (OAuth2)

## Parameters
| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | apiToken | true | show.authentication | Choose API token or OAuth2 authentication |
| resource | options | incident | true | show.resource | Select resource type: Incident, Incident Note, Log Entry, User |
| operation | options | create | true | show.operation | Operation to perform: create, get, getAll, update |
| resourceIdentifier | string | (none) | false | show.resourceIdentifier | Identifier of the specific resource (e.g., incident ID) |
| additionalFields | object | (none) | false | show.additionalFields | Additional fields specific to the chosen operation (e.g., title, serviceId, details) |
| email | string | (none) | false | show.email | Email address for notifications or contact |

## Runtime behavior
- **Input processing:** Accepts items on the `main` input channel; each item represents a unit of work that triggers the node.
- **Operation execution:** Based on the selected `resource` and `operation`, the node invokes the appropriate PagerDuty REST API endpoint:
  - *Create incident*: consumes `title`, `serviceId`, optional `additionalFields` (such as `details`, `priorityId`, `escalationPolicyId`, `urgency`, `incidentKey`), and `email`; returns the created incident object.
  - *Get incident*: consumes `incidentId`; returns the incident details.
  - *Get all incidents*: supports optional filtering via query options; returns a collection of incidents.
  - *Update incident*: consumes `incidentId` and `updateFields`; modifies the incident properties.
  - *Create incident note*: consumes `content` and `email`; adds a note to an incident.
  - *Log entry* and *User* operations follow similar input‑output patterns.
- **Output shape:** Returns JSON objects that conform to PagerDuty API responses, abstracted to a consistent “incident”, “note”, “log entry”, or “user” structure.
- **Error handling:** If a request fails and `continueOnFail` is disabled, the error propagates; if enabled, the node emits an error item on the main output.

## Acceptance tests
### Test: create incident
**Given** an input item:
```json
{
  "json": {
    "title": "Test Incident",
    "serviceId": "12345",
    "additionalFields": {
      "details": "Automated test"
    },
    "email": "test@example.com"
  }
}
```
**When** the node executes with `authentication = apiToken` and `operation = create` on `resource = incident`
**Then** an output item is produced containing the created incident with at least `id`, `type`, `title`, and `status` fields.

### Test: get incident
**Given** an input item with `incidentId` = "98765"
**When** the node executes with `operation = get` on `resource = incident`
**Then** the output contains the incident details including `id`, `type`, `title`, and `status`.

### Test: update incident
**Given** an input item:
```json
{
  "json": {
    "incidentId": "98765",
    "updateFields": {
      "title": "Updated Title"
    }
  }
}
```
**When** the node executes with `operation = update` on `resource = incident`
**Then** the returned incident reflects the updated `title`.

(Additional functional tests can be added for incident notes, log entries, and user operations.)

## Gaps / confidence
| Topic | Documented / Inferred | Notes |
|-------|----------------------|-------|
| Exact parameter names for `additionalFields` | Partially documented in public PagerDuty API spec; inferred for common sub‑fields | Only top‑level keys are required; nested structures may expand |
| All supported operations | Documented via PagerDuty API reference; node implements a subset (create, get, getAll, update) | Some operations like delete are not exposed |
| Response field mapping | Inferred from PagerDuty API response examples | Output abstraction maintains only required outcome fields |

## OpenFlow mapping
- **Definition group:** `triggers` | `output`
- **Executor file:** `src/lib/engine/executors/pagerDuty.ts`
- **SDK usage:** `defineNode` + `ExecutionContext` only