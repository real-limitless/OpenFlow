---
type: n8n-nodes-base.localFileTrigger
displayName: Local File Trigger
category: Triggers
versions: [1]
priority: medium
status: specced
---

# Local File Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.localfiletrigger.md | Public docs only |
| https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/block-specific-nodes.md | Public docs only (default exclude / security) |
| https://github.com/micromatch/anymatch (linked from node docs for Ignore syntax) | Public third-party docs (pattern syntax only) |
| Public node descriptor metadata (parameter names, defaults, enums, aliases) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.localFileTrigger`
- **Aliases:** UI search labels may include `Watch`, `Monitor` (**inferred** from public descriptor metadata; not alternate runtime type ids)
- **Display name:** `Local File Trigger`
- **Group / category:** trigger · Core Nodes · Files / Other Trigger Nodes (**inferred** group tags from public descriptor; category from public docs)
- **Versions:** `1` (`typeVersion`)
- **Inputs:** none (empty inputs; trigger)
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Hosting:** Self-hosted only — not available on Cloud (**documented**)
- **Default availability:** Disabled/blocked by default from product version 2.0 due to security risk in multi-user environments; operators enable via node-exclude configuration (e.g. empty or non-including `NODES_EXCLUDE`) (**documented**)
- **Activation:** Workflow must be **saved and published/activated** for continuous watching. Editor “execute step” listens temporarily until a change is detected (**documented** via public trigger-panel copy / docs testing flow)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| triggerOn | options | `""` | yes | — | What to watch. Wire: `file` = “Changes to a Specific File”; `folder` = “Changes Involving a Specific Folder” (**documented** UI; wire enums from public descriptor) |
| path | string | `""` | yes (when set) | when `triggerOn=file`: File to Watch; when `triggerOn=folder`: Folder to Watch | Absolute or host-local filesystem path. Same wire key for both modes. Placeholders: file `/data/invoices/1.pdf`, folder `/data/invoices` (**documented** labels; wire key **inferred** from descriptor) |
| events | multiOptions | `[]` | yes when folder | `triggerOn: ["folder"]` | Which folder-related change kinds to fire on (see enum below). Hidden for file mode (**documented** “Watch for”; wire values from descriptor) |
| options | collection | `{}` | no | — | Optional watcher tuning (see nested options) |

### `events` enum (folder mode)

| Wire value | UI label | Meaning |
|------------|----------|---------|
| `add` | File Added | New file appeared under the watched folder |
| `change` | File Changed | Existing file content/metadata changed |
| `unlink` | File Deleted | File removed |
| `addDir` | Folder Added | New subdirectory appeared |
| `unlinkDir` | Folder Deleted | Subdirectory removed |

(**documented** behaviors; wire strings from public descriptor)

### File mode (`triggerOn=file`)

- Watches a **single file** path for change (**documented**).
- `events` is not shown; treat any detected change on that path as a trigger (**inferred** — docs say “when the specified file changes” without listing event multi-select).

### Folder mode (`triggerOn=folder`)

- Watches a **directory** path; fires only for selected `events` (**documented**).

### Options (`options.*`)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| options.awaitWriteFinish | boolean | `false` | no | Wait until a write settles before firing, to avoid reading partially written files (**descriptor**; not called out on main docs page) |
| options.followSymlinks | boolean | `true` | no | “Include Linked Files/Folders” — also watch through symlinks / OS aliases / shortcuts; if false, only the link entries themselves (**documented** + descriptor) |
| options.ignored | string | `""` | no | “Ignore” — path patterns to skip. Matched against the **full path**, not basename only. Supports Anymatch syntax (**documented**). Placeholder examples: `**/*.txt`, `ignore-me/subfolder` |
| options.ignoreInitial | boolean | `true` | no | “Ignore Existing Files/Folders” — do not emit for paths already present when the watcher starts (**descriptor**; not on main docs page) |
| options.depth | options (number) | `-1` | no | “Max Folder Depth” how deep under the root folder to watch (**documented**). Wire values: `0` Top Folder Only, `1`…`5` levels down, `-1` Unlimited (**descriptor**) |
| options.usePolling | boolean | `false` | no | Use polling instead of native FS events; often needed for network mounts (**descriptor**) |
| options.ignoreMode | options | `match` | no | How `ignored` is interpreted: `match` = Anymatch/regex-style patterns (docs note regex may not work on macOS); `contain` = ignore if path **contains** the given substring (**descriptor**) |

### Ignore pattern examples (documented)

- Single file: `**/myfile.txt` (pattern `**/<fileName>.<suffix>`)
- Subdirectory tree: `**/myDirectory/**`

## Runtime behavior

### Role

Starts a workflow when the local filesystem reports a matching change (file/folder added, changed, or deleted) under a configured path. Self-hosted host process must have filesystem access to `path`.

### Input

No upstream items. The host file watcher starts an execution when a matching FS event occurs. Manual/test execute arms a temporary listener until a change is observed (**documented** editor help).

### Watcher lifecycle

1. **Arm (active workflow):** On publish/activate, open a long-lived watch on `path` with the resolved options (depth, symlinks, ignore, polling, await-write-finish, ignore-initial).
2. **Arm (editor test):** On Execute Step / Execute Workflow while inactive, arm the same watch for the editor session; first matching change runs an execution visible in the editor.
3. **Filter:** Drop events that do not match mode (`file` vs `folder`), selected `events` (folder mode), ignore rules, or depth.
4. **Emit:** Each accepted event starts a workflow execution with one item on `main[0]` (see Output).
5. **Disarm:** On deactivate / editor stop, close the watcher.

### Output

Public docs do **not** publish a formal JSON schema for the emitted item. OpenFlow should emit a stable, useful envelope (**inferred**):

```json
{
  "event": "<add|change|unlink|addDir|unlinkDir|change>",
  "path": "</absolute/or/watched/path>"
}
```

| Field | Meaning |
|-------|---------|
| `event` | Change kind. Folder mode uses the selected watcher event string. File mode typically uses `change` (or the underlying watcher event if distinct) (**inferred**) |
| `path` | Filesystem path of the affected file or folder (**inferred**) |

- One execution item per accepted FS event (**inferred** from trigger conventions).
- No binary payload is required by public docs; binary attachment of file contents is **out of scope** unless a later fixture proves otherwise (**inferred**).

### Errors

- Missing/empty `triggerOn` or `path` → configuration error; do not arm watcher.
- Folder mode with empty `events` → configuration error (required multi-select).
- Path does not exist or is inaccessible → fail arming with a clear error (permissions / ENOENT) (**inferred** host FS behavior).
- Watcher runtime errors (watch limit exceeded, network FS failure) → surface as trigger/host error; do not silently drop the workflow activation without feedback (**inferred**).
- `continueOnFail` is not meaningful for arming; per-execution downstream failures follow normal workflow error handling.

### Expressions

`path`, `ignored`, and other string fields may accept expression strings where the platform evaluates node parameters (**inferred** platform-wide). Expressions for watch paths are typically resolved at arm time, not per event (**inferred**).

### Security / deployment (documented)

- Node can expose host filesystem activity; treat as high risk with untrusted users.
- Product disables the type by default (v2.0+); OpenFlow should honor an equivalent allow/deny list for local FS triggers.
- Not offered on multi-tenant Cloud-style hosting without explicit host FS policy.

## Acceptance tests

### Test: file mode — change fires once

**Given** trigger parameters:

```json
{
  "triggerOn": "file",
  "path": "/data/invoices/1.pdf",
  "options": {}
}
```

**And** the watcher is armed  
**When** `/data/invoices/1.pdf` is modified on disk  

**Expect** one execution with output[0]:

```json
[
  {
    "json": {
      "event": "change",
      "path": "/data/invoices/1.pdf"
    }
  }
]
```

### Test: folder mode — file added only

**Given** parameters:

```json
{
  "triggerOn": "folder",
  "path": "/data/invoices",
  "events": ["add"],
  "options": {
    "ignoreInitial": true,
    "depth": -1
  }
}
```

**When** a new file `/data/invoices/new.pdf` is created  
**And** an existing file `/data/invoices/old.pdf` is modified  

**Expect** only the add event produces an execution:

```json
[
  {
    "json": {
      "event": "add",
      "path": "/data/invoices/new.pdf"
    }
  }
]
```

(change on `old.pdf` must **not** fire because `change` is not in `events`)

### Test: ignore pattern (match mode)

**Given** parameters:

```json
{
  "triggerOn": "folder",
  "path": "/data/invoices",
  "events": ["add", "change"],
  "options": {
    "ignored": "**/*.tmp",
    "ignoreMode": "match",
    "ignoreInitial": true
  }
}
```

**When** `/data/invoices/scratch.tmp` is created  
**And** `/data/invoices/real.pdf` is created  

**Expect** only:

```json
[
  {
    "json": {
      "event": "add",
      "path": "/data/invoices/real.pdf"
    }
  }
]
```

### Test: ignore subdirectory tree

**Given** parameters:

```json
{
  "triggerOn": "folder",
  "path": "/data/invoices",
  "events": ["add"],
  "options": {
    "ignored": "**/myDirectory/**",
    "ignoreMode": "match"
  }
}
```

**When** `/data/invoices/myDirectory/nested.txt` is created  
**Expect** no execution.

### Test: depth top folder only

**Given** parameters:

```json
{
  "triggerOn": "folder",
  "path": "/data/invoices",
  "events": ["add"],
  "options": {
    "depth": 0,
    "ignoreInitial": true
  }
}
```

**When** `/data/invoices/top.pdf` is created  
**And** `/data/invoices/sub/nested.pdf` is created  

**Expect** only the top-level add:

```json
[
  {
    "json": {
      "event": "add",
      "path": "/data/invoices/top.pdf"
    }
  }
]
```

### Test: missing path fails arm

**Given** parameters:

```json
{
  "triggerOn": "folder",
  "path": "",
  "events": ["add"]
}
```

**Expect** arming/validation error; no watcher started.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| triggerOn file/folder modes | documented | Public docs + descriptor enums |
| path dual label (file vs folder) | documented UI / inferred wire | Same parameter name `path` from descriptor |
| events multiOptions values | documented labels / inferred wire | `add`, `change`, `unlink`, `addDir`, `unlinkDir` from descriptor |
| Options followSymlinks, ignored, depth | documented | Docs cover the three primary options |
| awaitWriteFinish, ignoreInitial, usePolling, ignoreMode | inferred (descriptor metadata) | Present in public package descriptor; not fully described on docs page |
| depth numeric enum including -1/0 | inferred | From public descriptor options list |
| Output JSON `{ event, path }` | inferred | Docs omit payload schema; stable envelope for OpenFlow |
| File-mode event string always `change` | inferred | Docs only say “file changes” |
| Self-hosted only + disabled by default v2.0 | documented | Security + Cloud notes |
| Anymatch ignore syntax | documented | Linked third-party pattern docs |
| macOS regex ignore limitation | inferred | Descriptor description for ignoreMode=match |
| Polling for network FS | inferred | Descriptor description for usePolling |
| Exact chokidar/watch backend | not specified | Implement with any correct FS watch library; do not copy third-party engine source |
| Binary file contents on output | inferred absent | Not mentioned in public docs |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/local-file-trigger.ts`
- **Export:** `localFileTriggerExecutor`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Host note:** Requires a self-hosted (or otherwise FS-capable) runtime; gate behind the same class of node allowlist used for other local FS nodes
- **Implement note (cycle 2):** Gate failures are implement-side (executor module parse / JSDoc backticks, vitest batch registration). Spec contract below is unchanged.
