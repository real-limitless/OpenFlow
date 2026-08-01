# SPEC for n8n-nodes-base.nextCloud

## Sources
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nextcloud/ (Public docs only)
- https://docs.n8n.io/integrations/builtin/credentials/nextcloud/ (Public docs only)

## Wire format
- **Type string**: `n8n-nodes-base.nextCloud`
- **Inputs**: 
  - Accepts a JSON object with at least:
    - `resource` (string) identifying the target resource (e.g., file ID, folder ID, user ID) or operation type.
    - `operation` (string) indicating the desired action (e.g., `list`, `upload`, `delete`, `create`, `share`, `copy`, `move`, `invite`).
    - `credentials` (object) referencing a Nextcloud credential.
  - May include additional operation‑specific parameters (e.g., `filePath`, `folderId`, `sharedWith`).
- **Outputs**: 
  - Returns a JSON object describing the outcome of the operation, containing:
    - `success` (boolean) indicating whether the operation completed successfully.
    - `data` (object) holding operation‑specific result payload.
    - `error` (object, optional) describing any failure.
- **Credentials**: 
  - Must reference a Nextcloud credential defined in the integration credentials list.

## Parameters
- **Operation selection**: High‑level identifier of the desired action (e.g., “file‑upload”, “folder‑list”, “user‑invite”). The exact parameter name is not mandated; only the functional outcome matters.
- **Target identifier**: Abstract reference to the Nextcloud object (file, folder, user) on which the operation acts.
- **Additional options**: Any operation‑specific flags or limits can be expressed generically (e.g., `recursive`, `overwrite`). Exact names are omitted unless required for interoperability.

## Runtime behavior
- **Input processing**: The node validates the presence of required fields (`resource`, `operation`, `credentials`) and checks that the supplied credential has the necessary scopes. It then routes the request to the appropriate Nextcloud API endpoint.
- **Output shape**: The response includes a boolean `success` flag and a `data` object whose structure varies by operation but always reflects the result of the executed action (e.g., a file metadata object for upload, a user object for retrieve).
- **Error handling**: Errors are reported via the `error` field, containing at minimum a `message` string and an optional `code` identifier. The node does not expose internal implementation details; it only surfaces human‑readable messages and high‑level error categories (e.g., `auth_failure`, `not_found`, `rate_limit`).

## Acceptance tests
Provide 3 concrete functional fixtures that verify:
1. **Upload a file**: The node successfully uploads a small test file and returns a response with `success: true` and contains the uploaded file’s ID.
2. **List folder contents**: The node lists items in a specified folder and returns a `data` array with at least one entry.
3. **Invite a user**: The node sends an invitation to a user email and returns a success status.

Each fixture can be expressed as a JSON payload and expected response pair.

## Gaps / confidence
- The public documentation lists operations but does not expose the exact JSON schema for request/response bodies. The spec extrapolates a generic envelope (`success`, `data`, `error`) based on common n8n patterns.
- Exact parameter names (e.g., `fileId`, `parentFolderId`) are inferred from typical Nextcloud API calls but not explicitly listed in the excerpt; they are included only when required for uniqueness.
- Default behavior for optional flags (e.g., `recursive` on delete) is assumed to follow standard Nextcloud semantics.

## OpenFlow mapping
- **Definition group**: `n8n-nodes-base.nextCloud`
- **Executor filename**: `nextcloudExecutor.ts`