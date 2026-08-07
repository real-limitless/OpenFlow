---
type: n8n-nodes-base.koBoToolboxTool
displayName: KoboToolbox Tool
category: Communication, Data & Storage
versions: [1]
priority: medium
status: specced
---

# KoboToolbox Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.kobotoolbox/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/kobotoolbox/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

No dedicated KoBoToolboxTool docs page exists. Behavior is inferred from the base KoBoToolbox app node and the standard AI agent tool variant pattern.

## Wire format

- **Type string:** `n8n-nodes-base.koBoToolboxTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (passthrough; tool output replaces input when used inside an AI Agent)
- **Outputs:** `main` × 1
- **Credentials:** `koBoToolboxApi` (API Root URL + API Token)

## Parameters

This tool variant shares the same four-resource structure as the base KoBoToolbox node, except parameters support `$fromAI()` dynamic population by the AI agent runtime.

### Resource selector (`resource`)

| option | notes |
|--------|-------|
| `file` | Create, Delete, Get, Get Many operations for form-attached files |
| `form` | Get, Get Many, Redeploy operations for form definitions |
| `hook` | Get, Get Many, Logs, Retry All, Retry One operations for REST hooks |
| `submission` | Delete, Get, Get Many, Get Validation Status, Update Validation Status operations for form submissions |

### File operations

| name | type | required | notes |
|------|------|----------|-------|
| `operation` | string | yes | one of: `create`, `delete`, `get`, `getMany` |
| `formId` | string | yes | The form ID (dynamic options loaded from server) |
| `fileId` | string | if `delete`/`get` | The file attachment ID |

### Form operations

| name | type | required | notes |
|------|------|----------|-------|
| `operation` | string | yes | one of: `get`, `getMany`, `redeploy` |
| `formId` | string | if `get`/`redeploy` | The form ID (dynamic options loaded from server) |

### Hook operations

| name | type | required | notes |
|------|------|----------|-------|
| `operation` | string | yes | one of: `get`, `getMany`, `logs`, `retryAll`, `retryOne` |
| `formId` | string | yes | The form ID (dynamic options loaded from server) |
| `hookId` | string | if `get`/`logs`/`retryOne` | The REST hook ID |

### Submission operations

| name | type | required | notes |
|------|------|----------|-------|
| `operation` | string | yes | one of: `delete`, `get`, `getMany`, `getValidationStatus`, `updateValidationStatus` |
| `formId` | string | if not `getMany` | The form ID (dynamic options loaded from server) |
| `submissionId` | string | if `delete`/`get`/`getValidationStatus`/`updateValidationStatus` | The submission UUID |
| `start` | number | no | Pagination offset for `getMany` |
| `limit` | number | no | Max records to return for `getMany` (API cap: 30,000) |
| `query` | string | no | MongoDB JSON query filter for `getMany` |
| `fields` | string | no | Comma-separated field whitelist for `getMany` |
| `sort` | string | no | MongoDB JSON sort criteria for `getMany` |
| `validationStatus` | string | if `updateValidationStatus` | New validation status value |
| `reformat` | boolean | no | Enable opinionated reformatting of submission data |
| `multiselectMasks` | string | no | Field-name wildcard masks for multi-select split (e.g. `Crops_*`) |
| `numberMasks` | string | no | Field-name wildcard masks for numeric parsing (e.g. `*_sqm`) |
| `downloadAttachments` | boolean | no | Download submission attachments as binary data |
| `fileNamingPattern` | string | no | Naming pattern for downloaded attachment files |
| `fileSize` | string | no | Image size to download for attachment images |

### Tool-specific behavior

- All parameter values support `$fromAI()` expressions, allowing the AI agent to dynamically populate fields based on conversation context.
- The tool node passes input items through and appends or replaces with the API response.

## Runtime behavior

### Input

Each input item triggers one API call. The node does not batch items across inputs.

### Output

Each operation returns the KoboToolbox API response body:

- **File → Create/Get/GetMany:** File metadata object(s) with id, name, url, and file-type fields.
- **File → Delete:** Empty success response.
- **Form → Get:** Single form definition object (id, name, title, url, version, owner, etc.).
- **Form → Get Many:** Array of form summary objects.
- **Form → Redeploy:** Updated form object with new deployment version.
- **Hook → Get/GetMany:** Hook configuration object(s) with id, name, endpoint, payload type, etc.
- **Hook → Logs:** Array of hook delivery attempt log entries.
- **Hook → Retry All / Retry One:** Updated hook object or delivery response.
- **Submission → Get/GetMany:** Form submission data (flattened JSON with group paths as `/` separators by default); when reformat is enabled, output is restructured into nested JSON with GeoJSON parsing, multi-select array splitting, and numeric parsing per configured masks.
- **Submission → Delete:** Empty success response.
- **Submission → Get Validation Status:** Validation status object for the submission.
- **Submission → Update Validation Status:** Updated validation status object.

When used as an AI tool, the output is rendered as a tool result message to the AI model.

### Errors

- Authentication failures (4xx) throw with the API error body; `continueOnFail` can suppress per-item failures.
- Network errors throw; retry is left to external retry nodes.
- Invalid resource/operation combinations throw early.
- The API imposes a 30,000-record limit regardless of the `limit` parameter value.

### Expressions

All free-text parameters accept n8n expression strings (`={{ }}`) and `$fromAI()` calls.

## Acceptance tests

### Test: tool — get form list

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "form",
  "operation": "getMany"
}
```

**Expect** output[0].json is an array of form summary objects with `formid` and `title` fields.

### Test: tool — get submissions with $fromAI formId

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "submission",
  "operation": "getMany",
  "formId": "={{ $fromAI(\"Which KoboToolbox form ID?\") }}",
  "limit": 100
}
```

**Expect** output[0].json is an array of submission objects.

### Test: tool — get single submission with reformatting

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "submission",
  "operation": "get",
  "formId": "aBcDeFg",
  "submissionId": "uuid:1234-5678",
  "reformat": true,
  "numberMasks": "*_sqm"
}
```

**Expect** output[0].json is a single submission object with nested group hierarchy and numeric parsing applied.

### Test: tool — update submission validation status

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "submission",
  "operation": "updateValidationStatus",
  "formId": "aBcDeFg",
  "submissionId": "uuid:1234-5678",
  "validationStatus": "approved"
}
```

**Expect** output[0].json contains a validation status object.

### Test: tool — recoverable error with continueOnFail

**Given** an invalid formId, with `continueOnFail` enabled, the execution should not abort but emit an empty item for the failing operation.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | From n8n KoboToolbox app node public docs page |
| Credential type | documented | koBoToolboxApi: API Root URL + API Token per n8n credentials page |
| $fromAI() support | inferred from Tool pattern | Standard for all AI agent tool variants |
| Exact parameter names | inferred | Abstracted; exact casing and display conditions may differ from base node |
| Submission reformatting behavior | documented | Reformat, multiselect masks, number masks, attachment download per public docs |
| Query options (query/fields/sort) | documented | MongoDB JSON format per public docs |
| Separate docs page | absent | No dedicated koBoToolboxTool page exists; behavior derived from base KoBoToolbox node |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/koBoToolboxTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
