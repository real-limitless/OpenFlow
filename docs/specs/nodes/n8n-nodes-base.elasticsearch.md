# n8n-nodes-base.elasticsearch

## Sources
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.elasticsearch.md (Public docs only)

## Wire format
- **Type string**: `n8n-nodes-base.elasticsearch`
- **Inputs**: 1 (expects a single item)
- **Outputs**: 1 (returns a single item)
- **Credentials**: Elasticsearch credential (host, authentication, etc.) – see Elasticsearch credentials documentation.

## Parameters
- **Operation**: selects Document, Index, Create, Delete, Get, Update, Get All, etc. (high‑level operation selector)
- **Resource**: optional index name or wildcard
- **Query options**: filter, sort, size, etc. (abstracted)
- **Credential overrides**: per‑item configuration for host, auth token, etc.

## Runtime behavior
- Accepts a single workflow item, forwards it to the selected Elasticsearch operation.
- Executes the operation using the supplied credentials and parameters.
- Returns the Elasticsearch response as a single item, preserving the most relevant fields (e.g., `_id`, `_source`).
- Errors propagate as a failure item with error details; retries are not automatic.

## Acceptance tests
1. **Create Document**: Input item with `payload` field; operation = "Create a document"; expects output containing created document ID.
2. **Get Document**: Input item with `id` field; operation = "Get a document"; expects output with `found` boolean and `payload` if found.
3. **Delete Document**: Input item with `id` and `index`; expects output confirming deletion count.
4. **Search Documents**: Input item with `query` filter; expects output array of hits.
5. **Update Document**: Input with `id`, `index`, `payload`; expects output with updated doc count.

## Gaps / confidence
- Exact parameter names (e.g., `body`, `query`) are inferred from typical Elasticsearch API; documented APIs confirm operation existence.
- Default pagination size not documented; assumed `size` default of 10.
- Some advanced options (scroll, routing) not covered; may be added later.

## OpenFlow mapping
- **Definition group**: `elasticsearch`
- **Executor filename**: `nodes/elasticsearch/ExecuteElasticsearch.node.js`