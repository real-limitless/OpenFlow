# n8n-nodes-base.dropbox

## Sources
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.dropbox.md (Public docs only)
- https://docs.n8n.io/integrations/builtin/credentials/dropbox.md (Public docs only)

## Wire format
- **Type string**: `n8n-nodes-base.dropbox`
- **Inputs**: `main`
- **Outputs**: `main`
- **Credentials**:
  - `dropboxApi` (Access Token)
  - `dropboxOAuth2Api` (OAuth2)

## Parameters
- **Authentication**: Selectable credential type (`accessToken` or `oAuth2`), default `accessToken`.
- **Resource**: Choose from `file`, `folder`, `search`.
- **Operation**: Operation list varies by resource:
  - For `file`: Upload, Download, Copy, Delete, Move.
  - For `folder`: Create, Copy, Delete, Move.
  - For `search`: Query.
- Parameters are abstracted; specific operation choices depend on the selected Resource.

## Runtime behavior
- Processes items with a `main` input.
- Selects the appropriate Dropbox API endpoint based on the chosen Resource and Operation, using the provided credential.
- Input data (e.g., file content) is passed to the API call; results (e.g., file ID, metadata) are returned as the item’s output.
- Errors (e.g., authentication failure, API error) are propagated as item errors following OpenFlow conventions.
- The node adheres to standard OpenFlow error handling and does not embed internal algorithm details.

## Acceptance tests
1. **Upload test**: Upload a small file to Dropbox; verify output contains a valid file ID and file name.
2. **Delete test**: Delete an existing file; verify success status is returned.
3. **Search test**: Perform a search with a query; verify output includes matching file paths.
4. **Folder creation test**: Create a new folder; verify successful creation response.
5. **Copy test**: Copy a file to a new location; verify output contains source and destination identifiers.

## Gaps / confidence
- The operation list is explicitly documented on the Dropbox integration page.
- Credential types are documented in the official Dropbox credentials documentation.
- Exact input payload schema (e.g., file encoding) is not publicly detailed; behavior is inferred from the Dropbox API.
- Default values for optional parameters are unspecified; typical defaults are assumed.

## OpenFlow mapping
- **Definition group**: `dropbox`
- **Intended executor filename**: `n8n-nodes-base.dropbox.ts`