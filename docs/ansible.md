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

## Credentials (SSH / become)

| Credential type | Use |
| --- | --- |
| **Ansible SSH** (`ansibleSsh`) | Preferred: host, user, password and/or private key, become password/user |
| **SSH Password** / **SSH Private Key** | Reuse existing SSH creds (host/user/auth only) |

Node parameter **Authentication**:

- `None` — local connection / inventory path only  
- `Ansible SSH credential` — bind `ansibleSsh`  
- `SSH Password` / `SSH Private Key` — bind those slots  

OpenFlow writes a **temp inventory + key file** (mode 0600), runs ansible, then deletes the temp dir. Secrets are **not** returned in runData `argv` (paths redacted).

Enable **Become** on the node (or set become password on the credential) for privilege escalation.

## Security

- Free-form modules denied: `command`, `shell`, `raw`, `script`
- Collection allowlist (builtin + popular)
- Prefer **check mode** before apply
- Worker is the Ansible control node (same trust class as SSH keys on that host)
- Temp credential material is cleaned up after each run

## Catalog sync

Schemas/gallery live in `src/lib/nodes/ansible/`, mirrored from ansible-flow-mcp `catalog/`.

## Dogfood

```bash
# Install ansible-core on the worker/dev machine
python3 -m pip install --user 'ansible-core>=2.16,<2.19'
export PATH="$HOME/.local/bin:$PATH"
ansible localhost -m ansible.builtin.ping -c local

# Automated dogfood (skips if ansible missing)
npx vitest run src/lib/engine/__tests__/ansible.dogfood.test.ts
npx vitest run src/lib/engine/__tests__/ansible.test.ts src/lib/engine/__tests__/ansible-auth.test.ts
```

### Checklist

- [x] Worker has `ansible --version`
- [x] Executor ping localhost → pong (dogfood test)
- [x] Executor file check-mode (dogfood test)
- [x] ansibleSsh credential inventory + argv redaction (unit test)
- [ ] UI: bind Ansible SSH cred + remote host
- [ ] Palette gallery + Form UI (manual)

