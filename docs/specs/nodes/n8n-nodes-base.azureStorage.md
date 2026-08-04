---
type: n8n-nodes-base.azureStorage
displayName: Azure Storage
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Azure Storage

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.azurestorage/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/azurestorage/ | Public docs only |
| https://learn.microsoft.com/en-us/rest/api/storageservices/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.azureStorage`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `azureStorageOAuth2Api` (OAuth2 via Microsoft Identity Platform) or `azureStorageSharedKeyApi` (account name + shared key)

### Credential fields

**OAuth2 (`azureStorageOAuth2Api`):**

| field | type | required | notes |
|-------|------|----------|-------|
| account | string | yes | Azure Storage account name |
| baseUrl | string | computed | `https://{account}.blob.core.windows.net` |
| scope | string | computed | `https://storage.azure.com/.default` |

Extends `microsoftOAuth2Api` (Client ID, Client Secret, tenant, OAuth callback URL, certificate auth option).

**Shared Key (`azureStorageSharedKeyApi`):**

| field | type | required | notes |
|-------|------|----------|-------|
| account | string | yes | Azure Storage account name |
| key | string | yes | Account access key (from Azure Portal Access Keys) |
| baseUrl | string | computed | `https://{account}.blob.core.windows.net` |

In Shared Key mode the executor must sign each request with HMAC-SHA256 using the account key to produce the `Authorization: SharedKey` header per the Azure Storage REST specification.

## Parameters

### Top-level

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `sharedKey` | yes | — | `oAuth2` or `sharedKey` |
| resource | options | `container` | yes | — | `blob` or `container` |

### Resource: `blob`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `getAll` | yes | resource=blob | `create`, `delete`, `get`, `getAll` |
| container | resourceLocator | — | yes | resource=blob | Container selector: list from API or enter name |
| blobCreate | string | `""` | yes | operation=create | Name of the new blob |
| from | options | `binary` | yes | operation=create | `binary` (from input binary data) or `url` (fetch from remote URL) |
| binaryPropertyName | string | `data` | yes | from=binary | Input binary field containing file content |
| url | string | `""` | yes | from=url | Remote URL to fetch blob content from |
| blob | string | `""` | yes | operation=delete/get | Name of the blob to target (expression-friendly) |
| returnAll | boolean | `false` | no | operation=getAll | When false, `limit` controls page size |
| limit | number | `50` | no | returnAll=false | Max results (min 1); sent as `maxresults` query param |

**Blob `create` options:**

| name | type | default | notes |
|------|------|---------|-------|
| accessTier | options | `Hot` | `Hot`, `Cool`, `Cold`, `Archive`; sent as `x-ms-access-tier` |
| blobType | options | `BlockBlob` | `BlockBlob`, `PageBlob`, `AppendBlob`; sent as `x-ms-blob-type` |
| cacheControl | string | `""` | Cache-Control header for the blob |
| contentDisposition | string | `""` | Content-Disposition header |
| contentEncoding | string | `""` | Content-Encoding header |
| contentLanguage | string | `""` | Content-Language header |
| contentType | string | `""` | Content-Type header (default detected from binary) |
| metadata | fixedCollection | `[]` | Name-value metadata pairs sent as `x-ms-meta-{name}` headers |
| tags | fixedCollection | `[]` | Name-value blob index tag pairs |

**Blob `delete` options:**

| name | type | default | notes |
|------|------|---------|-------|
| leaseId | string | `""` | `x-ms-lease-id` — required if blob has active lease |

**Blob `get` options:**

| name | type | default | notes |
|------|------|---------|-------|
| leaseId | string | `""` | `x-ms-lease-id` |
| origin | string | `""` | CORS origin header |
| simplify | boolean | `true` | Return flat JSON key-value instead of raw response |
| upn | boolean | `false` | `x-ms-upn` — transform Microsoft Entra object IDs to UPN |

**Blob `getAll` options:**

| name | type | default | notes |
|------|------|---------|-------|
| fields | multiOptions | `[]` | Additional response fields: `copy`, `deleted`, `deletedwithversions`, `immutabilitypolicy`, `legalhold`, `metadata`, `permissions`, `snapshots`, `tags`, `uncommittedblobs`, `versions` |
| filter | string | `""` | Prefix filter sent as `prefix` query param |
| simplify | boolean | `true` | Return flattened array of blob summary objects |

### Resource: `container`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `getAll` | yes | resource=container | `create`, `delete`, `get`, `getAll` |
| container | resourceLocator | — | yes | operation=create | Container name for new container |
| containerName | string | `""` | yes | operation=create | Name of the new container |
| container | resourceLocator | — | yes | operation=delete/get | Container selector |
| returnAll | boolean | `false` | no | operation=getAll | When false, `limit` controls page size |
| limit | number | `50` | no | returnAll=false | Max results (min 1) |

**Container `create` options:**

| name | type | default | notes |
|------|------|---------|-------|
| accessLevel | options | `""` (private) | `blob` (anonymous read), `container` (full public), `""` (private); sent as `x-ms-blob-public-access` |
| metadata | fixedCollection | `[]` | Name-value metadata pairs |

**Container `get` options:**

| name | type | default | notes |
|------|------|---------|-------|
| simplify | boolean | `true` | Return flat JSON instead of raw response |

**Container `getAll` options:**

| name | type | default | notes |
|------|------|---------|-------|
| fields | multiOptions | `[]` | `metadata`, `deleted`, `system` |
| filter | string | `""` | Prefix filter sent as `prefix` query param |

## Runtime behavior

### Authentication

The node supports two auth methods selected via the `authentication` parameter:
- **OAuth2** (`azureStorageOAuth2Api`): extends `microsoftOAuth2Api`; uses Microsoft Identity Platform OAuth2 flow. The base URL is constructed as `https://{account}.blob.core.windows.net`.
- **Shared Key** (`azureStorageSharedKeyApi`): uses the Azure Storage account name and an access key. Requests under shared key auth must be signed with an HMAC-SHA256 `Authorization: SharedKey` header constructed per [Azure REST Authorization](https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-key).

### Blob operations — Azure Storage Blob REST API (`/{container}/{blob}`)

- **Blob Create (PUT):** Writes a blob to `/{container}/{blobName}`. Content comes from either a workflow binary property (base64-decoded) or fetched from a user-supplied URL. Sets `x-ms-blob-type`, optional `x-ms-access-tier`, and optional `x-ms-meta-*` headers. Response includes success indicators (`ETag`, `Last-Modified`).
- **Blob Delete (DELETE):** Removes the blob at `/{container}/{blobName}`. Optional `x-ms-lease-id` for leased blobs. Returns confirmation on success.
- **Blob Get (GET):** Downloads blob bytes as binary output. Response headers (`Content-Type`, `Content-Length`, `ETag`, `Last-Modified`, `x-ms-meta-*`, `x-ms-request-id`) are merged into the JSON portion of the output item; the body is placed in `binary.{propertyName}` (default `data`).
- **Blob Get Many (GET):** Lists blobs under `/{container}?restype=container&comp=list`. Parses the XML `EnumerationResults` response. Supports `prefix` filtering, `maxresults` pagination, and `include` field selection. Returns an array of blob summary objects.

### Container operations — Azure Storage Blob REST API (`/{container}?restype=container`)

- **Container Create (PUT):** Creates a new container. Supports `x-ms-blob-public-access` (access level) and metadata headers.
- **Container Delete (DELETE):** Deletes a container by name.
- **Container Get (GET):** Retrieves container metadata and properties via GET with `?restype=container`.
- **Container Get Many (GET):** Lists containers via `?comp=list`. Parses XML `EnumerationResults`. Supports `prefix` filtering and `maxresults` pagination.

### Request headers

Every request includes `x-ms-date` (current UTC) and `x-ms-version` (`2021-12-02`). The Shared Key auth mode signs the request using the account key.

### Output

Each operation produces one `main` output item per result. The shape depends on the operation:
- **Create/Delete:** JSON with success metadata (`etag`, `lastModified`, `xMsRequestId`, status).
- **Get (blob):** Binary body on the item's binary data property + JSON with response headers.
- **Get (container):** JSON with container properties and metadata.
- **Get Many:** Array of results wrapped per item. When `simplify` is true, nested structs are flattened.

### Errors

Network failures, auth failures (401), and invalid resource names produce thrown errors. When `continueOnFail` is enabled the node outputs an error item instead of halting. The Shared Key auth path validates that the account and key are present before making any requests.

### Expressions

All string and options parameters accept n8n expression syntax (`$json.*`, `$input.first()`, etc.).

## Acceptance tests

### Test: blob create from binary

**Given** input items:
```json
[{
  "json": { "fileName": "test.txt" },
  "binary": {
    "data": { "data": "SGVsbG8gV29ybGQ=", "mimeType": "text/plain" }
  }
}]
```

**Parameters:**
```json
{
  "authentication": "sharedKey",
  "resource": "blob",
  "operation": "create",
  "container": { "mode": "id", "value": "test-container" },
  "blobCreate": "test.txt",
  "from": "binary",
  "binaryPropertyName": "data",
  "options": {
    "accessTier": "Hot",
    "blobType": "BlockBlob"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "container": "test-container",
    "blobName": "test.txt",
    "etag": "\"0x8D7F123456789AB\"",
    "lastModified": "2025-01-01T00:00:00.000Z",
    "xMsRequestId": "abc-123"
  }
}]
```

### Test: blob get returns binary

**Parameters:**
```json
{
  "authentication": "sharedKey",
  "resource": "blob",
  "operation": "get",
  "container": { "mode": "id", "value": "my-container" },
  "blob": "photo.jpg"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "contentType": "image/jpeg",
    "contentLength": "12345",
    "etag": "\"0x8D7FABCDE\"",
    "lastModified": "2025-01-01T00:00:00.000Z",
    "xMsRequestId": "req-456"
  },
  "binary": {
    "data": {
      "data": "<base64-encoded blob content>",
      "mimeType": "image/jpeg",
      "fileName": "photo.jpg"
    }
  }
}]
```

### Test: blob getAll with prefix filter

**Parameters:**
```json
{
  "authentication": "sharedKey",
  "resource": "blob",
  "operation": "getAll",
  "container": { "mode": "id", "value": "logs" },
  "returnAll": true,
  "options": {
    "filter": "2025/01/",
    "simplify": true
  }
}
```

**Expect** output[0]:
```json
[{
  "json": [{
    "name": "2025/01/app.log",
    "contentLength": 4567,
    "contentType": "text/plain",
    "lastModified": "2025-01-01T00:00:00.000Z",
    "etag": "\"0x8D7F...\"",
    "blobType": "BlockBlob",
    "accessTier": "Hot"
  }]
}]
```

### Test: container create with public access

**Parameters:**
```json
{
  "authentication": "oAuth2",
  "resource": "container",
  "operation": "create",
  "containerName": "public-assets",
  "options": {
    "accessLevel": "blob"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "container": "public-assets",
    "created": true,
    "etag": "\"0x8D7F...\"",
    "lastModified": "2025-01-01T00:00:00.000Z"
  }
}]
```

### Test: container getAll with prefix

**Parameters:**
```json
{
  "authentication": "sharedKey",
  "resource": "container",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10,
  "options": {
    "filter": "test"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": [{
    "name": "test-container",
    "lastModified": "2025-01-01T00:00:00.000Z",
    "etag": "\"0x8D7F...\"",
    "leaseStatus": "unlocked",
    "leaseState": "available",
    "publicAccess": "container"
  }]
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations and resources | documented | Public n8n docs list all 8 operation/resource combinations |
| Credential fields | documented | Public n8n docs cover both OAuth2 and Shared Key setup |
| Parameter names and defaults | inferred from JSON descriptor | Names/options match public docs surface |
| XML parsing for list operations | inferred | Azure Storage REST API returns XML; node must parse `EnumerationResults` |
| Shared Key signing algorithm | inferred | Must implement HMAC-SHA256 per [Azure docs](https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-key) |
| Binary handling for blob get | inferred | GET with `arraybuffer` encoding, output placed on binary property |
| `x-ms-version` header value | inferred from descriptor | Fixed at `2021-12-02` |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/azureStorage.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
