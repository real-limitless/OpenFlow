---
type: n8n-nodes-base.googleDriveTrigger
displayName: Google Drive Trigger
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Google Drive Trigger

Polling trigger that starts a workflow when a matching change happens in a connected Google Drive: a file or folder is created, updated, or deleted. It polls the Google Drive API on a configurable schedule and emits one workflow item per changed resource, so the workflow runs once per matching event (multiple simultaneous changes within one poll interval are emitted as multiple items from a single trigger firing).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googledrivetrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googledrivetrigger/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only (credentials) |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service.md | Public docs only (credentials) |
| https://developers.google.com/drive/api/guides/changes | Public docs only (Google Drive API) |

## Wire format

- **Type string:** `n8n-nodes-base.googleDriveTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger node — no incoming connections)
- **Outputs:** `main` × 1
- **Credentials:** required — Google credential (`googleDriveOAuth2Api`, extending the Google OAuth2 credential)
- **Node version:** `1.0`
- **Category:** `Data & Storage`

### Credential: `googleDriveOAuth2Api`

Google OAuth2 credential scoped to Google Drive, from the shared single-service OAuth2 flow. Service Account credentials are also listed as compatible with the Google Drive Trigger. Whichever type is used, the Google Drive API must be enabled in the associated Google Cloud project; a service account additionally requires domain-wide delegation configured with the Drive API scope (see the common-issues guidance for the 401 `unauthorized_client` error).

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| event | select | — | yes | — | The change to watch for. Observed public values include `fileCreated`, `fileUpdated`, `fileDeleted`, `folderCreated`, `folderUpdated`, `folderDeleted` (any file/folder lifecycle verb) |
| triggerOn | select | — | yes | — | The scope to watch: either every change Drive-wide or only changes inside a specific folder |
| folderToWatch | string (folder id) | — | when `triggerOn` = specific folder | — | The Drive folder to watch; supports picking an existing folder, pasting a folder URL/id, or an expression |
| options.fileType | string (mime type) | `all` | no | — | Optional MIME type filter on the changed file (e.g. `application/vnd.google-apps.audio` to trigger only on audio files); leave as "all" to ignore file type |
| pollTimes | fixed collection | — | yes | — | The poll schedule; `item[]` entries carry a `mode` select whose documented value `everyMinute` polls once per minute. Reuse the standard n8n poll-schedule semantics (mode list driven, e.g. every minute / every X) |
| options | collection | `{}` | no | — | Additional trigger options, if any (schedule-derived or file-type related) |

## Runtime behavior

### Input

None. This is a trigger node; it is activated by the workflow runtime and produces items asynchronously, never consumed from upstream nodes.

### Poll lifecycle

1. **Activation:** the node authenticates to the Google Drive API with the configured credential and starts a scheduler firing on the schedule derived from `pollTimes` (defaulting to once per minute).
2. **Each poll tick — discovery:** the node asks the Google Drive API for items that changed since the previous successful poll, restricted to the configured `event` (created/updated/deleted) and scope (`triggerOn` + `folderToWatch`, plus `options.fileType` when set). This maps naturally onto the Drive API's *Changes* feed, filtered and/or joined with file metadata to decide which changes match the event type and scope.
3. **Each poll tick — emission:** each matching changed resource becomes one workflow item on output `main`. Multiple changes observed within the same poll interval are emitted as multiple items from that single firing (the docs explicitly warn workflows must handle more than one item per trigger firing).
4. **Cursor persistence:** the node records the poll position after a successful tick so the next tick only surfaces changes after that point, and so already-seen changes are not re-emitted.
5. **Deactivation:** the scheduler stops and the API session is closed.

### Output

One item per matching changed file or folder, on output `main`. Each item carries the Google Drive file resource for the changed item (its metadata), which downstream nodes reference by fields such as the file id and name (public templates use `{{ $json.id }}`, `{{ $json.name }}`, `{{ $json.originalFilename }}`, and the last-modifying-user object). The exact key set is the Drive file resource surface; the id and name fields are guaranteed entry points.

### Errors

- **Authentication / authorization failures** (e.g. HTTP 401 `unauthorized_client`): the credential lacks the Drive scope or the Drive API is not enabled for the project. For OAuth2, enable the Google Drive API under *APIs & Services → Library*; for Service Account, enable domain-wide delegation and add the Drive API to it. Activation fails with a descriptive error.
- **Transient API errors** during a poll tick: the poll fails for that cycle; with `continueOnFail` the node continues scheduling and retries on the next tick.
- **Manual execution with no matching event:** the docs state that on a manual execution the node returns the *last* event matching the criteria, and throws an error if no matching event exists (e.g. watching for file creation when no files have been created yet). Once the workflow is saved/published, the node switches to the polling behavior described above. The executor selects the manual branch when `ctx.getWorkflow().active === false` (or `ctx.getCustomData('triggerMode') === 'manual'` when the host sets it); manual runs emit only the most recent matching Drive file resource rather than the full change list.
- A published poll that finds no new matching changes emits zero items (no error).
- `continueOnFail` applies to per-tick failures; activation-time errors (bad credential, bad schedule) cannot be bypassed by `continueOnFail`.

### Expressions

All parameter fields accept expression strings.

## Acceptance tests

### Test: file created in a watched folder

**Given** a published trigger watching a specific folder for `fileCreated`.

**Parameters:**
```json
{
  "event": "fileCreated",
  "triggerOn": "specificFolder",
  "folderToWatch": "1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb",
  "options": { "fileType": "all" },
  "pollTimes": { "item": [{ "mode": "everyMinute" }] }
}
```

**Given** a new file `report.pdf` was uploaded into that folder between two poll ticks.

**Expect** the next poll firing emits output[0] with exactly one item, and that item's `json.id` and `json.name` equal the new file's Drive id and `report.pdf`. A second consecutive poll with no further changes **expects** zero items (no re-emission of the already-seen file).

### Test: multiple changes in one interval

**Given** the same parameters and three files uploaded into the folder within a single poll interval.

**Expect** the next poll firing emits three items on output[0], one per changed file (the trigger fires once but carries multiple items), each with its own id/name.

### Test: file-type filter

**Parameters:** same as the file-created test but with `"options": { "fileType": "application/vnd.google-apps.audio" }`.

**Given** an audio file and a plain text file both newly uploaded to the watched folder.

**Expect** output[0] contains only the audio file item.

### Test: file updated vs file deleted

**Parameters:** `"event": "fileUpdated"` (same scope/schedule as above), with `"event": "fileDeleted"` used as the second fixture.

**Given** a file already present in the folder is edited; **expect** output[0] carries one item for that file on the next poll. **Given** (second fixture) a file is deleted from the folder; **expect** the `fileDeleted` configuration emits one item for the deleted file.

### Test: manual execution with no match

**Parameters:** `"event": "fileCreated"` watching a folder that contains no matching event history.

**Given** a manual run (not a published activation) with no prior file-creation matching the criteria.

**Expect** the run throws an error describing that no matching event was found, rather than emitting an empty item set.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, category, node version | documented | Corpus package metadata (`n8n-nodes-base.googleDriveTrigger`, v1.0, Data & Storage) and public docs |
| Polling model and default interval | documented | Docs: polls at a set interval, once every minute by default |
| Manual execution behavior | documented | Docs: returns last matching event; throws when nothing matches |
| Multi-item firing | documented | Common-issues page: one trigger firing may contain multiple items |
| Credential type and scope | documented | Google credentials page lists OAuth2 (single-service) + Service Account as compatible; 401 guidance on API enablement |
| `event` option values | inferred | `fileCreated` / `fileUpdated` observed in public template JSON; create/update/delete for files and folders is the documented "Watch For" concept; full enum not enumerated in public docs |
| `triggerOn` specific-folder scope | documented | Public template JSONs use `triggerOn: "specificFolder"` + `folderToWatch` (folder id); whether a Drive-wide mode exists is inferred |
| `options.fileType` MIME filter | inferred | Observed in public template JSON (`all`, audio mime); semantics inferred from the value shape |
| Output shape | inferred | Templates reference Drive file metadata (`id`, `name`, `originalFilename`, lastModifyingUser); exact key set is the Drive file resource surface, not hard-coded here |
| Poll-schedule shape (`pollTimes.item[].mode`) | inferred | Observed in public template JSON (`everyMinute`); reused standard n8n schedule semantics |
| Drive API surface (changes feed + metadata) | inferred | Consistent with the documented "polls for changes" behavior and Drive API changes guidance |
| Cursor / deduplication mechanism | inferred | Docs guarantee no re-emission of handled events only implicitly; cross-cycle state tracking is a clean-room abstraction |
| Manual vs published mode signal | documented | OpenFlow's `IWorkflow.active` (reached as `ctx.getWorkflow().active`) is the mode signal: `active === false` selects the manual/single-shot branch, `active === true` the published poll branch. `ctx.getCustomData('triggerMode') === 'manual'` is the fallback when the host sets it |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/google-drive-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Polling trigger. The executor must schedule polls from `pollTimes` (default once per minute), authenticate with the `googleDriveOAuth2Api` Google credential, query the Google Drive API for changes since the last successful poll, filter those changes by `event`, `triggerOn`/`folderToWatch`, and `options.fileType`, emit one item per matching changed resource with the Drive file metadata (id and name guaranteed), and persist the poll cursor between cycles so events are not re-emitted. Manual (single-shot) execution must return the most recent matching event or throw when none exists. Requires a Google Drive API client and access to the credential scopes.
- **Partial:** The published poll path is fully covered by this spec. The manual/single-shot branch (return last matching event or throw when none) is behaviorally specified but depends on the runtime honoring a mode signal; the chosen signal is `ctx.getWorkflow().active === false` for manual, with `ctx.getCustomData('triggerMode') === 'manual'` as the host-set alternative.
