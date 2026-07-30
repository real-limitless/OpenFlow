---
type: n8n-nodes-base.googleDocs
displayName: Google Docs
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Google Docs

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledocs.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/service-account.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleDocs`
- **Aliases:** `Google Docs`, `GDocs`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:**
  - `googleDocsOAuth2Api` (OAuth2 — recommended) — scopes: `https://www.googleapis.com/auth/documents`, `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/drive.metadata`
  - `googleApi` (Service Account) — region-selectable
- **Usable as tool:** true

## Parameters

### Common (all operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `authentication` | options | `oAuth2` | no | — | `serviceAccount` \| `oAuth2` |
| `resource` | options | `document` | yes | — | `document` |

---

### Resource: `document` (Document)

#### Operation: `create` — Create a document

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `create` | yes | `resource:document` | — |
| `title` | string | `""` | yes | `resource:document, operation:create` | Document title |

**Output:** Single item with created document metadata (documentId, title, documentUrl).

---

#### Operation: `get` — Get a document

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `get` | yes | `resource:document` | — |
| `documentId` | resourceLocator | — | yes | `resource:document, operation:get` | Modes: `list` (searchable), `url` (extracts ID), `id` (raw ID) |

**Output:** Single item with document content (documentId, title, body with structural elements).

---

#### Operation: `update` — Update a document

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `update` | yes | `resource:document` | — |
| `documentId` | resourceLocator | — | yes | `resource:document, operation:update` | Modes: `list`, `url`, `id` |
| `content` | string | `""` | yes | `resource:document, operation:update` | New document content (replaces existing) |
| `options.insertAt` | options | `end` | no | `resource:document, operation:update` | Where to insert content: `start` \| `end` \| `index` |
| `options.index` | number | `0` | no | `resource:document, operation:update, insertAt:index` | Insert index (0-based) |

**Input:** Items with content to update (one item = one document update).
**Output:** Single item with updated document metadata (documentId, title, updatedRange).

---

## Runtime behavior

### Input

- **Create (`create`):** Consumes no input items; executes once per node execution.
- **Get (`get`):** Consumes no input items; pulls document and emits output item.
- **Update (`update`):** Consumes items from the `main` input channel (one item per document update).

### Output

- **Create document:** Emits one item with `documentId`, `title`, `documentUrl`.
- **Get document:** Emits one item with `documentId`, `title`, `body` (structural elements array).
- **Update document:** Emits one item per input item with `documentId`, `title`, `updatedRange`.

### Errors

- Authentication failures (invalid/expired credentials) → throw.
- Document not found → throw.
- Invalid document ID → throw.
- API rate limits (429) → throw (retry handled by n8n core).
- `continueOnFail`: supported per n8n core — on failure, emits `[{ json: { error: <message> } }]` on the failed branch.

### Expressions

All string/number parameters accept expressions (`{{ $json.field }}`, `{{ $parameter.name }}`, etc.). Resource locator modes `url` and `id` support extraction via regex from expressions.

---

## Acceptance tests

### Test: Create document

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "create",
  "title": "Test Document"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "{{$string}}",
    "title": "Test Document",
    "documentUrl": "https://docs.google.com/document/d/{{$string}}/edit"
  }
}]
```

---

### Test: Get document

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "get",
  "documentId": { "mode": "id", "value": "test-document-id" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "test-document-id",
    "title": "Test Document",
    "body": {
      "content": [
        { "paragraph": { "elements": [{ "textRun": { "content": "Hello World\n" } }] } }
      ]
    }
  }
}]
```

---

### Test: Update document (replace content)

**Given** input items:
```json
[{ "json": { "content": "Updated content" } }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "update",
  "documentId": { "mode": "id", "value": "test-document-id" },
  "content": "={{$json.content}}"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "test-document-id",
    "title": "Test Document",
    "updatedRange": "0-12"
  }
}]
```

---

### Test: Update document (append at end)

**Given** input items:
```json
[{ "json": { "content": "\nAppended text" } }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "update",
  "documentId": { "mode": "id", "value": "test-document-id" },
  "content": "={{$json.content}}",
  "options": { "insertAt": "end" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "test-document-id",
    "title": "Test Document",
    "updatedRange": "12-26"
  }
}]
```

---

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| All operations, parameters, enums, defaults | documented | From n8n docs |
| Credential scopes & types | documented | OAuth2 (3 scopes) + Service Account (region) |
| Output item shapes | inferred | Based on Google Docs API responses described in docs; exact field names may vary |
| `continueOnFail` error shape | inferred | Standard n8n core behavior |
| Exact `updatedRange` format for update | inferred | Docs show examples but not exhaustive |
| Version-specific parameter availability | documented | Currently only v1 |

---

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleDocs.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `googleDocsOAuth2Api`, `googleApi` (implement as OpenFlow credential adapters)
- **Node type string:** `n8n-nodes-base.googleDocs`