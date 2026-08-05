---
type: n8n-nodes-base.googleFirebaseCloudFirestore
displayName: Google Firebase Cloud Firestore
category: Data & Storage
versions: [1, 1.1]
priority: medium
status: specced
---

# Google Firebase Cloud Firestore

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudfirestore.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://firebase.google.com/docs/firestore/reference/rest | Google Firebase public API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleFirebaseCloudFirestore`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleFirebaseCloudFirestoreOAuth2Api` (extends Google OAuth2 with scopes `https://www.googleapis.com/auth/datastore` and `https://www.googleapis.com/auth/firebase`) or `googleApi` (service account)

## Parameters

The node operates on two resources (`Document`, `Collection`) across seven operations. Parameters common to all operations are listed first; per-operation specifics follow.

### Common parameters

| parameter | type | required | default | notes |
|-----------|------|----------|---------|-------|
| `authentication` | string | no | `googleFirebaseCloudFirestoreOAuth2Api` | One of `googleFirebaseCloudFirestoreOAuth2Api` or `serviceAccount` |
| `projectId` | string | conditional | — | GCP project ID (shown in Firebase Console URL). Required unless set per-source on the credential. Accepts expressions. |
| `database` | string | no | `(default)` | Firestore database ID. Usually `(default)`. Accepts expressions. |

### Resource: Document

#### Operation: Create

Creates a new document with an auto-generated or supplied ID.

| parameter | type | required | default | notes |
|-----------|------|----------|---------|-------|
| `collection` | string | yes | — | Firestore collection path. Accepts expressions. |
| `documentId` | string | conditional | — | Document ID. Required if not auto-generated. Accepts expressions. |
| `columns` | string | yes | — | Key-value field data for the document body. Usually a resource-mapper or JSON key-value input. Accepts expressions. |
| `simple` | boolean | no | `true` | When true, returns a simplified output with `_id`, `_name`, `_createTime`, `_updateTime` instead of the full API response. |

#### Operation: Upsert (Create/Update a document)

Creates a document if it does not exist, or overwrites it if it does.

| parameter | type | required | default | notes |
|-----------|------|----------|---------|-------|
| `collection` | string | yes | — | Firestore collection path. Accepts expressions. |
| `updateKey` | string | conditional | — | Name of an input-item field whose value is used as the document ID. When omitted, the upsert may target a document identified by other means. |
| `columns` | string | yes | — | Key-value field data. Accepts expressions. |

#### Operation: Get

Retrieves a single document by ID.

| parameter | type | required | default | notes |
|-----------|------|----------|---------|-------|
| `collection` | string | yes | — | Firestore collection path. Accepts expressions. |
| `documentId` | string | yes | — | Document ID. Accepts expressions. |
| `simple` | boolean | no | `true` | Simplified output flag. |

#### Operation: GetAll

Lists documents from a collection with optional pagination.

| parameter | type | required | default | notes |
|-----------|------|----------|---------|-------|
| `collection` | string | yes | — | Firestore collection path. Accepts expressions. |
| `returnAll` | boolean | no | `false` | When true, returns all matching documents. When false, uses `limit`. |
| `limit` | number | conditional | `100` | Max results when `returnAll` is false. |
| `simple` | boolean | no | `true` | Simplified output flag. |

#### Operation: Delete

Deletes a document by ID.

| parameter | type | required | default | notes |
|-----------|------|----------|---------|-------|
| `collection` | string | yes | — | Firestore collection path. Accepts expressions. |
| `documentId` | string | yes | — | Document ID. Accepts expressions. |

#### Operation: Query

Runs a structured query against documents in Firestore using the Firestore `runQuery` API format.

| parameter | type | required | default | notes |
|-----------|------|----------|---------|-------|
| `query` | string | yes | — | JSON-formatted Firestore query (the `StructuredQuery` body as specified by the Firestore REST API `runQuery` endpoint). Accepts expressions. |
| `simple` | boolean | no | `true` | Simplified output flag. |

### Resource: Collection

#### Operation: GetAll

Lists all root-level collections (sub-collections are not included).

| parameter | type | required | default | notes |
|-----------|------|----------|---------|-------|
| `returnAll` | boolean | no | `false` | When true, returns all collections. When false, uses `limit`. |
| `limit` | number | conditional | `100` | Max results when `returnAll` is false. |

## Runtime behavior

### Input

Each input item is processed independently. For write operations (create, upsert), field data can be sourced from input item properties via the `columns` parameter (typically a resource mapper).

### Output

The output shape varies by operation:

- **Create:** With `simple=true`: `{ _id, _name, _createTime, _updateTime }`. With `simple=false`: the full Firestore REST API document representation.
- **Get / GetAll / Query:** With `simple=true`: an array (or single object) with `_id`, `_name`, `_createTime`, `_updateTime`. With `simple=false`: the raw response.
- **Upsert:** `{ updateTime }`.
- **Delete:** `{ success: boolean }`.
- **Collection GetAll:** Array of `{ name }` strings representing collection resource names.

The original input item properties are preserved in the output.

### Errors

- API errors (invalid credentials, project not found, collection not found, malformed query, permission denied) are thrown as node errors.
- With `continueOnFail` enabled, the failing item produces an `error` output item and processing continues.
- Missing required parameters (e.g. `collection`, `documentId` for get/delete) should produce a validation error before the API call.
- The `database` parameter defaults to `(default)`; specifying a non-existent database ID causes a Firestore API error.

### Expressions

All string and numeric parameters accept n8n expression syntax (`{{ }}`).

## Acceptance tests

### Test: create document

**Given** input items:

```json
[{ "json": { "title": "Hello", "count": 42 } }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "create",
  "projectId": "my-project",
  "database": "(default)",
  "collection": "messages",
  "documentId": "doc1",
  "columns": "{\"title\": \"={{ $json.title }}\", \"count\": {{ $json.count }}}"
}
```

**Expect** output:

```json
[{
  "json": {
    "_id": "doc1",
    "_name": "projects/my-project/databases/(default)/documents/messages/doc1",
    "_createTime": "2026-01-01T00:00:00Z",
    "_updateTime": "2026-01-01T00:00:00Z"
  }
}]
```

The `_createTime` and `_updateTime` are runtime-determined timestamps.

### Test: get document by ID

**Parameters:**

```json
{
  "resource": "document",
  "operation": "get",
  "projectId": "my-project",
  "collection": "messages",
  "documentId": "doc1"
}
```

**Expect** output:

```json
[{
  "json": {
    "_id": "doc1",
    "_name": "projects/my-project/databases/(default)/documents/messages/doc1",
    "_createTime": "...",
    "_updateTime": "..."
  }
}]
```

### Test: delete document

**Parameters:**

```json
{
  "resource": "document",
  "operation": "delete",
  "projectId": "my-project",
  "collection": "messages",
  "documentId": "doc1"
}
```

**Expect** output:

```json
[{
  "json": { "success": true }
}]
```

### Test: query documents

**Parameters:**

```json
{
  "resource": "document",
  "operation": "query",
  "projectId": "my-project",
  "query": "{\"structuredQuery\": {\"from\": [{\"collectionId\": \"messages\"}], \"limit\": 10}}"
}
```

**Expect** output[0] to be an array of simplified documents (each with `_id`, `_name`, `_createTime`, `_updateTime`).

### Test: list root collections

**Parameters:**

```json
{
  "resource": "collection",
  "operation": "getAll",
  "projectId": "my-project",
  "returnAll": true
}
```

**Expect** output[0] to be an array of objects with shape `{ "name": "projects/.../databases/.../documents/collectionId" }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Document field data input mechanism | Inferred from the `columns` parameter type | The `columns` parameter is a string that accepts key-value pairs; the UI typically renders a resource mapper component. The exact UI interaction is not specified here. |
| Query format | Inferred from Firestore REST API | The `query` parameter accepts JSON matching the Firestore `StructuredQuery` format. Validation and error messages depend on the API response. |
| Sub-collection listing | Documented (Collection GetAll is root-level only) | Sub-collections are not enumerable through this node; querying sub-collections requires specifying their path in the Document query. |
| Simple vs raw response shapes | Inferred from type definitions | The exact raw API response shape is not documented in public n8n docs; the spec defines only the simplified output contract. |
| `updateKey` behavior for upsert | Inferred from type definition | The `updateKey` field references an input-item property name to use as the document ID for upsert matching. Default behavior without `updateKey` is unclear. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleFirebaseCloudFirestore.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
