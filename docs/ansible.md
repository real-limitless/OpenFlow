# Ansible in OpenFlow

OpenFlow can run **ad-hoc Ansible modules** on the worker via `openflow-node-base.ansible` (and `ansibleTool` for agents).

Dual-track MCP server: [ansible-flow-mcp](https://github.com/real-limitless/ansible-flow-mcp).

## Requirements

- `ansible` / `ansible-core` on the **worker** `PATH`
- Collections you use installed on that control node
- Docker image installs `ansible-core` + `ansible.posix`, `community.general`, `community.docker`

### Local / bare metal

```bash
# Fedora / RHEL
sudo dnf install ansible-core
ansible-galaxy collection install ansible.posix community.general community.docker

# Debian / Ubuntu
sudo apt install ansible-core
# or: pipx install ansible-core
ansible-galaxy collection install ansible.posix community.general community.docker
```

Verify:

```bash
ansible localhost -m ansible.builtin.ping -c local
```

## Canvas usage

1. Palette → **Ansible** → pick a module (e.g. `file`)
2. Node type is always `openflow-node-base.ansible` with `module` preset
3. Configure hosts / check mode / become
4. **Module options**: Form when a schema exists, else JSON
5. Execute workflow

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/ansible/modules?q=` | Gallery search |
| `GET /api/v1/ansible/modules/:fqcn/schema` | Slim arg schema |

## Security

- Free-form modules denied: `command`, `shell`, `raw`, `script`
- Collection allowlist (builtin + popular)
- Prefer **check mode** before apply
- Worker is the Ansible control node (same trust class as SSH keys on that host)

## Catalog sync

Schemas/gallery live in `src/lib/nodes/ansible/`, mirrored from ansible-flow-mcp `catalog/`.

## Dogfood checklist

- [ ] Worker has `ansible --version`
- [ ] Manual trigger → Ansible `ping` → pong in runData
- [ ] Ansible `file` check mode on localhost path
- [ ] Palette search `docker` shows gallery cards
- [ ] Form UI for `file` / JSON fallback for modules without schema
