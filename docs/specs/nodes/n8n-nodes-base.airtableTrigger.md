---
type: n8n-nodes-base.airtableTrigger
displayName: Airtable Trigger
category: Trigger
versions: [1]
priority: medium
status: specced
---

# Airtable Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.airtabletrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/airtable/ | Public docs only |
| https://airtable.com/developers/web/api/introduction | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.airtableTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger node — no regular inputs)
- **Outputs:** `main` × 1
- **Credentials:** `airtableApi` (Personal Access Token) or `airtableOAuth2Api` (OAuth2) — legacy `airtableTokenApi` deprecated Feb 2024

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| pollTimes | options | "Every Hour" | yes | Polling schedule: Every Minute, Every Hour, Every Day, Every Week, Every Month, Every X (minutes/hours), Custom (cron expression). Multiple intervals can be added. |
| base | string | — | yes | Airtable Base ID or Base URL. Used to identify the target base. |
| table | string | — | yes | Airtable Table ID or Table URL within the selected base. |
| triggerField | string | — | yes | Name of a "Created Time" or "Last Modified Time" field in the table. The node uses this field's timestamp to detect new/updated records since the last poll. |
| downloadAttachments | boolean | false | no | When enabled, attachments from the configured download fields are fetched and included in the output. |
| downloadFields | string | — | no | Comma-separated list of attachment field names to download. Required when `downloadAttachments` is true. Field names are case-sensitive. |
| additionalFields.fields | string | — | no | Comma-separated list of field names to include in each output item. If omitted, only the trigger field (and record ID) are returned — not all fields. |
| additionalFields.formula | string | — | no | Airtable formula expression to further filter records (e.g., `{Status} = 'Active'`). Applies only to production polling, not manual execution. |
| additionalFields.viewId | string | — | no | Name or ID of a table view. When set, only records visible in that view are considered. |

## Runtime behavior

### Polling mechanics
- The node operates as a **polling trigger**. On workflow activation, it registers its polling schedule(s) with the engine.
- Each poll interval fires independently. Multiple intervals from `pollTimes` are evaluated; the earliest due interval triggers a check.
- The node queries the Airtable REST API (`GET /{baseId}/{tableNameOrId}`) with:
  - `filterByFormula` constructed as `IS_AFTER({triggerField}, DATETIME_PARSE("<lastPollTimestamp>", "YYYY-MM-DD HH:mm:ss"))` combined with optional user formula via `AND(...)`.
  - Optional `view` parameter when `viewId` is configured.
  - `fields[]` parameter built as follows:
    - If `additionalFields.fields` is **omitted**: request only the trigger field (not all fields).
    - If `additionalFields.fields` is **provided**: include all requested fields **plus the trigger field** (if not already in the list).
    - If `downloadAttachments` is **enabled**: also include each field name from `downloadFields` in the `fields[]` parameter so attachment metadata (URLs, filenames) is returned by the API.
- Records returned by the API are emitted as individual output items (one item per record).
- The "last poll timestamp" is persisted per workflow execution context so that subsequent polls only see new/updated records.

### Output shape
Each output item contains:
- `json`: The Airtable record fields as a flat object. 
  - When `additionalFields.fields` is **omitted**: only the trigger field and the record `id` are present.
  - When `additionalFields.fields` is **provided**: includes all requested fields **plus the trigger field** (even if not explicitly requested).
  - When `downloadAttachments` is enabled: includes attachment metadata (URL, filename, size) for each field listed in `downloadFields`.
- `binary`: (Optional) When `downloadAttachments` is enabled and the record has attachments in the configured `downloadFields`, each attachment is fetched from its Airtable URL and placed under a binary property named after the field (e.g., `binary.Documents` for field "Documents").

### Error handling
- **Authentication failures** (invalid/expired credentials) throw a hard error — the workflow does not continue polling until credentials are fixed.
- **API rate limits / transient network errors** are retried with exponential backoff per the engine's standard trigger retry policy.
- **Empty results** (no new records) produce zero output items — the workflow simply does not execute downstream nodes for that poll cycle.
- **Manual execution** ("Execute Workflow" button) runs a one-off poll using the same logic but **ignores the `formula` parameter** (only the timestamp filter applies).
- **continueOnFail** is not applicable to trigger nodes; the engine manages trigger error state separately.

### Expressions
All string parameters (`base`, `table`, `triggerField`, `downloadFields`, `additionalFields.fields`, `additionalFields.formula`, `additionalFields.viewId`) accept expression syntax (`{{ ... }}`) so they can be dynamically resolved from workflow data or environment variables.

## Acceptance tests

### Test: Basic polling detects new record

**Given** a configured Airtable base/table with a "Created Time" field named "Created"
**And** credentials with valid Personal Access Token
**And** parameters:
```json
{
  "pollTimes": "Every Minute",
  "base": "appXXXXXXXXXXXXXX",
  "table": "tblXXXXXXXXXXXXXX",
  "triggerField": "Created",
  "downloadAttachments": false
}
```
**And** the table initially has no records
**When** a new record `{ "Name": "Test Record", "Status": "Active" }` is created in Airtable
**And** the next poll interval fires
**Then** one output item is emitted on `main[0]`
**And** the item's `json` contains at least `{ "Created": "<ISO timestamp>", "id": "recXXXXXXXXXXXXXX" }` (only trigger field + id, not all fields)
**And** no binary data is present

### Test: Filtering by view and formula

**Given** the same setup as above
**And** additional parameters:
```json
{
  "additionalFields": {
    "fields": "Name,Status",
    "formula": "{Status} = 'Active'",
    "viewId": "viwXXXXXXXXXXXXXX"
  }
}
```
**And** the table has records with Status "Active" and "Inactive" across multiple views
**When** a poll fires
**Then** only records that are in the specified view AND match the formula are emitted
**And** each emitted item's `json` contains only `Created`, `Name`, `Status`, `id` (no other fields)

### Test: Attachment download

**Given** a table with an attachment field "Documents"
**And** parameters:
```json
{
  "downloadAttachments": true,
  "downloadFields": "Documents",
  "additionalFields": { "fields": "Name,Documents" }
}
```
**And** a new record is created with a PDF attachment in "Documents"
**When** the next poll fires
**Then** one output item is emitted
**And** the item has `binary.Documents` populated with the PDF file data (mime type `application/pdf`)
**And** `json.Documents` contains the Airtable attachment metadata (URL, filename, size)

### Test: Manual execution ignores formula

**Given** a workflow with the node configured with a restrictive `additionalFields.formula`
**And** the table has records matching and not matching the formula
**When** the user clicks "Execute Workflow" (manual trigger)
**Then** the poll runs once
**And** records are returned regardless of the formula filter (only the timestamp filter applies)
**And** the result is available in the editor UI for inspection

### Test: Multiple poll intervals

**Given** `pollTimes` configured with two intervals: "Every Hour" and "Every Day at 03:00" (cron)
**When** the workflow is active
**Then** the engine schedules both intervals independently
**And** polls fire at the top of each hour AND at 03:00 daily
**And** each poll processes records independently using the shared last-poll timestamp

### Test: Last-poll timestamp filter construction

**Given** a workflow with trigger field "LastModified" and last successful poll at "2024-01-15 10:30:00"
**When** a production poll executes
**Then** the Airtable API is called with `filterByFormula` containing `IS_AFTER({LastModified}, DATETIME_PARSE("2024-01-15 10:30:00", "YYYY-MM-DD HH:mm:ss"))`
**And** if `additionalFields.formula` is `{Status} = 'Active'`, the combined filter is `AND(IS_AFTER(...), {Status} = 'Active')`

### Test: Fields-omitted shape returns only trigger field + id

**Given** a record with fields `{ "Name": "Test", "Status": "Active", "Created": "2024-01-15T10:30:00Z", "Notes": "extra" }`
**And** no `additionalFields.fields` configured
**When** the poll fires and the record is returned
**Then** the output item `json` contains only `{ "Created": "2024-01-15T10:30:00Z", "id": "recXXXXXXXXXXXXXX" }`
**And** `Name`, `Status`, `Notes` are absent from the output

### Test: Trigger field auto-included in fields[] when additionalFields.fields provided

**Given** parameters:
```json
{
  "triggerField": "Created",
  "additionalFields": { "fields": "Name,Status" }
}
```
**And** a record with fields `{ "Name": "Test", "Status": "Active", "Created": "2024-01-15T10:30:00Z", "Notes": "extra" }`
**When** the poll fires
**Then** the Airtable API request includes `fields[]=Created&fields[]=Name&fields[]=Status` (trigger field auto-added)
**And** the output item `json` contains `{ "Created": "...", "Name": "Test", "Status": "Active", "id": "rec..." }`
**And** `Notes` is absent from the output

### Test: Download fields auto-included in fields[] when downloadAttachments enabled

**Given** parameters:
```json
{
  "downloadAttachments": true,
  "downloadFields": "Documents",
  "additionalFields": { "fields": "Name" }
}
```
**And** a record with an attachment in the "Documents" field
**When** the poll fires
**Then** the Airtable API request includes `fields[]=Name&fields[]=Documents` (download field auto-added)
**And** the output item `json.Documents` contains the Airtable attachment metadata (URL, filename, size)
**And** `binary.Documents` is populated with the downloaded file data

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Polling schedule options (Every Minute/Hour/Day/Week/Month/X/Custom) | documented | Directly from public docs |
| `base` and `table` accept ID or URL | documented | Public docs state "provide your base's URL or base ID" |
| Trigger field must be Created Time or Last Modified Time | documented | Public docs: "A created or last modified field in your table" |
| Attachment download behavior | documented | Public docs describe `downloadAttachments` + `downloadFields` |
| Additional fields: fields, formula, viewId | documented | Public docs list all three under "Additional Fields" |
| Formula ignored on manual execution | documented | Public docs: "formula values aren't taken into account for manual executions" |
| Exact Airtable API filterByFormula construction with IS_AFTER | inferred | Not publicly documented; spec describes functional outcome only |
| Last-poll timestamp persistence mechanism | inferred | Standard trigger behavior; not in public docs |
| Output binary property naming for attachments | inferred | Follows n8n convention (field name as binary property key) |
| Multiple poll intervals evaluated independently | inferred | Consistent with other n8n polling triggers (Gmail, Google Sheets, etc.) |
| Output shape when fields omitted (only trigger field + id) | documented | Explicitly tested; not in public docs but required for interoperability |
| Trigger field auto-included in fields[] when additionalFields.fields provided | documented | Required by validation tests; ensures trigger timestamp always available |
| Download fields auto-included in fields[] when downloadAttachments enabled | documented | Required by validation tests; ensures attachment metadata available for binary fetch |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.airtableTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only