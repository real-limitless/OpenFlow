# n8n-nodes-base.baserow

## Sources
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.baserow
- https://docs.n8n.io/integrations/builtin/credentials/baserow
- https://baserow.io/docs/index
- https://baserow.io/api-docs

## Wire format
- **Type string:** `n8n-nodes-base.baserow`
- **Credentials:** `Baserow` credential (Basic auth or Database token)
- **Operations:** Row operations supporting create, read, update, delete (single and batch)

## Parameters
- **Table name:** string specifying the Baserow table to operate on
- **Operation:** selection among Create a row, Delete a row, Get a row, Get many rows, Update a row, Create multiple rows, Delete multiple rows, Update multiple rows
- **Operation payload:** JSON struct defined per operation (e.g., row data for create, filter queries for get many)
- **Credentials sub‑field:** either `username`/`password` for basic auth or `token` for token auth
- **Additional query parameters:** optional `qs` for pagination, filter, sort

## Runtime behavior
- Input processing: receives an item (or batch) representing a row operation request
- Execution: calls Baserow REST API using selected authentication method, performs operation on specified table
- Output shape:
  - *Create a row*: returns the created row object including its ID
  - *Get a row* / *Get many rows*: returns the requested row(s) as JSON array/object
  - *Update a row*: returns the updated row object
  - *Delete a row*: returns a success indicator
  - *Batch operations*: returns array of results corresponding to each request
- Error handling: propagates HTTP/network errors, translates Baserow error responses into n8n error objects

## Acceptance tests
1. **Create row test** – Provide row data `{"name":"Test","value":1}`; verify response contains a new ID and echoed data.
2. **Get many rows test** – Query with filter `"status":"active"`; verify returned array length matches expected and contains correct fields.
3. **Update row test** – Update an existing row's `value` to `2`; verify response reflects the updated row.
4. **Delete row test** – Delete a row by ID; verify response indicates success and subsequent get returns 404.
5. **Batch create test** – Create three rows with distinct data; verify each response contains a unique ID and all are returned in the batch result.

## Gaps / confidence
- Exact JSON schema for request/response bodies is inferred from public API docs; minor details (default column values, display options) are not captured.
- Pagination parameters (page, per_page) are mentioned but default limits are unknown; behavior under large datasets is assumed similar to other nodes.
- Credential token scope (database‑wide vs table‑specific) is not fully clarified; spec assumes token is valid for the connected workspace.

## OpenFlow mapping
- **Definition group:** `Baserow`
- **Executor filename:** `baserow` (intended as `baserowExecutor.ts` or similar)