# Ansible catalog (dual-track)

Synced from [ansible-flow-mcp](https://github.com/real-limitless/ansible-flow-mcp) `catalog/`.

| File | Role |
| --- | --- |
| `gallery.json` | Palette module cards |
| `schemas/*.json` | Hybrid Form UI + API |
| `collections-allowlist.yml` | Policy reference (executor has TS allowlist) |

Regenerate upstream with `python scripts/generate_catalog.py`, then copy `catalog/` here.

Executor: `src/lib/engine/executors/ansible.ts`  
Node type: `openflow-node-base.ansible`
