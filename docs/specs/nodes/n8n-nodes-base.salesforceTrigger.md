---
type: n8n-nodes-base.salesforceTrigger
displayName: Salesforce Trigger
category: Sales
versions: [1]
priority: high
status: specced
---

# Salesforce Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.salesforcetrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/salesforce.md | Public docs only |

The temporary corpus was consulted only for descriptor metadata confirming the
wire type, version, categories, polling parameter structure, and the list of
supported trigger events. No package source was consulted or copied.

## Wire format

- **Type string:** `n8n-nodes-base.salesforceTrigger`
- **Aliases:** (none)
- **Inputs:** `main` x 0 (trigger — no incoming connection)
- **Outputs:** `main` x 1 — emits one item per matching Salesforce record
- **Credentials:** `salesforceOAuth2Api` (supports JWT and OAuth2 authentication; environment type selects Production or Sandbox)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| pollTimes | PollSchedule | everyMinute | no | — | Configures polling interval: everyMinute, everyHour (with hour), everyDay (with hour+minute), everyWeek (with weekday+hour+minute), everyMonth (with dayOfMonth+hour+minute), everyX (with value+unit), or custom (cron expression) |
| triggerOn | SalesforceEvent enum | — | no | — | Which Salesforce object event triggers the workflow. One of: accountCreated, accountUpdated, attachmentCreated, attachmentUpdated, caseCreated, caseUpdated, contactCreated, contactUpdated, customObjectCreated, customObjectUpdated, leadCreated, leadUpdated, opportunityCreated, opportunityUpdated, taskCreated, taskUpdated, userCreated, userUpdated |
| customObject | string | — | conditional | show if triggerOn is customObjectCreated or customObjectUpdated | The API name of the custom object to watch. Users select from a dynamically loaded list or provide the ID via expression. |

### Poll schedule detail

The `pollTimes` parameter accepts an array of schedule items, each with:

- `mode` — one of `everyMinute`, `everyHour`, `everyDay`, `everyWeek`, `everyMonth`, `everyX`, `custom`
- `hour` — 24h format (hidden when mode is custom/everyHour/everyMinute/everyX)
- `minute` — (hidden when mode is custom/everyMinute/everyX)
- `dayOfMonth` — (shown only when mode is everyMonth)
- `weekday` — `0` (Sunday) through `6` (Saturday), number or expression (shown only when mode is everyWeek)
- `cronExpression` — standard 6-field cron (shown only when mode is custom)
- `value` — interval magnitude (shown only when mode is everyX)
- `unit` — `minutes` or `hours` (shown only when mode is everyX)

## Runtime behavior

### Activation / polling

On workflow activation, the node begins polling the Salesforce SOAP or REST API on the configured schedule. At each poll it queries the target object for records created or updated since the last poll. Records are matched by comparing audit timestamps or a tracked cursor against the previous poll's high-water mark.

### Input

None. This is a trigger node with zero main inputs.

### Output

Each detected matching record is emitted as a separate output item. The output object contains the full Salesforce record fields returned by the API (Id, Name, system-modstamp, and all standard/custom fields on the object). The exact field set depends on the queried object type.

### Errors

If credentials are invalid or the Salesforce API returns an authorization error, the node throws and the workflow run fails. Network timeouts and transient API errors should be retried according to the polling interval. The `continueOnFail` option, if enabled, allows the workflow to continue to the next poll cycle when a non-fatal error occurs for an individual record.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: poll for new contacts

**Given** a Salesforce instance with at least one Contact record created in the last minute.

**Parameters:**
```json
{
  "pollTimes": { "item": [{ "mode": "everyMinute" }] },
  "triggerOn": "contactCreated"
}
```

**Expect** output[0] to contain at least one item with:
- `json` object including an `Id` field (string) and an `attributes` object with `type` set to `"Contact"`

### Test: poll for updated opportunities

**Given** a Salesforce instance with an Opportunity record updated in the last minute.

**Parameters:**
```json
{
  "pollTimes": { "item": [{ "mode": "everyMinute" }] },
  "triggerOn": "opportunityUpdated"
}
```

**Expect** output[0] items each have a `json.Id` field.

### Test: custom object with custom cron

**Given** a custom Salesforce object `MyCustomObject__c` with at least one record created in the last hour.

**Parameters:**
```json
{
  "pollTimes": { "item": [{ "mode": "custom", "cronExpression": "0 */5 * * * *" }] },
  "triggerOn": "customObjectCreated",
  "customObject": "MyCustomObject__c"
}
```

**Expect** output[0] items each have a `json.Id` field and `json.attributes.type` set to `"MyCustomObject__c"`.

### Test: no new records returns empty output

**Given** no records matching the trigger criteria have been created or updated since the last poll.

**Parameters:**
```json
{
  "pollTimes": { "item": [{ "mode": "everyHour", "hour": 14, "minute": 0 }] },
  "triggerOn": "leadCreated"
}
```

**Expect** no items emitted (empty output[0]).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Polling mechanism | Public docs + corpus descriptor | The poll schedule parameter matches the common n8n polling pattern; exact SOQL query construction is inferred from standard Salesforce object polling |
| Trigger event list | Public docs | 18 events confirmed in both docs and corpus |
| Custom object support | Public docs + corpus | The trigger parameter conditionally shows `customObject` when `customObjectCreated` or `customObjectUpdated` is selected |
| Output field shape | Inferred | Exact fields depend on the object type queried; the spec describes the high-level contract rather than an exhaustive field list |
| Pagination / batch size | Inferred | Not documented; a production executor may need configurable page size |
| OAuth2 vs JWT credential usage | Public docs | Both credential types are supported; the trigger uses `salesforceOAuth2Api` credential type |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.salesforceTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
