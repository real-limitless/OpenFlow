---
type: n8n-nodes-base.googleFirebaseCloudFirestoreTool
displayName: Google Firebase Cloud Firestore
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Google Firebase Cloud Firestore (AI Tool)

A tool variant of the Google Firebase Cloud Firestore node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Document (create/upsert/get/getAll/delete/query) and Collection (getAll) operations against the Google Firestore REST API.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudfirestore.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://firebase.google.com/docs/firestore/reference/rest | Google Firebase public API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleFirebaseCloudFirestoreTool`
- **Aliases:** `Firestore`, `Cloud Firestore`, `Google Firestore`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleFirebaseCloudFirestoreOAuth2Api` (extends Google OAuth2 with scopes `https://www.googleapis.com/auth/datastore` and `https://www.googleapis.com/auth/firebase`) or `googleApi` (service account)

## Parameters

Parameter shapes match the full Google Firebase Cloud Firestore node (see `n8n-nodes-base.googleFirebaseCloudFirestore`), with additional AI-support metadata.

### Common parameters

| parameter | type | default | notes |
|-----------|------|---------|-------|
| `resource` | options | `document` | `document` or `collection` |
| `authentication` | options | `googleFirebaseCloudFirestoreOAuth2Api` | `googleFirebaseCloudFirestoreOAuth2Api` or `serviceAccount` |
| `projectId` | string | — | GCP project ID. Required unless set on the credential. Accepts `$fromAI()`. |
| `database` | string | `(default)` | Firestore database ID. Accepts `$fromAI()`. |

### Resource: Document

| Operation | Key parameters |
|-----------|----------------|
| Create | `collection`, `documentId` (optional), `columns` (key-value fields), `simple` (boolean, default true) |
| Upsert (Create/Update) | `collection`, `updateKey` (field name for ID), `columns` (key-value fields) |
| Get | `collection`, `documentId`, `simple` (boolean, default true) |
| GetAll | `collection`, `returnAll` (boolean, default false), `limit` (number, default 100, conditional on returnAll=false), `simple` (boolean, default true) |
| Delete | `collection`, `documentId` |
| Query | `query` (JSON StructuredQuery), `simple` (boolean, default true) |

### Resource: Collection

| Operation | Key parameters |
|-----------|----------------|
| GetAll | `returnAll` (boolean, default false), `limit` (number, default 100, conditional on returnAll=false) |

## Runtime behavior

### Input

Each input item is processed independently. Field data for write operations can be sourced from input item properties via the `columns` parameter.

### Output

- **Create (simple):** `{ _id, _name, _createTime, _updateTime }`
- **Create (full):** Raw Firestore REST API document representation
- **Get / GetAll / Query (simple):** Array or single object with `_id`, `_name`, `_createTime`, `_updateTime`
- **Upsert:** `{ updateTime }`
- **Delete:** `{ success: boolean }`
- **Collection GetAll:** Array of `{ name }` strings

Original input item properties are preserved in the output.

### Errors

- API errors (invalid credentials, project/collection not found, malformed query, permission denied) are thrown as node errors
- Missing required parameters produce validation errors before the API call
- The `database` parameter defaults to `(default)`; specifying a non-existent database ID causes a Firestore API error
- With `continueOnFail` enabled, the failing item produces an `error` output item

### AI agent integration

When used as an AI agent tool:
- The agent model can populate `projectId`, `database`, `collection`, `documentId`, `query`, `columns`, and other parameters via `$fromAI()`
- The tool description provides context to the agent about the resource and operation being performed
- Simplified output (`simple`) is recommended for AI agent consumption to reduce response size

## Acceptance tests

### Test: agent creates a document

**Parameters:**

```json
{
  "resource": "document",
  "operation": "create",
  "projectId": "={{ $fromAI() }}",
  "database": "(default)",
  "collection": "={{ $fromAI() }}",
  "columns": "={{ $fromAI() }}"
}
```

**Expect** output[0] to contain a simplified document with `_id`, `_name`, `_createTime`, `_updateTime`.

### Test: agent queries documents

**Parameters:**

```json
{
  "resource": "document",
  "operation": "query",
  "projectId": "my-project",
  "query": "={{ $fromAI() }}"
}
```

**Expect** output[0] to be an array of simplified documents (each with `_id`, `_name`, `_createTime`, `_updateTime`).

### Test: agent lists root collections

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

### Test: agent deletes a document

**Parameters:**

```json
{
  "resource": "document",
  "operation": "delete",
  "projectId": "my-project",
  "collection": "={{ $fromAI() }}",
  "documentId": "={{ $fromAI() }}"
}
```

**Expect** output[0] to contain `{ "success": true }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| All operations and parameters | Inferred from the base Firestore node descriptor | The Tool variant shares the same operations and parameter surface as the base node, with AI-specific metadata added |
| `$fromAI()` behavior | Public docs | The AI tool parameter population mechanism is documented in n8n public docs |
| Tool registration with AI agent | Public docs | Tool nodes register themselves automatically when used in AI Agent nodes |
| Exact alias strings | Inferred | Common name aliases would be generated for AI agent tool resolution |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleFirebaseCloudFirestoreTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
