---
type: n8n-nodes-base.microsoftOneDrive
displayName: Microsoft OneDrive
category: Data & Storage
versions: [1]
priority: low
status: specced
---

# Microsoft OneDrive

## Sources
| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftonedrive.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft/ | Public docs only |

## Wire format
- **Type string:** `n8n-nodes-base.microsoftOneDrive`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** 
  - `microsoftOneDriveOAuth2Api` (node‑specific OAuth2)  
  - `microsoftOAuth2Api` (generic Microsoft Graph)  
  - `microsoftEntraServicePrincipal` (app‑only)

## Parameters
- **Resource selector**: choose `file` or `folder`.
- **Operation**: one of the following actions:
  - `copy` – duplicate the selected item.
  - `delete` – move the selected item to the recycle bin.
  - `download` – retrieve binary data.
  - `get` – obtain metadata.
  - `rename` – change the name of the selected item.
  - `search` – locate items matching a query.
  - `share` – create an invitation or sharing link.
  - `upload` – upload binary data (size‑limited).
- Parameters are abstracted to high‑level names; concrete options are documented separately.

## Runtime behavior
- **Input**: Items reference a target via ID, name, or URL; binary data for upload must be supplied in a designated property.
- **Output**:
  - File operations return item metadata (id, name, size, etc.) or the uploaded file’s metadata.
  - Folder operations return listings or metadata.
  - Async operations respond with a monitor URL; the implementation must follow that URL or return the full response payload.
- **Error handling**: Invalid references raise descriptive errors; authentication failures propagate; oversized uploads trigger a clear limit error; `continueOnFail` yields error items instead of throwing.
- **Expressions**: All configurable string parameters support n8n expression syntax (`{{ $json.key }}`).

## Acceptance tests
1. **Upload small file** – input carries binary data; output must contain file metadata with correct size.
2. **List folder children** – input includes a folder reference; output is an array of child items with standard metadata.
3. **Share a folder** – input includes folder ID and sharing options; output contains a sharing link.
4. **Delete with `continueOnFail`** – input references a missing item; when `continueOnFail=true` the node emits an error item rather than throwing.
5. **Copy async completion** – input includes source and destination; the executor must handle the 202 response by either polling the monitor URL or returning the full response payload; never emit a bare `{success:true}`.

## Gaps / confidence
| Aspect | Documented / Inferred | Notes |
|--------|-----------------------|-------|
| Operations list | Documented | Matches public docs. |
| Credential types | Documented | OAuth2, generic Graph, Entra app‑only are explicit. |
| Upload size limit | Documented | 4 MiB limit stated. |
| Parameter names & defaults | Inferred from package metadata | Abstracted to generic option names. |
| Async 202 contract | Documented | Microsoft Graph returns 202 with `Location`; must be handled. |
| Delete passthrough | Inferred | Original item must be returned unchanged. |
| Response shape | Inferred | Based on expected `driveItem` fields. |

## OpenFlow mapping
- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/microsoft-one-drive.ts`
- **SDK usage:** `defineNode` + native `ExecutionContext` only