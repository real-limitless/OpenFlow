---
type: openflow-node-base.ansible
displayName: Ansible
category: Development
versions: [1]
priority: high
status: implemented
---

# Ansible

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html | Public docs only |
| https://docs.ansible.com/ansible/latest/collections/ansible/builtin/ping_module.html | Public docs only |
| https://docs.ansible.com/ansible/latest/collections/ansible/builtin/file_module.html | Public docs only |
| Dual-track catalog/runner contract (ansible-flow-mcp) | Shared fixtures / public CLI behavior |

## Wire format

- **Type string:** `openflow-node-base.ansible`
- **Aliases:** none
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `ansibleSsh` (preferred), or `sshPassword` / `sshPrivateKey`; optional become password on `ansibleSsh`

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `resource` | options | `module` | no | `module` \| `playbook` |
| `authentication` | options | `none` | no | none \| ansibleSsh \| sshPassword \| sshPrivateKey |
| `module` | string | ping FQCN | when module | Module FQCN |
| `args` | json/object | `{}` | no | Module arguments (module mode) |
| `playbook` | string | `""` | when playbook | Path to `.yml`/`.yaml` under path jail |
| `extraVars` | json/object | `{}` | no | Playbook `-e @file` |
| `limit` / `tags` / `skipTags` | string | `""` | no | Playbook filters |
| `hosts` | string | `localhost` | no | Host pattern (module mode) |
| `inventory` | string | `""` | no | Inventory path or inline |
| `checkMode` | boolean | `false` | no | Pass `--check` |
| `become` | boolean | `false` | no | Pass `--become` |
| `becomeUser` | string | `""` | no | `--become-user` when non-empty |
| `connection` | string | `""` | no | `-c` when set |
| `timeout` | number | `120` | no | Subprocess timeout seconds (bounded) |
| `executeOnce` | boolean | `true` | no | Run once for all items vs per item |

## Runtime behavior

### Overview

### Module mode

`ansible <hosts> -m <module> -i <inventory> [-a <json-args>] [--check] [--become] …`

### Playbook mode

`ansible-playbook <playbook.yml> -i <inventory> [--check] [--become] [-e @vars.json] [--limit] [--tags] …`

Playbook path must be under allowlisted roots (`OPENFLOW_ANSIBLE_PLAYBOOK_ROOTS`, cwd, `/data/ansible`, tmpdir). Max 2MB.

Uses `ANSIBLE_STDOUT_CALLBACK=json`. Module mode emits per-task host rows; playbook mode **aggregates by host** with `result.tasks[]`.

### Allowlist (partial v1)

- FQCN must match `collection.ns.name` pattern.
- Free-form modules denied: `ansible.builtin.command`, `.shell`, `.raw`, `.script`.
- Collections: `ansible.builtin`, `community.general`, `ansible.posix`, `community.docker` (override later via settings).

### Output

One main-branch item per host result (when multiple hosts), or a single summary item when parse yields none and exit is 0:

| field | type | description |
|-------|------|-------------|
| `host` | string | Target host |
| `ok` | boolean | Host task ok |
| `changed` | boolean | Changed flag |
| `failed` | boolean | Failed flag |
| `unreachable` | boolean | Unreachable |
| `msg` | string? | Message |
| `rc` | number? | Return code when present |
| `result` | object | Redacted module return |
| `module` | string | FQCN |
| `checkMode` | boolean | Whether check mode was used |
| `exitCode` | number | Process exit code |
| `stdout` / `stderr` | string | Truncated streams (optional on items) |

When `executeOnce` is true, module runs once using the first input item for expression evaluation; output items are host results (not necessarily 1:1 with input).

### Errors

- Missing `module` → throw.
- Disallowed module/collection → throw.
- Non-zero exit **or** any host `failed`/`unreachable` → throw unless `continueOnFail`, in which case error fields are attached to items.

### Partial gaps

- Live `ansible-doc` schema fetch not implemented (static catalog only).
- Private key passphrase support is best-effort (env hint; prefer unlocked keys or ssh-agent on the worker).
- Inline playbook body (paste YAML) not supported — path on worker only.

## Acceptance tests

### Test: mock ping success

**Given** mocked ansible JSON callback with localhost pong.

**Parameters:** `module=ansible.builtin.ping`, `checkMode=true`

**Expect** one host item, `result.ping == "pong"`, `failed` false.

### Test: deny shell

**Parameters:** `module=ansible.builtin.shell`

**Expect** throw allowlist/deny error.

### Test: invalid fqcn

**Parameters:** `module=../evil`

**Expect** throw validation error.
