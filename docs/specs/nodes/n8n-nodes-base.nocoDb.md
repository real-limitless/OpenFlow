# Factory job — SPEC (clean-room half A)

## Sources
- https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.nocoDb.md (Public docs only)

## Wire format
- **Type string**: `n8n-nodes-base.nocoDb`
- **Inputs**: 1 JSON item
- **Outputs**: 1 JSON item
- **Credentials**: NocoDB connection (API key or OAuth)

## Parameters
- **Database connection**: Configures the NocoDB data source (URL or credentials).
- **Operation**: Select, Insert, Update, Delete, or custom SQL statement.
- **Query settings**: Batch size, error handling mode, timeout.
- **Output mapping**: Selection of fields to return and default field naming.

*(All parameters are described at the outcome level; no internal nesting.)*

## Runtime behavior
- Processes each incoming JSON item by executing the configured query against the specified NocoDB database.
- Returns query results as JSON items, preserving field names per output mapping.
- Error handling:
  - Invalid query syntax → validation error.
  - Connection failure → connectivity error.
  - Query execution failure → execution error containing server message.
- Stateless: no persistent state between items.

## Acceptance tests
1. **Simple select**: Input with `operation: "select"`, `table: "users"`, `where: { "id": { "eq": 1 } }` returns a JSON item containing the user record.
2. **Insert record**: Input specifies `operation: "insert"` with new record data; node creates the record and returns its ID.
3. **Invalid table**: Node outputs an error JSON with `error: "Invalid table"` when an unsupported table name is provided.
4. **Batch processing**: With batch size > 1, node processes multiple items sequentially, returning each result.
5. **Credential missing**: Node returns a credential error when required API key is not configured.

## Gaps / confidence
- Supported operations are derived from public NocoDB documentation; default field names are inferred from typical responses.
- No explicit default values are documented; defaults are assumed from the node’s configuration.
- The precise list of supported query types is taken from public docs; any ambiguity is marked as inferred.

## OpenFlow mapping
- **Definition group**: `n8n-nodes-base.nocoDb`
- **Executor filename**: `nocoDbExecutor.ts` (to be placed under `src/sdk/nodes/`)