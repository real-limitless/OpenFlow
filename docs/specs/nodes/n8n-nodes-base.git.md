---
type: n8n-nodes-base.git
displayName: Git
category: Development
versions: [1]
priority: medium
status: specced
---

# Git

Perform git operations on a repository: add, addConfig, clone, commit, log,
push, reflog, switchBranch, and tag.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.git/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/git.md | Public docs only (credentials) |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, `Git.node.json` + description files) | Public descriptor metadata — wire parameter names, enums, defaults only |

## Wire format

- **Type string:** `n8n-nodes-base.git`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** optional — `gitPassword` when authenticating over HTTPS, `sshPrivateKey` when authenticating over SSH (**documented** + **descriptor**)

### Credential fields

**Git Password (`gitPassword`)** — username, password (**documented** / **descriptor**).

**SSH Private Key (`sshPrivateKey`)** — privateKey (PEM / OpenSSH), passphrase (optional if key unencrypted) (**documented** / **descriptor**).

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `clone` | yes | — | `add` \| `addConfig` \| `clone` \| `commit` \| `log` \| `push` \| `reflog` \| `switchBranch` \| `tag` (**documented**; default **descriptor**) |
| path | string | `""` | yes* | operation ∈ add, addConfig, commit, log, push, reflog, switchBranch, tag | Path to the local repository working directory (**documented**) |
| repository | string | `""` | yes* | operation = clone | Repository URL to clone (**documented**) |
| clonePath | string | `""` | yes* | operation = clone | Local directory path to clone into (**documented**) |
| branch | string | `""` | no | operation ∈ clone, switchBranch, push | Branch name to checkout / switch to / push (**documented**) |
| createBranch | boolean | `false` | no | operation = switchBranch | Create the branch if it does not exist (**documented**) |
| pathsToAdd | string | `"."` | no | operation = add | File path(s) to add to the index (**documented**) |
| message | string | `""` | yes* | operation ∈ commit, tag | Commit message or annotated tag message (**documented**) |
| allowEmpty | boolean | `false` | no | operation = commit | Allow empty commits (**documented**) |
| force | boolean | `false` | no | operation ∈ push, switchBranch | Force push / force branch switch (**documented**) |
| remote | string | `origin` | no | operation = push | Remote name to push to (**documented**) |
| maxCommits | number | `100` | no | operation ∈ log, reflog | Maximum number of commits / reflog entries to return (**documented**) |
| tagAction | options | `add` | no | operation = tag | `add` \| `list` \| `delete` (**documented**) |
| tagName | string | `""` | yes* | operation = tag, tagAction ∈ add, delete | Tag name (**documented**) |
| configKey | string | `""` | yes* | operation = addConfig | Git config key (e.g. `user.name`, `user.email`) (**documented**) |
| configValue | string | `""` | yes* | operation = addConfig | Git config value (**documented**) |
| options | collection | `{}` | no | all operations | Nested options below (**documented** subset + **descriptor** keys) |
| options.timeout | number | `10000` | no | — | Operation timeout in ms (**descriptor**) |

\*Required when the operation's displayOptions show the field.

## Runtime behavior

### Input

- One git action per input item (standard item loop) (**inferred**).
- `path` / `repository` / `clonePath` / `branch` / `message` / `pathsToAdd` / `configKey` / `configValue` / `tagName` accept expression strings (**inferred** / standard).
- Credentials supply authentication for remote operations (clone, push); local operations (add, commit, log, etc.) do not require credentials (**documented**).

### Output

| operation | Output shape |
|-----------|----------------|
| **clone** | One success item with `success: true`, `path`, `repository` (**inferred**). |
| **add** | One success item per input with `success: true`, `path`, `pathsToAdd` (**inferred**). |
| **commit** | One success item per input with `success: true`, `message`, `commitHash` (**inferred**). |
| **push** | One success item per input with `success: true`, `remote`, `branch` (**inferred**). |
| **log** | One item per commit entry (hash, date, author, message) up to `maxCommits` (**documented**). |
| **reflog** | One item per reflog entry (hash, selector, message) up to `maxCommits` (**documented**). |
| **switchBranch** | One success item per input with `success: true`, `branch` (**inferred**). |
| **tag** | add/delete: one success item per input. list: one item per tag name (**documented**). |
| **addConfig** | One success item per input with `success: true`, `key`, `value` (**inferred**). |

### Errors

- Missing/invalid credentials for remote operations → fail item/node (**inferred** standard).
- Repository path not found, not a git repo → fail (**inferred**).
- Commit with no staged changes and `allowEmpty=false` → fail (**inferred**).
- Push to protected branch without `force` → fail (**inferred**).
- `continueOnFail`: failed item yields error on item / empty branch per engine policy (**inferred**).

### Expressions

`path`, `repository`, `clonePath`, `branch`, `message`, `pathsToAdd`, `configKey`, `configValue`, `tagName` accept expression strings where the UI allows expressions (**inferred** / standard).

## Acceptance tests

### Test: clone a repository

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "clone",
  "repository": "https://github.com/example/repo.git",
  "clonePath": "/tmp/repo"
}
```

**Expect** output[0]:

```json
[{ "json": { "success": true, "path": "/tmp/repo", "repository": "https://github.com/example/repo.git" } }]
```

### Test: add files

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "add",
  "path": "/tmp/repo",
  "pathsToAdd": "."
}
```

**Expect** output[0]:

```json
[{ "json": { "success": true, "path": "/tmp/repo", "pathsToAdd": "." } }]
```

### Test: commit changes

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "commit",
  "path": "/tmp/repo",
  "message": "feat: add new feature"
}
```

**Expect** output[0]:

```json
[{ "json": { "success": true, "message": "feat: add new feature", "commitHash": "<sha>" } }]
```

### Test: log returns commit entries

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "log",
  "path": "/tmp/repo",
  "maxCommits": 5
}
```

**Expect** output[0]: array of items, each with `hash`, `date`, `author`, `message` fields; length ≤ 5.

### Test: switchBranch with create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "switchBranch",
  "path": "/tmp/repo",
  "branch": "feature-x",
  "createBranch": true
}
```

**Expect** output[0]:

```json
[{ "json": { "success": true, "branch": "feature-x" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations list | documented | add, addConfig, clone, commit, log, push, reflog, switchBranch, tag |
| Wire param names (`pathsToAdd`, `clonePath`, `createBranch`, `tagAction`, `configKey`, `configValue`) | descriptor | From package node-definition schema under CORPUS_DIR only — not execute source |
| Default operation `clone` | descriptor | Aligns with common UI defaults |
| Output JSON keys for each operation | inferred | Docs describe behavior, not exact item JSON schema |
| `maxCommits` default | inferred | Common default for log limits |
| `options.timeout` | descriptor | Numeric default from descriptor |
| Exact error message strings | inferred | |
| Config key allowlist / `N8N_GIT_NODE_ALLOW_ALL_CONFIG_KEYS` | gap | Not fully documented; spec agent could not confirm env var behavior |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/git.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Prefer a pluggable GitClient behind the executor (like FTP); never load third-party workflow node packages. Credential resolution by `authentication` → `gitPassword` / `sshPrivateKey`.