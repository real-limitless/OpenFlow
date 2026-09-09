# mcp-flow gallery (catalog-data)

OpenFlow reads mcp-flow's published shard tree. It does not scrape a second marketplace.

Used by:

- `GET /api/v1/mcp-gallery?q=`
- `GET /api/v1/mcp-gallery/:id`
- Editor MCP gallery section (search, drop an MCP Client Tool)

**Source of truth:** mcp-flow `catalog-data` / Pages `catalog/index.json` (schema 1.2.0).

Env:

- `MCP_FLOW_CATALOG_DIR` local shards
- `MCP_FLOW_CATALOG_URL` remote directory (default `https://real-limitless.github.io/mcp-flow/catalog`)
- `MCP_FLOW_URL` + `MCP_FLOW_ADMIN_TOKEN` to search the live gateway instead
