# Ansible catalog integration

| Path | Role |
| --- | --- |
| `data/ansible-catalog/` | Full gallery + schemas (server FS, lazy API) |
| `fallback/` | Small fixture set if full catalog missing |
| `catalog-fs.ts` | Node-only loader |
| `catalog-core.ts` | Pure search/group/schema→fields |
| `client.ts` | Browser `fetch` helpers |
| `catalog.ts` | Client override hooks for tests |

**Do not** `import.meta.glob` thousands of schemas into the Vite client.

Sync from sibling MCP repo:

```bash
npm run ansible:sync-catalog
```

Source of truth: https://github.com/real-limitless/ansible-flow-mcp/tree/main/catalog
