---
type: n8n-nodes-base.mongoDbTool
displayName: MongoDB Tool
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# MongoDB Tool

AI agent tool variant of the MongoDB node. When connected to an AI Agent root node, the agent model can dynamically populate parameters using `$fromAI()`. Wraps MongoDB document operations (aggregate, delete, find, findAndReplace, findAndUpdate, insert, update) and search index operations (create, drop, list, update) against a MongoDB server via the MongoDB Node driver.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mongodb.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mongodb.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mongoDbTool`
- **Aliases:** `n8n-nodes-base.mongodb` (base node)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mongoDb` (required)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | document | yes | — | `document` or `searchIndex`. Determines which set of operations are available. |
| operation | options | find | yes | — | See operation tables below; depends on `resource` selection. |

### Document operations (resource=document)

| operation | purpose | key parameters |
|-----------|---------|---------------|
| aggregate | Runs a MongoDB aggregation pipeline against a collection | `collection` (string, required), `options.aggregate.pipeline` (JSON array) |
| delete | Deletes documents matching a filter | `collection` (string, required), `options.delete.query` (JSON filter object), `options.delete.limit` (number, 0 = all matching, 1 = single) |
| find | Finds documents matching a filter | `collection` (string, required), `options.find.query` (JSON filter object, default `{}`), `options.find.limit` (number, default 0 = unlimited), `options.find.skip` (number, default 0), `options.find.sort` (JSON object), `options.find.projection` (JSON object) |
| findAndReplace | Finds a document and replaces it | `collection` (string, required), `options.findAndReplace.filter` (JSON), `options.findAndReplace.replacement` (JSON) |
| findAndUpdate | Finds a document and updates it | `collection` (string, required), `options.findAndUpdate.filter` (JSON), `options.findAndUpdate.update` (JSON update operators), `options.findAndUpdate.options` (JSON, e.g. `{ "returnDocument": "after" }`) |
| insert | Inserts one or more documents | `collection` (string, required), `options.insert.documents` (JSON object or array of objects) |
| update | Updates documents matching a filter | `collection` (string, required), `options.update.filters` (JSON filter), `options.update.update` (JSON update operators), `options.update.multi` (boolean, default false) |

### Search Index operations (resource=searchIndex)

| operation | purpose | key parameters |
|-----------|---------|---------------|
| create | Creates a search index on a collection | `collection` (string, required), `options.searchIndex.create.name` (string), `options.searchIndex.create.definition` (JSON index definition) |
| drop | Drops a search index | `collection` (string, required), `options.searchIndex.drop.name` (string, required) |
| list | Lists all search indexes on a collection | `collection` (string, required) |
| update | Updates a search index definition | `collection` (string, required), `options.searchIndex.update.name` (string, required), `options.searchIndex.update.definition` (JSON updated definition) |

### Common collection parameter

All operations require a `collection` parameter identifying the target MongoDB collection within the database specified in the credential. The tool does not expose a database selector — the database is fixed by the credential's `database` field.

## Runtime behavior

### Input

Consumes items on `main` input. Each item can supply parameter values via expressions. The credential provides the MongoDB connection string or connection values (host, database, user, password, port, TLS).

### Output

Produces items on `main` output. The output shape depends on the operation:

- **aggregate:** One item per input item containing the aggregation result array: `{ "json": { "documents": [...] } }`
- **delete:** One item per input item with `{ "json": { "deletedCount": <number> } }`
- **find:** Matching documents as individual output items (one per document). When `limit=0` or omitted, returns all matches; otherwise capped at `limit`.
- **findAndReplace / findAndUpdate:** One item per input item containing the found-and-modified document: `{ "json": { "document": { ... } } }`. If `returnDocument: "after"` (default), returns the post-modification document.
- **insert:** One item per input item with `{ "json": { "insertedIds": [<id>, ...], "insertedCount": <number> } }`
- **update:** One item per input item with `{ "json": { "matchedCount": <number>, "modifiedCount": <number>, "upsertedId": <id|null> } }`
- **searchIndex > create:** `{ "json": { "created": true } }`
- **searchIndex > drop:** `{ "json": { "dropped": true } }`
- **searchIndex > list:** `{ "json": { "indexes": [ { "name": "...", "type": "...", "status": "..." }, ... ] } }`
- **searchIndex > update:** `{ "json": { "updated": true } }`

### Errors

- Connection failures (unreachable host, auth failure, TLS errors) throw
- Invalid JSON in query/filter/update parameters throws
- Missing required fields (collection name, operation parameters) throw before the database call
- MongoDB operation errors (write conflicts, validation, index violations) propagate as node errors
- `continueOnFail`: When enabled, failed items emit error output instead of stopping execution

### Expressions

All string parameters accept n8n expressions. JSON parameters (query filters, update operators, aggregation pipelines, replacement documents) can be populated via expressions or `$fromAI()`. The tool variant supports `$fromAI()` for dynamic parameter population by the AI agent model.

## Acceptance tests

### Test: Find documents with filter

**Given** input items:
```json
[{ "json": { "statusField": "active" } }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "find",
  "collection": "users",
  "options": {
    "find": {
      "query": "={ \"status\": $json.statusField }",
      "limit": 10,
      "sort": "{ \"createdAt\": -1 }",
      "projection": "{ \"name\": 1, \"email\": 1, \"status\": 1 }"
    }
  }
}
```

**Expect** output[0]: one item per matching document with only name, email, and status fields, limited to 10, sorted by createdAt descending.

### Test: Insert a document

**Given** input items:
```json
[{ "json": { "name": "Test User", "email": "test@example.com", "role": "admin" } }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "insert",
  "collection": "users",
  "options": {
    "insert": {
      "documents": "={ $json }"
    }
  }
}
```

**Expect** output[0].json to contain `{ "insertedCount": 1 }` and `insertedIds` with the generated ObjectId.

### Test: Update documents matching filter

**Given** input items:
```json
[{ "json": { "oldRole": "guest", "newRole": "member" } }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "update",
  "collection": "users",
  "options": {
    "update": {
      "filters": "={ \"role\": $json.oldRole }",
      "update": "={ \"$set\": { \"role\": $json.newRole } }",
      "multi": true
    }
  }
}
```

**Expect** output[0].json to contain `{ "matchedCount": <number>, "modifiedCount": <number> }`.

### Test: Aggregate pipeline

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "aggregate",
  "collection": "orders",
  "options": {
    "aggregate": {
      "pipeline": "[ { \"$match\": { \"status\": \"completed\" } }, { \"$group\": { \"_id\": \"$productId\", \"total\": { \"$sum\": \"$amount\" } } } ]"
    }
  }
}
```

**Expect** output[0].json to contain `{ "documents": [...] }` with the aggregation result array.

### Test: Search Index list

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "searchIndex",
  "operation": "list",
  "collection": "products"
}
```

**Expect** output[0].json to contain `{ "indexes": [...] }` with an array of search index metadata objects.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource / operation list | documented | Document (7 ops) + Search Index (4 ops) confirmed in public docs |
| Credential fields | documented | Connection string or values (host, database, user, password, port, TLS) from public credential docs |
| AI tool mode | documented | Public docs mark node as `usableAsTool: true` |
| `$fromAI()` support | documented | Confirmed in AI parameter docs for tool variants |
| Exact parameter names / nesting | inferred | Abstracted to high-level `options.<resource>.<operation>` structure; exact original UI nesting not in public docs |
| Output shapes | inferred | Functional outcome spec; actual MongoDB driver return values may vary |
| Search index definition schema | documented | MongoDB Atlas Search index definitions are well-documented externally; node passes them through as JSON |
| findAndReplace behavior details | inferred | Wraps MongoDB `findOneAndReplace`; exact option mapping is inferred |
| Collection parameter type | inferred | Likely a string field in the base node; abstracted as required string parameter |
| Aggregate pipeline validation | inferred | Pipeline is passed as JSON string to MongoDB driver; validation is server-side |

## OpenFlow mapping

- **Definition group:** `transform` (Data & Storage category)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mongoDbTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
