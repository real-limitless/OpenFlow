# Ansible catalog (lazy-loaded)

Full Galaxy gallery + per-module schemas used by:

- `GET /api/v1/ansible/modules`
- `GET /api/v1/ansible/collections`
- `GET /api/v1/ansible/modules/:fqcn/schema`
- Editor Ansible palette (pull-based)

**Source of truth:** [ansible-flow-mcp](https://github.com/real-limitless/ansible-flow-mcp) `catalog/`.

```bash
# from OpenFlow repo (sibling checkout)
bash scripts/sync-ansible-catalog.sh

# or
ANSIBLE_FLOW_MCP_CATALOG=/path/to/ansible-flow-mcp/catalog \
  bash scripts/sync-ansible-catalog.sh
```

Env override at runtime: `OPENFLOW_ANSIBLE_CATALOG_DIR`.

Fallback fixtures for tests (small set): `src/lib/nodes/ansible/fallback/`.

**Note:** `rsync --delete` will remove this README if it is not in the MCP catalog — re-add after sync if needed, or exclude `README.md` in the sync script.
