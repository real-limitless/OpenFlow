---
type: n8n-nodes-base.salesforceTool
displayName: Salesforce Tool
category: AI Tool
versions: [1]
priority: high
status: specced
---

# Salesforce Tool

A reduced-surface AI agent tool variant of the Salesforce node. When connected to an AI Agent, the model can dynamically populate parameters using `$fromAI()`. Wraps the same **Account**, **Attachment**, **Case**, **Contact**, **Custom Object**, **Document**, **Flow**, **Lead**, **Opportunity**, **Search**, **Task**, and **User** resources against the Salesforce REST/SOAP API. The credential surface and API contract are identical to the base Salesforce node; the difference is the parameter-population interface exposed to AI agents.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.salesforce.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/salesforce.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_intro.htm | External API docs |

The temporary corpus (CORPUS_DIR under /tmp) was consulted only for descriptor metadata confirming the wire type, resource/operation existence, and credential class names. No package source was consulted or copied.

## Wire format

- **Type string:** `n8n-nodes-base.salesforceTool`
- **Aliases:** (none; maps to base type `n8n-nodes-base.salesforce` with AI tool semantics)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `salesforceOAuth2Api` (supports JWT Bearer and OAuth2 flows; environment type selects Production or Sandbox)

## Parameters

### Resource and operation selection

The user selects a resource which determines available operations. All parameters accepting string, number, or object values support `$fromAI()` dynamic population when the node is connected to an AI Agent.

| Resource | Operations |
|----------|------------|
| Account | Create, Delete, Get, Get All, Update, Upsert, Add Note, Describe Metadata |
| Attachment | Create, Delete, Get, Get All, Update, Describe Metadata |
| Case | Create, Delete, Get, Get All, Update, Add Comment, Describe Metadata |
| Contact | Create, Delete, Get, Get All, Update, Upsert, Add Note, Add to Campaign, Describe Metadata |
| Custom Object | Create, Delete, Get, Get All, Update, Upsert |
| Document | Upload |
| Flow | Get All, Invoke |
| Lead | Create, Delete, Get, Get All, Update, Upsert, Add Note, Add to Campaign, Describe Metadata |
| Opportunity | Create, Delete, Get, Get All, Update, Upsert, Add Note, Describe Metadata |
| Search | Query (execute SOQL) |
| Task | Create, Delete, Get, Get All, Update, Describe Metadata |
| User | Get, Get All |

### AI tool-specific behavior

- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions.
- Credential selection is required — the tool node always needs a configured Salesforce credential.
- The surface is the same set of resources and operations as the base Salesforce node, minus any UI-only parameter nesting (the tool variant exposes a flat parameter list suitable for AI model inference).
- Binary file uploads (Documents, Attachments) are supported in this tool variant when binary data is available on input items.

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| credential | credential selector | — | yes | `salesforceOAuth2Api` (JWT or OAuth2); environment type (Production/Sandbox) selected within credential |

## Runtime behavior

### Input

Consumes items from `main` input. For write operations (create, update, upsert), field values can be supplied via expressions or AI-populated parameters. Each input item triggers one API call using the resolved parameters and configured credential, unless the operation is a list/query/search that may batch inputs.

### External API contract

The node communicates with the Salesforce REST API at `https://{instance}.salesforce.com/services/data/v{apiVersion}/` (instance determined by credential scope and environment type) or the SOAP API for certain operations. Authentication uses the JWT Bearer flow or OAuth2 as configured in the credential.

### Output

**Output[0]** — main result:
- Get/Create/Update/Upsert operations return the Salesforce record data (one item per record).
- List/Query/Search operations return one output item per result row. Empty result sets produce zero items (not an error).
- Delete operations return a success confirmation (no fabricated record body).
- Upload operations return the uploaded file/attachment metadata from Salesforce.
- Flow Invoke returns the flow execution result.
- Describe Metadata returns the object metadata structure.

### Errors

- Missing or invalid credentials, expired authorization, and insufficient Salesforce permissions fail with an actionable authentication/authorization error.
- Missing identifiers, malformed field mappings, invalid SOQL, and missing operation-specific values fail validation before the API request when possible.
- Salesforce API errors (HTTP 4xx/5xx) are surfaced with the upstream status, message, and resource+operation context.
- With `continueOnFail`, a failed input item emits an error item on the same output rather than aborting unrelated input items. Without it, the node raises the execution error.

### Expressions

All string, number, and object parameters accept OpenFlow expressions, including `$fromAI()`. Resource and operation selectors are static configuration. Record identifiers, field values, SOQL queries, and flow inputs all support per-item expression evaluation.

## Acceptance tests

### Test: upsert a contact via AI agent

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters** (populated by AI model via `$fromAI()`):

```json
{
  "resource": "contact",
  "operation": "upsert",
  "externalIdField": "Email__c",
  "externalIdValue": "jane@example.com",
  "fields": {
    "FirstName": "Jane",
    "LastName": "Doe",
    "Email": "jane@example.com",
    "Phone": "+12025551234"
  }
}
```

**Expect** output[0] to contain one item with the upserted contact record including `Id`, `attributes.type` set to `"Contact"`, and the submitted field values.

### Test: execute a SOQL query

**Given** input items:

```json
[{ "json": { "accountName": "Acme Example" } }]
```

**Parameters:**

```json
{
  "resource": "search",
  "operation": "query",
  "query": "SELECT Id, Name, Type FROM Account WHERE Name = '{{ $json.accountName }}'"
}
```

**Expect** output items, one per returned row, each containing `Id`, `Name`, and `Type` fields from Salesforce.

### Test: delete an account record

**Given** input items:

```json
[{ "json": { "recordId": "001000000000001" } }]
```

**Parameters:**

```json
{
  "resource": "account",
  "operation": "delete",
  "recordId": "={{ $json.recordId }}"
}
```

**Expect** one confirmation item — no fabricated Account record body. With `continueOnFail`, an invalid ID produces an error item.

### Test: create a case with a comment

**Given** input items:

```json
[{ "json": { "subject": "API issue", "description": "Timeout on GET request" } }]
```

**Parameters:**

```json
{
  "resource": "case",
  "operation": "create",
  "fields": {
    "Subject": "={{ $json.subject }}",
    "Description": "={{ $json.description }}",
    "Status": "New",
    "Priority": "High"
  }
}
```

**Expect** output[0] containing the created case record with `Id`, `CaseNumber`, and the submitted `Subject` and `Status` values.

### Test: upload a document with binary data

**Given** input items:

```json
[{ "json": { "fileName": "report.pdf" }, "binary": { "file": { "mimeType": "application/pdf", "data": "JVBERi0..." } } }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "upload",
  "fileName": "={{ $json.fileName }}",
  "binaryPropertyName": "file",
  "additionalFields": {
    "Description": "Monthly report uploaded by AI agent"
  }
}
```

**Expect** output[0] containing the uploaded Document metadata from Salesforce (including `Id`, `Name`, `ContentType`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string `n8n-nodes-base.salesforceTool` | High | Confirmed by MANIFEST.json and source-url.txt; virtual Tool variant of `n8n-nodes-base.salesforce` |
| Resource/operation list | High | Confirmed by public docs.n8n.io; identical to base Salesforce node |
| Credential types | High | Public credentials page documents JWT and OAuth2 flows; supports Production/Sandbox environment selection |
| AI tool wrapping pattern | High | Consistent with other `*Tool` variants (`hubspotTool`, `slackTool`, `gmailTool`) documented in clean-room.md |
| `$fromAI()` parameter coverage | Medium | All string/number/object parameters accept expressions; exact field-level AI-population metadata is inferred from the general tool pattern |
| Response shapes | Inferred (abstracted) | Salesforce API responses vary by object type; spec describes the outcome contract rather than fixed JSON schemas |
| Binary upload support for Attachments | Medium | Document upload is documented; Attachments with binary are inferred from the base node resource list |
| SOQL query pagination | Low | Not documented whether the tool variant returns all results or paginates; inferred to return all results in a single response as stated in public docs |

## OpenFlow mapping

| Property | Value |
|----------|-------|
| **Definition group** | `tools` |
| **Executor file** | `src/lib/engine/executors/n8n-nodes-base.salesforceTool.ts` |
| **SDK entry point** | `defineNode('n8n-nodes-base.salesforceTool', ...)` |
| **Credential alias** | `salesforceOAuth2Api` |
