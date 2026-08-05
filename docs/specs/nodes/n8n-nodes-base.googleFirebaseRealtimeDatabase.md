---
type: n8n-nodes-base.googleFirebaseRealtimeDatabase
displayName: Google Cloud Realtime Database
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Google Cloud Realtime Database

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudrealtimedatabase/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleFirebaseRealtimeDatabase`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleFirebaseRealtimeDatabaseOAuth2Api` (OAuth2 single-service or custom OAuth2; service accounts not supported per credential matrix)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| projectId | options (dynamic) | "" | yes | always | Firebase project name/ID, dynamically loaded via `getProjects` method; accepts expression |
| operation | options | "create" | yes | always | One of: Create, Delete, Get, Push, Update |
| path | string | "" | yes | always | Object path on database, e.g. `/app/users`. Do not append `.json`. For Get operation the path is optional (blank = whole database) |
| attributes | string | "" | yes | Create, Push, Update only | Comma-separated column/attribute names to write, e.g. `age, name, city` |

### Operation descriptions

| operation | action | description |
|-----------|--------|-------------|
| create | Write data to a database | Creates an object at the specified path using incoming item JSON fields corresponding to the listed attributes |
| delete | Delete data from a database | Deletes the object at the specified path |
| get | Get a record from a database | Retrieves data at the path; omit path to fetch entire database |
| push | Append to a list of data | Appends a new child to a list node (auto-generated key) using incoming item fields |
| update | Update item on a database | Merges incoming field values into the existing object at the specified path |

## Runtime behavior

### Input

Each incoming item supplies the data for one database operation. For Create, Push, and Update operations, the item's `json` properties that match the comma-separated `attributes` parameter are written to the Firebase Realtime Database.

For Delete and Get operations, the item's data is ignored — only the `path` parameter is used.

### Output

- **Create:** Outputs the written data with the Firebase-generated key (if applicable).
- **Delete:** Outputs the deleted data as returned by the Firebase REST API.
- **Get:** Outputs the retrieved data from the specified path.
- **Push:** Outputs the pushed data including the auto-generated push key.
- **Update:** Outputs the updated data as returned by the API.

All operations produce one output item per input item, with the response payload under `json`.

### Errors

- Network/auth failures or invalid project IDs throw an error by default.
- Missing required parameters (projectId, path, attributes where applicable) throw an error.
- When `continueOnFail` is enabled, errored items are suppressed and processing continues with remaining items.

### Expressions

- `projectId` accepts expressions.
- `path` accepts expressions.
- `attributes` accepts expressions.

## Acceptance tests

### Test: Create a record

**Given** input items:

```json
[{ "json": { "name": "Alice", "age": 30 } }]
```

**Parameters:**

```json
{
  "projectId": "my-firebase-project",
  "operation": "create",
  "path": "/users/user1",
  "attributes": "name, age"
}
```

**Expect** output[0] contains the written data reflecting `{ "name": "Alice", "age": 30 }` at `/users/user1`.

### Test: Get a record

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "projectId": "my-firebase-project",
  "operation": "get",
  "path": "/users/user1"
}
```

**Expect** output[0] contains `{ "name": "Alice", "age": 30 }` (or whatever exists at that path).

### Test: Delete a record

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "projectId": "my-firebase-project",
  "operation": "delete",
  "path": "/users/user1"
}
```

**Expect** output[0] contains the deleted data response from the Firebase REST API.

### Test: Push (append to list)

**Given** input items:

```json
[{ "json": { "name": "Bob", "score": 95 } }]
```

**Parameters:**

```json
{
  "projectId": "my-firebase-project",
  "operation": "push",
  "path": "/scores",
  "attributes": "name, score"
}
```

**Expect** output[0] contains the pushed data with an auto-generated push key (e.g. `-Nabcdef123`).

### Test: Update an existing record

**Given** input items:

```json
[{ "json": { "age": 31 } }]
```

**Parameters:**

```json
{
  "projectId": "my-firebase-project",
  "operation": "update",
  "path": "/users/user1",
  "attributes": "age"
}
```

**Expect** output[0] contains the updated data after merging `{ "age": 31 }` into the existing record.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| OAuth2 credentials | documented | Single-service OAuth2 with custom/Managed options; service accounts not supported per the Google credential matrix |
| Project ID dynamic loading | inferred from type descriptor | `getProjects` load-options method fetches a dynamic list; exact API call not documented publicly |
| Attributes parameter handling | inferred | The descriptor shows a comma-separated string mapped to item JSON fields — exact field selection logic is inferred |
| Firebase REST API response shapes | inferred | Exact response envelope (e.g. key names, error codes) depends on the Firebase REST API at `https://<project>.firebaseio.com/` |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleFirebaseRealtimeDatabase.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
