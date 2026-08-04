---
type: n8n-nodes-base.microsoftOneDriveTrigger
displayName: Microsoft OneDrive Trigger
category: triggers
versions: [1]
priority: medium
status: implemented
---

# Microsoft OneDrive Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.microsoftonedrivetrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft.md | Public docs only |
| https://learn.microsoft.com/en-us/graph/api/driveitem-delta | Public docs (Microsoft Graph) |
| https://learn.microsoft.com/en-us/onedrive/developer/rest-api/ | Public docs (Microsoft) |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftOneDriveTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node, zero main inputs)
- **Outputs:** `main` × 1
- **Credentials:** `microsoftOneDriveOAuth2Api` (OAuth2) or `microsoftEntraServicePrincipal` (app-only)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| events | multi-select: `fileCreated`, `fileUpdated`, `folderCreated`, `folderUpdated` | `["fileCreated"]` | yes | Which event types fire the workflow. At least one must be selected. |
| options.pollTimes | select: `"everyHour"`, `"everyDay"`, `"everyWeek"`, `"everyMonth"`, `"everyX"`, `"custom"` | `"everyHour"` | no | Schedule interval for polling the OneDrive delta feed. |

When `pollTimes` is `"everyX"`, exposes an integer `pollInterval` (default `1`) and a time-unit selector (`minutes`/`hours`/`days`/`weeks`/`months`). When `"custom"`, exposes a cron expression string `cronExpression`.

## Runtime behavior

### Connection lifecycle

The node uses the Microsoft Graph `/me/drive/root/delta` endpoint to track changes. On first activation (no prior `deltaLink`), it performs a full delta enumeration: it calls `GET /me/drive/root/delta`, follows `@odata.nextLink` pagination until `@odata.deltaLink` is received, and discards all returned items (cold-start seed). The final `@odata.deltaLink` is persisted in workflow state.

On each subsequent poll, the node calls the stored `deltaLink`. If the response contains `@odata.nextLink`, it continues paging. When `@odata.deltaLink` is returned, the node updates its stored token.

### Event filtering

Each item in the delta `value` array is examined:

- Items with a `deleted` facet are **skipped** (the node only fires on create/update).
- Items with a `file` facet and no `deleted` facet:
  - If the item `id` was not previously seen → `fileCreated`.
  - If the item `id` was previously seen and `lastModifiedDateTime` changed → `fileUpdated`.
- Items with a `folder` facet and no `deleted` facet:
  - If the item `id` was not previously seen → `folderCreated`.
  - If the item `id` was previously seen and `lastModifiedDateTime` changed → `folderUpdated`.

Only events matching the user's `events` selection produce output items.

### Output shape

Each emitted item contains the full Graph `driveItem` JSON object that the delta endpoint returned for that item, with no transformation beyond the selection above. Multiple matching items from a single poll arrive as an array of items in a single firing.

### Error handling

- If the delta endpoint returns `HTTP 410 Gone`, the node discards the stored `deltaLink`, performs a fresh full enumeration (cold-start), emits an empty result for that poll, and saves the new `deltaLink`.
- Transient network failures or throttling (`429 Too Many Requests`) should back off and retry within the poll interval.
- Authentication failures are surfaced as node errors; manual re-authorization via the credential is required.

### Expressions

The `events` parameter accepts expression strings (e.g. `{{ $json.someArray }}`). The `pollTimes` schedule parameters are static configuration and are not expression-aware.

## Acceptance tests

### Test: cold start seeds state, emits nothing

**Given** no prior `deltaLink` in workflow state (first activation).

**When** the node polls, it calls `GET /me/drive/root/delta`, follows `@odata.nextLink` to completion, receives `@odata.deltaLink`.

**Expect** zero output items. The stored `deltaLink` is saved.

### Test: single new file triggers fileCreated

**Given** a stored `deltaLink` and a prior seen-IDs set that does not contain `"file-001"`.

**When** the delta response returns `[{ id: "file-001", name: "report.pdf", file: {}, lastModifiedDateTime: "2025-01-01T00:00:00Z" }]` with a new `@odata.deltaLink`.

**Expect** one output item with event type `fileCreated` containing the full driveItem JSON.

### Test: updated file triggers fileUpdated, not fileCreated

**Given** `"file-001"` was previously seen with `lastModifiedDateTime` `"2025-01-01T00:00:00Z"`.

**When** the delta response returns `[{ id: "file-001", name: "report.pdf", file: {}, lastModifiedDateTime: "2025-01-02T00:00:00Z" }]`.

**Expect** one output item with event type `fileUpdated`.

### Test: folder created triggers folderCreated

**Given** a prior seen-IDs set that does not contain `"folder-001"`.

**When** the delta response returns `[{ id: "folder-001", name: "NewFolder", folder: {}, lastModifiedDateTime: "2025-01-01T00:00:00Z" }]`.

**Expect** one output item with event type `folderCreated`.

### Test: 410 Gone resets deltaLink

**Given** a stored `deltaLink` that returns `HTTP 410 Gone`.

**When** the node receives the 410, it discards the stored `deltaLink` and performs a fresh full enumeration.

**Expect** the cold-start behavior: zero output items, new `deltaLink` saved.

### Test: multiple new files in one poll

**Given** prior seen-IDs `{}`.

**When** the delta response returns two new file items.

**Expect** two output items (both `fileCreated`) in a single firing.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event types | Documented (public n8n docs) | Four events: fileCreated, fileUpdated, folderCreated, folderUpdated |
| Poll schedule options | Inferred from common n8n trigger pattern | Follows the standard n8n poll-times UI; exact option values are the trigger convention |
| Delta API contract | Documented (Microsoft Graph) | driveItem: delta endpoint, @odata.deltaLink, @odata.nextLink, 410 resync |
| Credential types | Documented (public n8n docs) | OAuth2 + Microsoft Entra Service Principal (app-only) |
| Output shape precision | Inferred | The node emits the raw driveItem JSON; exact property set depends on the delta response |
| Deleted-item handling | Inferred | Skipped (trigger only emits creates/updates, not deletes); matches the documented event set |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/microsoft-one-drive-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
