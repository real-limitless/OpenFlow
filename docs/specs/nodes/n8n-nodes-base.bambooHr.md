---
type: n8n-nodes-base.bambooHr
displayName: BambooHR
category: Sales
versions: [1]
priority: medium
status: specced
---

# BambooHR

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bamboohr.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/bamboohr.md | Public docs only |
| https://documentation.bamboohr.com/docs/getting-started | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.bambooHr`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `bambooHrApi` (required) — API-key authentication with subdomain + API key

## Parameters

### Resource (required)
Select the BambooHR domain to operate on.

| Value | Label | Description |
|-------|-------|-------------|
| `companyReport` | Company Report | Retrieve pre-built reports from BambooHR |
| `employee` | Employee | CRUD operations on employee records |
| `employeeDocument` | Employee Document | Manage documents attached to employee profiles |
| `file` | File | Manage company-wide files |

### Operation (required)
Select the specific action within the chosen resource.

#### Company Report — Operation: `get`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `reportId` | string | yes | — | The numeric ID of the company report to retrieve |
| `format` | options | yes | — | Output format: `CSV`, `PDF`, `XLSX`, `JSON`, `XML` |
| `output` | options | no* | — | Where to send the downloaded report: `File` (binary data on output item), `URL` (download URL), `Id` (stores file; returns ID). Required when `format` is not JSON. |
| `options.filters` | fixedCollection | no | — | Optional date-range and employee-status filters for the report |

#### Employee — Operation: `create`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `synced` | boolean | yes | `false` | Whether this employee was added to a pay schedule synced with Trax Payroll |
| `firstName` | string | yes | — | Employee's first name |
| `lastName` | string | yes | — | Employee's last name |
| `additionalFields` | collection | no | — | Supplementary fields: address, dateOfBirth, department, division, employeeNumber, exempt, gender, hireDate, location, maritalStatus, mobilePhone, paidPer, payRate, payType, preferredName, ssn. When `synced=true`, many of these become required for Trax Payroll compliance. |

#### Employee — Operation: `get`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `employeeId` | string | yes | — | Numeric employee ID |
| `options.fields` | multiOptions | no | — | Specific fields to return (if omitted, all fields are returned) |

#### Employee — Operation: `getAll`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `returnAll` | boolean | no | `false` | Whether to retrieve all employees (paginated) |
| `limit` | number | no* | `50` | Max employees to return. Required when `returnAll=false`. |

#### Employee — Operation: `update`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `employeeId` | string | yes | — | Numeric employee ID |
| `synced` | boolean | yes | `false` | Whether this employee was updated on a pay schedule synced with Trax Payroll |
| `updateFields` | collection | no | — | Employee fields to update. Same field set as `additionalFields` on create. When `synced=true`, fields become required for Trax compliance. |

#### Employee Document — Operation: `delete`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `employeeId` | string | yes | — | Employee who owns the document |
| `fileId` | string | yes | — | Numeric ID of the document to delete |

#### Employee Document — Operation: `download`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `employeeId` | string | yes | — | Employee who owns the document |
| `fileId` | string | yes | — | Numeric ID of the document to download |
| `output` | options | yes | — | Output destination: `File` (binary data on output item), `URL` (download URL), `Id` (returns file ID) |

#### Employee Document — Operation: `getAll`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `employeeId` | string | yes | — | Employee whose documents to list |
| `returnAll` | boolean | no | `false` | Whether to retrieve all documents |
| `limit` | number | no* | `50` | Max documents to return. Required when `returnAll=false`. |
| `simplifyOutput` | boolean | no | `false` | Whether to flatten nested document metadata |

#### Employee Document — Operation: `update`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `employeeId` | string | yes | — | Employee who owns the document |
| `fileId` | string | yes | — | Numeric ID of the document to update |
| `updateFields` | collection | no | — | Document metadata fields to update (name, category, etc.) |

#### Employee Document — Operation: `upload`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `employeeId` | string | yes | — | Employee to attach the document to |
| `categoryId` | string | yes | — | Numeric ID of the document category |
| `binaryPropertyName` | string | yes | — | Name of the binary property on the input item containing the file content |
| `options.shareWithEmployee` | boolean | no | `false` | Whether to share the document with the employee |

#### File — Operation: `delete`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `fileId` | string | yes | — | Numeric ID of the company file |

#### File — Operation: `download`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `fileId` | string | yes | — | Numeric ID of the company file |
| `output` | options | yes | — | Output destination: `File` (binary), `URL` (download URL), `Id` (returns file ID) |

#### File — Operation: `getAll`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `returnAll` | boolean | no | `false` | Whether to retrieve all company files |
| `limit` | number | no* | `50` | Max files to return. Required when `returnAll=false`. |
| `simplifyOutput` | boolean | no | `false` | Whether to flatten nested file metadata |

#### File — Operation: `update`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `fileId` | string | yes | — | Numeric ID of the company file |
| `updateFields` | collection | no | — | File metadata fields to update (name, category, etc.) |

#### File — Operation: `upload`

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `categoryId` | options | yes | — | Company file category (dynamically loaded from API) |
| `binaryPropertyName` | string | yes | — | Name of the binary property with the file content |
| `options.shareWithEmployee` | boolean | no | `false` | Whether to share the file with all employees |

## Runtime behavior

### Input
The node accepts items on the `main` input. Each input item can supply parameter values via expressions. Binary-property parameters (`binaryPropertyName`) reference attached binary data on the input item. Items are processed sequentially.

### Output

#### Company Report — get
- **When `format=JSON`:** Output item contains the full report data as JSON under a `data` key, with report metadata (name, date range).
- **When output is `File`:** Output item gets a binary attachment with the report payload in the requested format.
- **When output is `URL`:** Output item contains a `url` field pointing to the generated report download.
- **When output is `Id`:** Output item contains a `fileId` field referencing the stored file.

#### Employee — create
Output item contains the created employee object, including the new employee's `id` and any server-populated fields.

#### Employee — get
Output item contains the full employee record for the requested `employeeId`, with fields matching the BambooHR employee schema (firstName, lastName, job info, contact info, compensation, etc.).

#### Employee — getAll
Output item contains an array of employee objects. When `returnAll=true`, pagination is handled automatically (all pages fetched and concatenated).

#### Employee — update
Output item contains the updated employee record.

#### Employee Document / File — download
- **When output is `File`:** Output item gets a binary attachment with the downloaded content.
- **When output is `URL`:** Output item contains a `url` field.
- **When output is `Id`:** Output item contains a `fileId` field.

#### Employee Document / File — getAll
Output item contains an array of document/file metadata objects. When `simplifyOutput=true`, nested structures are flattened.

#### Employee Document / File — upload
Output item contains the created document/file metadata, including its `id`.

#### Employee Document / File — delete
Output item remains as the input item (acknowledgment only; no response body).

### Errors
- **Authentication errors:** Thrown as `NodeApiError` from the credential's subdomain + API key validation endpoint.
- **Resource not found (404):** Thrown as `NodeApiError`; not caught by `continueOnFail` unless the node enables it.
- **Validation errors:** Missing required fields produce node-level validation errors before API call. Server-side validation errors are thrown as `NodeApiError`.
- **`continueOnFail` behavior:** When enabled, the output item for a failed execution contains `{ error: <message> }` instead of throwing. Successful items pass through normally.

### Expressions
All string parameters accept expression strings. Numeric, boolean, and options parameters accept expressions that resolve to the correct type. Collection fields (additionalFields, updateFields, options, filters) accept expressions resolving to objects.

## Acceptance tests

### Test: Employee — get
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "employee",
  "operation": "get",
  "employeeId": "42"
}
```
**Expect** output[0] contains a single object with fields including `id`, `firstName`, `lastName`, `jobTitle`, `department`, `location`, `hireDate`, `supervisor`, `mobilePhone`, `workEmail`.

### Test: Employee — getAll (paginated)
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "employee",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```
**Expect** output[0] is an array of employee objects with length ≤ 10.

### Test: Employee — create
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "employee",
  "operation": "create",
  "firstName": "Jane",
  "lastName": "Doe",
  "synced": false,
  "additionalFields": {
    "hireDate": "2026-01-15",
    "department": "Engineering",
    "jobTitle": "Developer",
    "workEmail": "jane.doe@example.com"
  }
}
```
**Expect** output[0] contains an object with `id` (non-empty) plus `firstName`, `lastName`, and the submitted fields.

### Test: Employee Document — upload + getAll
**Given** input items:
```json
[{ "json": {}, "binary": { "file": { "mimeType": "application/pdf", "data": "base64encoded..." } } }]
```
**Parameters (upload):**
```json
{
  "resource": "employeeDocument",
  "operation": "upload",
  "employeeId": "42",
  "categoryId": "1",
  "binaryPropertyName": "file"
}
```
**Expect** (upload) output[0] contains an object with `id` for the newly created document.

### Test: Company Report — get (JSON)
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "companyReport",
  "operation": "get",
  "reportId": "5",
  "format": "JSON"
}
```
**Expect** output[0] contains a `data` field with the report content as a nested JSON structure, plus report metadata (name, date range).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| 4 resources, 15 operations | documented | Public n8n docs and CORPUS_DIR node descriptor confirm companyReport, employee, employeeDocument, file |
| Employee create/update field list | inferred | CORPUS_DIR shows the parameter names and the Trax Payroll `synced` conditional logic; field set abstracted from detailed enumeration |
| Dynamic options (department, division, location, categoryId) | inferred | CORPUS_DIR confirms these are loaded via API calls at node execution time; exact option values depend on the user's BambooHR instance |
| Company Report filter structure | inferred | CORPUS_DIR confirms optional date-range and status filters on `get` |
| Pagination (returnAll + limit) | inferred | Standard n8n pattern; CORPUS_DIR confirms `bambooHrApiRequestAllItems` helper usage for employee, document, and file getAll |
| Trax Payroll conditional required fields | inferred | CORPUS_DIR shows `synced=true` makes ~15 sub-fields required; described abstractly as "Trax Payroll compliance" |
| Output format for file-based operations | inferred | Standard n8n binary data / URL / Id pattern; confirmed by CORPUS_DIR |
| API endpoint details | external | See https://documentation.bamboohr.com/docs for requests and responses |

## OpenFlow mapping

- **Definition group:** `core` (app node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.bambooHr.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
