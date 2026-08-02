---
type: n8n-nodes-base.googleSheetsTrigger
displayName: Google Sheets Trigger
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Google Sheets Trigger

Polling trigger that starts a workflow when rows change in a connected Google Sheets spreadsheet. The node watches a chosen spreadsheet and sheet, polls the Google Sheets API on a configurable schedule, and emits one workflow item per matching changed row. Three change scopes are supported: new rows only, changed rows only, or either kind of change.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlesheetstrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlesheetstrigger/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only (credentials) |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service.md | Public docs only (credentials) |
| https://developers.google.com/sheets/api | Public docs only (Google Sheets API) |
| Public workflow export JSON (n8n.io / third-party template galleries) | Public workflow JSON only |

## Wire format

- **Type string:** `n8n-nodes-base.googleSheetsTrigger`
- **Aliases:** `CSV`, `Spreadsheet`, `GS`
- **Inputs:** `main` × 0 (trigger node — no incoming connections)
- **Outputs:** `main` × 1
- **Credentials:** required — `googleSheetsTriggerOAuth2Api` (OAuth2) by default; `googleApi` (service account) selectable
- **Node version:** `1.0`
- **Category:** `Data & Storage`, `Productivity`

### Credential: `googleSheetsTriggerOAuth2Api`

Google OAuth2 credential scoped to Google Sheets, from the shared single-service OAuth2 flow. Service Account authentication (`googleApi`) is the documented alternative. The Google Sheets API must be enabled in the associated Google Cloud project; a service account additionally requires domain-wide delegation with the Sheets API scope.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | select | `triggerOAuth2` | no | — | `triggerOAuth2` (OAuth2) or `serviceAccount`; selects which credential is used |
| documentId | resource locator | — | yes | — | The spreadsheet to watch. Picker modes: choose an existing spreadsheet from the account, paste a spreadsheet URL, or provide the spreadsheet id directly. Also accepts an expression |
| sheetName | resource locator | — | yes | — | The sheet (tab) within the document. Picker modes: choose a sheet in the document, by name, by id, or via expression. Choices are loaded based on the selected document |
| event | select | — | yes | — | Which change to watch: new row added, existing row updated, or both. Public event names: `Row Added`, `Row Updated`, `Row Added or Updated` |
| pollTimes | fixed collection | — | yes | — | The poll schedule; standard n8n schedule semantics (e.g. every minute, every X minutes, cron). Public exports use `item[]` entries with `mode: "everyMinute"` |
| options | collection | `{}` | no | — | Additional trigger options (see below) |

### Options

| Option | type | notes |
|--------|------|-------|
| Data location on sheet | nested | Where the table actually lives when it does not start at A1 with a header in row 1. Lets the user specify a header row and first data row, or an explicit A1-notation range. Default behavior reads the whole sheet treating row 1 as the header |
| Value render | select | How cell values are returned: unformatted (calculated, raw values), formatted (formatted and calculated per the cell/locale), or formulas (uncalculated formulas). Applicable to row-added watching |
| Date/time render | select | How dates and times are serialized: serial-number format (Lotus 1-2-3 day-count) or formatted string per the cell's number format. Only surfaced for row-added watching |

## Runtime behavior

### Input

None. This is a trigger node; it is activated by the workflow runtime and produces items asynchronously, never consumed from upstream nodes.

### Poll lifecycle

1. **Activation:** the node authenticates with the configured Google credential and starts a scheduler firing on the schedule derived from `pollTimes` (public exports use once per minute).
2. **Each poll tick — row-added mode:** the node reads the watched range from the spreadsheet, treats the header row as the column keys, and compares against the position recorded by the previous successful poll. Rows appended after that position are emitted.
3. **Each poll tick — update modes:** the node compares the current sheet contents against the state captured at the last successful poll (detecting both new rows and edits to existing rows) and emits one item per changed row.
4. **Each poll tick — emission:** every matching row becomes one workflow item on output `main`. Multiple matching rows in one interval are emitted as multiple items from that single firing. If nothing changed, the tick emits zero items without error.
5. **Cursor persistence:** the node records its position/state after each successful tick so already-seen rows are not re-emitted, and resets that state if the document or sheet selection changes.
6. **Deactivation:** the scheduler stops and the API session is closed.

### Output

One item per matching changed row, on output `main`. Each item's `json` object is keyed by the sheet's header row: the values in the header row become the property names and the cells of the changed row become the values (public workflows reference fields like `$json.Name`, `$json.Email`, `$json.Company`). For update modes the item additionally carries enough positioning metadata (such as the changed row's number and, where relevant, what changed) for downstream nodes to identify the affected row.

### Errors

- **Authentication / authorization failures** (e.g. HTTP 401): the credential lacks the Sheets scope, the Google Sheets API is not enabled for the project, or a service account lacks domain-wide delegation. Activation fails with a descriptive error.
- **Invalid or empty key row:** when the header row cannot be retrieved, the tick fails with a descriptive error.
- **Sheet name too long** for update modes: update comparison is only supported for sheet names up to 31 characters; a longer name fails with a descriptive error.
- **Transient API errors** during a poll tick: the poll fails for that cycle; with `continueOnFail` the node continues scheduling and retries on the next tick.
- **Manual execution:** on a manual test run the node performs a single read of the current sheet state and returns the rows visible in the watched range (or zero items when none), rather than a delta.
- A published poll that finds no new matching rows emits zero items (no error).

### Expressions

All parameter fields accept expression strings.

## Acceptance tests

### Test: row added triggers the workflow

**Given** a published trigger with these parameters:

```json
{
  "authentication": "triggerOAuth2",
  "event": "rowAdded",
  "documentId": { "mode": "list", "value": "<spreadsheetId>" },
  "sheetName": { "mode": "list", "value": "<sheetId>", "cachedResultName": "Sheet1" },
  "pollTimes": { "item": [{ "mode": "everyMinute" }] },
  "options": {}
}
```

**Given** the spreadsheet's header row contains `Name`, `Email`, `Company`, and two data rows exist at the previous poll.

**Given** one new row (`Carol`, `carol@example.com`, `Acme`) is appended before the next poll tick.

**Expect** the next poll firing emits output[0] with exactly one item, whose `json` is `{ "Name": "Carol", "Email": "carol@example.com", "Company": "Acme" }`. A second consecutive poll with no further changes **expects** zero items (no re-emission).

### Test: multiple rows added in one interval

**Given** the same parameters, and two new rows appended within a single poll interval.

**Expect** the next poll firing emits two items on output[0], one per added row, each keyed by the header row.

### Test: updated row emitted

**Parameters:** `"event": "rowUpdate"` (same document/sheet/schedule).

**Given** an existing row's `Email` cell is edited between two poll ticks.

**Expect** the next poll firing emits one item for that row, carrying the row's current values keyed by header name plus positioning metadata identifying the changed row. A poll with no edits **expects** zero items.

### Test: both kinds of change

**Parameters:** `"event": "anyUpdate"` (same document/sheet/schedule).

**Given** one row is appended and another existing row is edited within a poll interval.

**Expect** the next poll firing emits two items, one per changed row, covering both the new and the edited row.

### Test: manual execution returns current sheet

**Parameters:** `"event": "rowAdded"` with two data rows present.

**Given** a manual test run (not a published activation).

**Expect** output[0] contains the two currently visible data rows keyed by the header row; no delta comparison is applied.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, aliases, node version, category | documented | Corpus package metadata (`n8n-nodes-base.googleSheetsTrigger`, v1.0, Data & Storage / Productivity, aliases `CSV`/`Spreadsheet`/`GS`) and public docs |
| Change events | documented | Public docs list exactly three events: Row added, Row updated, Row added or updated |
| Polling model and default schedule | documented | Public exports show `pollTimes` with `everyMinute`; common-issues page confirms the node polls |
| Credential types | documented | Public docs list Google Sheets Trigger under Google OAuth2 + Service Account compatibility; corpus confirms `googleSheetsTriggerOAuth2Api` / `googleApi` |
| Date/time render option | documented | Common-issues page documents serial-number vs formatted-string rendering and that it appears only for Row Added |
| Value render option | inferred | Consistent with the Google Sheets app node and the documented date/time render variant; full value list not enumerated in trigger docs |
| Data-location option | inferred | Matches the "data location on sheet" concept shared with the Google Sheets app node; not separately documented for the trigger |
| Output shape (header-keyed rows) | documented | Public workflows reference `$json.Name`, `$json.Email`, `$json.Company` from this trigger; row values are keyed by header cells |
| Update-mode item fields (row number, change type) | inferred | Positioning metadata is required for update semantics; exact field names not enumerated in public docs |
| Manual-execution behavior | inferred | Single-read semantics inferred from the trigger's polling architecture and the app node's behavior; not explicitly documented |
| Cursor / deduplication mechanism | inferred | Docs guarantee no re-emission only implicitly; cross-cycle state tracking is a clean-room abstraction |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/google-sheets-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Polling trigger. The executor must schedule polls from `pollTimes` (default once per minute), authenticate with the `googleSheetsTriggerOAuth2Api` Google credential (or `googleApi` service account when selected), resolve `documentId`/`sheetName` resource locators, read the watched range from the Google Sheets API using the header row as column keys, compare against the previous poll state for the selected `event` scope, and emit one item per matching changed row. Manual execution performs a single current-state read. Requires a Google Sheets API client and access to the credential scopes.
