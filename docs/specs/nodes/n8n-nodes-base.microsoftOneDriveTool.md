---
type: n8n-nodes-base.microsoftOneDriveTool
displayName: Microsoft OneDrive Tool
category: Data & Storage
versions: [1]
priority: low
status: specced
---

# Microsoft OneDrive Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftonedrive.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftOneDriveTool`
- **Aliases:** `n8n-nodes-base.microsoftOneDrive` (the base app node — the tool variant is the same node registered with `usableAsTool: true`; no separate concrete node definition exists)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:**
  - `microsoftOneDriveOAuth2Api` (node-specific OAuth2, default)
  - `microsoftOAuth2Api` (generic Microsoft Graph credential, reusable across Microsoft nodes)
  - `microsoftEntraServicePrincipal` (app-only access via Microsoft Entra app registration)

  The credential must be granted the `Files.ReadWrite.All` scope (or equivalent) for the operations this node performs. Government cloud tenants (US Government, US Government DOD, China) require selecting the appropriate Graph API base URL in the credential.

## Parameters

This tool exposes the same resource and operation structure as the base Microsoft OneDrive node. Parameters can be populated statically, by n8n expression (`{{ $json.key }}`), or dynamically by the AI model via `$fromAI()` or the auto-fill toggle (star icon) in the editor.

### Resource: `file`

| Operation | Required parameters | Optional parameters | Description |
|-----------|-------------------|--------------------|-------------|
| `copy` | `fileId` | `additionalFields.name`, `parentReference` (driveId, driveType, id, listId, name, path, shareId, siteId) | Duplicate a file. If no new name is given the original name is reused. |
| `delete` | `fileId` | — | Move the file to the recycle bin. |
| `download` | `fileId`, `binaryPropertyName` | — | Retrieve file binary data into the specified output binary field. |
| `get` | `fileId` | — | Obtain file metadata (id, name, size, createdDateTime, etc.). |
| `rename` | `itemId`, `newName` | — | Change the file name. |
| `search` | `query` | — | Locate files matching a query (matched against filename, metadata, and content). |
| `share` | `fileId`, `type` (view/edit/embed), `scope` (anonymous/organization) | — | Create a sharing link with the specified permission level and visibility. |
| `upload` | `fileName`, `parentId`, `binaryData` (boolean) | `fileContent` (text, when binaryData=false), `binaryPropertyName` (field name, when binaryData=true) | Upload a file of up to 4 MiB. Content may be provided as text or as binary data from a previous node. |

### Resource: `folder`

| Operation | Required parameters | Optional parameters | Description |
|-----------|-------------------|--------------------|-------------|
| `create` | `name` | `options.parentFolderId` | Create a new folder by name or path (e.g. `/Pictures/2021`). |
| `delete` | `folderId` | — | Delete the folder. |
| `getChildren` | `folderId` | — | List all items (files and folders) inside the specified folder. |
| `rename` | `itemId`, `newName` | — | Rename the folder. |
| `search` | `query` | — | Search folders matching the query. |
| `share` | `folderId`, `type` (view/edit/embed), `scope` (anonymous/organization) | — | Create a sharing link for the folder. |

## Runtime behavior

- **Input:** Input items carry identifiers (fileId, folderId, itemId, parentId) or binary data for upload/download. The tool may receive zero input items when invoked by an AI agent — in that case the AI model provides parameter values via `$fromAI()`.
- **Output:**
  - File operations return driveItem metadata (id, name, size, webUrl, createdDateTime, lastModifiedDateTime, etc.).
  - Folder `getChildren` returns an array of child driveItem objects.
  - File `download` writes binary data to the designated output binary field and passes the input item metadata through.
  - Copy operations that receive a 202 (Accepted) from the Microsoft Graph API must handle the async monitor URL (returned in the `Location` header). The executor should either poll the monitor URL to completion or return the full response payload — never emit a bare `{success: true}`.
- **AI agent integration:** When connected to an AI Agent (Tools Agent), the node functions as a tool. The AI model selects the resource and operation and populates parameters dynamically. Parameters marked with the auto-fill button support `$fromAI()` expressions. The model may call the tool multiple times in sequence (e.g. search for a file, then download it).
- **Error handling:** Invalid references, missing items, and authentication failures produce descriptive errors. When `continueOnFail` is enabled, the node emits error items instead of throwing. Uploads exceeding the 4 MiB limit raise a clear size violation error.
- **Expressions:** All string parameters accept n8n expression syntax. The tool variant additionally supports `$fromAI()` for AI-driven parameter population.

## Acceptance tests

1. **AI agent file upload** — An AI agent connected to this tool calls the `file` / `upload` operation with `$fromAI("fileName")` and `$fromAI("fileContent")`. The tool must upload content to the OneDrive root and return the resulting driveItem metadata including a valid `id` and `webUrl`.

2. **Folder share with AI parameters** — An AI agent calls the `folder` / `share` operation with `$fromAI("folderId")`, `type=view`, `scope=anonymous`. The tool must create an anonymous view-only sharing link and return it in the output.

3. **Search-then-download chain** — The tool is called first with `file` / `search` (query parameter set by the AI model), then with `file` / `download` using a `fileId` from the first call's output. The second call must produce binary output in the designated field.

4. **Continue-on-fail with deleted file** — A `file` / `delete` operation targets a non-existent file ID with `continueOnFail=true`. The node must emit an error item rather than throwing, allowing the workflow to continue.

5. **Async copy completion** — A `file` / `copy` operation targets a large file. The executor receives a 202 response from the API. It must either poll the monitor URL until completion or return the full `driveItem` metadata from the destination. A bare `{success: true}` is unacceptable.

## Gaps / confidence

| Topic | Documented / Inferred | Notes |
|-------|----------------------|-------|
| Operations list | Documented | Matches public docs for the base OneDrive node. |
| Tool variant existence | Inferred | No separate node file in the package; `usableAsTool: true` on the base node enables the tool variant via the alias. |
| Credential types | Documented | OAuth2, generic Graph, and Entra app-only. |
| Upload size limit | Documented | 4 MiB limit stated in public docs. |
| `$fromAI()` support | Documented | Explicit in the AI tool parameters documentation. |
| Async 202 contract | Documented | Microsoft Graph async pattern. |
| Tool workflow registration | Inferred | The alias `microsoftOneDriveTool` maps to the same executor as the base OneDrive node. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/microsoft-one-drive.ts` (shared with the base Microsoft OneDrive node)
- **SDK usage:** `defineNode` + native `ExecutionContext` only
