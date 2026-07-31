---
type: n8n-nodes-base.googleDocs
displayName: Google Docs
category: Miscellaneous
versions: [1, 2]
priority: medium
status: implemented
---

# Google Docs

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledocs.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/service-account.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.googleDocs`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:**
  - `googleDocsOAuth2Api` (OAuth2) — v1+v2; scopes: `https://www.googleapis.com/auth/documents`, `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/drive.file`
  - `googleApi` (Service Account) — v1+v2; region-selectable
- **Usable as tool:** true
- **Version diffs:** v1 defaults `authentication` to `serviceAccount`; v2 defaults `authentication` to `oAuth2` (labeled "OAuth2 (recommended)")

## Parameters

### Common (all operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `authentication` | options | v1: `serviceAccount`, v2: `oAuth2` | no | `@version` | v1: `serviceAccount` \| `oAuth2`; v2: `oAuth2` \| `serviceAccount` |
| `resource` | options | `document` | — | — | Single value: `document` |

---

### Resource: `document`

#### Operation: `create` — Create a document

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `create` | yes | `resource:document` | Value: `create` |
| `driveId` | options | `myDrive` | yes | `resource:document, operation:create` | Loaded via `getDrives`; accepts expressions |
| `folderId` | options | `""` | yes | `resource:document, operation:create` | Loaded via `getFolders` (depends on `driveId`); accepts expressions |
| `title` | string | `""` | yes | `resource:document, operation:create` | Document title |

**Output (schema v2.0.0):** Single item `{ id: string, kind: string, mimeType: string, name: string }`.

---

#### Operation: `get` — Get a document

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `get` | yes | `resource:document` | Value: `get` |
| `documentURL` | string | `""` | yes | `resource:document, operation:get` | The ID in the document URL (or paste the whole URL) |
| `simple` | boolean | `true` | no | `resource:document, operation:get` | Whether to return a simplified response instead of raw data |

**Output (schema v2.0.0):** Single item `{ content: string, documentId: string }`.

---

#### Operation: `update` — Update a document

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `update` | yes | `resource:document` | Value: `update` |
| `documentURL` | string | `""` | yes | `resource:document, operation:update` | The ID in the document URL (or paste the whole URL) |
| `simple` | boolean | `true` | no | `resource:document, operation:update` | Whether to return a simplified response instead of raw data |
| `actionsUi` | fixedCollection | — | no | `resource:document, operation:update` | Array of actions; see Action Fields below |
| `updateFields` | fixedCollection | `{}` | no | `resource:document, operation:update` | Write control object (revision targeting) |

**`actionsUi.actionFields` sub-parameters:**

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| `object` | options | `text` | — | `footer` \| `header` \| `namedRange` \| `pageBreak` \| `paragraphBullets` \| `positionedObject` \| `table` \| `tableColumn` \| `tableRow` \| `text` |
| `action` | options | — | varies by `object` | See action-per-object matrix below |
| `insertSegment` | options | `body` | insert/create contexts | `header` \| `body` \| `footer` |
| `segmentId` | string | `""` | non-body insertSegment | The header/footer/footnote segment ID |
| `index` | number | varies | location-based inserts | Zero-based index relative to segment |
| `text` | string | `""` | text/insert or text/replaceAll | Content to insert, or old text to find |
| `replaceText` | string | `""` | text/replaceAll | New text replacing matched text |
| `matchCase` | boolean | `false` | text/replaceAll | Case-sensitive search |
| `name` | string | `""` | namedRange/create | Name of the named range |
| `startIndex` | number | `0` | namedRange/create, paragraphBullets | Zero-based start index |
| `endIndex` | number | `0` | namedRange/create, paragraphBullets | Zero-based end index |
| `bulletPreset` | options | `BULLET_DISC_CIRCLE_SQUARE` | paragraphBullets/create | `BULLET_DISC_CIRCLE_SQUARE` \| `BULLET_CHECKBOX` \| `NUMBERED_DECIMAL_NESTED` |
| `footerId` | string | `""` | footer/delete | Footer ID to delete |
| `headerId` | string | `""` | header/delete | Header ID to delete |
| `namedRangeReference` | options | `namedRangeId` | namedRange/delete | `namedRangeId` \| `name` |
| `value` | string | `""` | namedRange/delete | ID or name of range depending on `namedRangeReference` |
| `objectId` | string | `""` | positionedObject/delete | Positioned object ID |
| `rows` | number | `0` | table/insert | Number of rows in table |
| `columns` | number | `0` | table/insert | Number of columns in table |
| `locationChoice` | options | `endOfSegmentLocation` | insert contexts | `endOfSegmentLocation` \| `location` |
| `insertPosition` | options | `true` | tableColumn/tableRow insert | `false` (Before) \| `true` (After) |
| `rowIndex` | number | `0` | tableColumn/tableRow | Zero-based row index |
| `columnIndex` | number | `0` | tableColumn/tableRow | Zero-based column index |

**Action-per-object matrix:**

| object | allowed actions |
|--------|----------------|
| `text` | `insert`, `replaceAll` |
| `footer` | `create`, `delete` |
| `header` | `create`, `delete` |
| `namedRange` | `create`, `delete` |
| `paragraphBullets` | `create`, `delete` |
| `pageBreak` | `insert` |
| `table` | `insert` |
| `tableColumn` | `delete`, `insert` |
| `tableRow` | `delete`, `insert` |
| `positionedObject` | `delete` |

**`updateFields.writeControlObject` sub-parameters:**

| name | type | default | notes |
|------|------|---------|-------|
| `control` | options | `requiredRevisionId` | `targetRevisionId` \| `requiredRevisionId` |
| `value` | string | `""` | Revision ID string |

**Output (schema v2.0.0):** Single item `{ documentId: string }`.

## Runtime behavior

### Input

- **Create:** Executes once per node execution; does not consume input items.
- **Get:** Executes once per node execution; does not consume input items.
- **Update:** Consumes input items from `main` channel; executes one batch document update request per item.

### Output

- **Create:** Single output item with `id`, `kind`, `mimeType`, `name`.
- **Get:** Single output item with `content` and `documentId` (simplified mode) or full structural document JSON (when `simple: false`).
- **Update:** Each input item produces one output item with `documentId`.

### Errors

- Authentication failures (invalid/expired OAuth2 token or service account) → throw.
- Document not found / invalid document ID → throw.
- Google API rate limits (429) → throw (n8n core retry handles).
- `continueOnFail`: on failure emits `[{ json: { error: <message> } }]`.

### Expressions

All string/number parameters accept expressions. The `documentURL` field accepts full URLs (the node extracts the document ID from the URL).

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
  "driveId": "myDrive",
  "folderId": "",
  "title": "Test Document"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "{{$string}}",
    "kind": "docs#document",
    "mimeType": "application/vnd.google-apps.document",
    "name": "Test Document"
  }
}]
```

---

### Test: Get document (simplified)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "get",
  "documentURL": "https://docs.google.com/document/d/abc123/edit",
  "simple": true
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "abc123",
    "content": "The document text content\n"
  }
}]
```

---

### Test: Update document — insert text at end

**Given** input items:
```json
[{ "json": { "text": "Appended paragraph" } }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "update",
  "documentURL": "abc123",
  "simple": true,
  "actionsUi": {
    "actionFields": [
      {
        "object": "text",
        "action": "insert",
        "text": "={{$json.text}}"
      }
    ]
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "abc123"
  }
}]
```

---

### Test: Update document — find and replace text

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "update",
  "documentURL": "abc123",
  "simple": true,
  "actionsUi": {
    "actionFields": [
      {
        "object": "text",
        "action": "replaceAll",
        "text": "old text",
        "replaceText": "new text",
        "matchCase": false
      }
    ]
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "abc123"
  }
}]
```

---

### Test: Update document — with write control

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "update",
  "documentURL": "abc123",
  "actionsUi": {
    "actionFields": [
      { "object": "text", "action": "insert", "text": "Hello" }
    ]
  },
  "updateFields": {
    "writeControlObject": {
      "control": "targetRevisionId",
      "value": "latest"
    }
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "abc123"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations, parameters, enums, defaults | documented | From public docs + npm descriptor metadata |
| Output shapes (schema) | documented | From npm descriptor `__schema__` JSON files |
| `actionsUi` sub-parameter semantics | documented | All options/fields from descriptor; behavior per Google Docs API |
| Authentication/credential types | documented | From descriptor + credential docs |
| v1 vs v2 authentication default change | documented | v1 defaults `serviceAccount`; v2 defaults `oAuth2` |
| `continueOnFail` error shape | inferred | Standard n8n core behavior |
| Google API error types beyond 404/401/429 | inferred | Not explicitly catalogued |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleDocs.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `googleDocsOAuth2Api`, `googleApi` (implement as OpenFlow credential adapters)
- **Node type string:** `n8n-nodes-base.googleDocs`
