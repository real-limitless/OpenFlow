---
type: n8n-nodes-base.rssFeedReadTrigger
displayName: RSS Feed Trigger
category: Trigger
versions: [1]
priority: medium
status: specced
---

# RSS Feed Trigger

Polling trigger that starts a workflow whenever a new item appears in an RSS feed. On each poll the node fetches the configured feed, compares against the entries already seen, and emits one output item per newly published entry.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedreadtrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedread.md | Public docs only (related action node) |

## Wire format

- **Type string:** `n8n-nodes-base.rssFeedReadTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** (none — public RSS/Atom feeds require no authentication)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| feedUrl | string | — | yes | — | URL of the RSS feed to poll. Accepts an expression. |
| poll schedule | collection | — | yes | — | Schedule configuration; the selected mode adds/removes the timing fields below |
| schedule.mode | options | `everyDay` | yes | — | One of: `everyHour`, `everyDay`, `everyWeek`, `everyMonth`, `everyX`, `custom` |
| schedule.minute | number | — | no | all modes except `custom`/`everyX` | Minute of the hour to poll, `0`–`59` |
| schedule.hour | number | — | no | `everyDay`/`everyWeek`/`everyMonth` | Hour of the day to poll (24-hour), `0`–`23` |
| schedule.weekday | options | — | no | `everyWeek` | Weekday of the week to poll |
| schedule.dayOfMonth | number | — | no | `everyMonth` | Day of the month to poll, `1`–`31` |
| schedule.value | number | — | no | `everyX` | Every N minutes or hours |
| schedule.unit | options | — | no | `everyX` | Unit for `value`: `minutes` or `hours` |
| schedule.cronExpression | string | — | no | `custom` | Cron expression; six fields (second, minute, hour, day of month, month, day of week), seconds field optional |

### Poll schedule semantics

The schedule determines how often the node polls the feed URL; it does not depend on feed timing. Mode-specific ranges from public docs:

- **Every Hour:** minute `0`–`59`.
- **Every Day:** hour `0`–`23`, minute `0`–`59`.
- **Every Week:** hour, minute, plus a weekday.
- **Every Month:** hour, minute, plus day of month `1`–`31`.
- **Every X:** a value in `minutes` or `hours`.
- **Custom:** cron expression `30 8 4 * * *` = every day at 04:08:30; `8 4 * * *` = every day at 04:08. Seconds (sixth field) is optional.

## Runtime behavior

### Activation

On workflow activation the node registers the poll schedule. Polls begin according to the configured schedule; the feed is fetched over HTTP(S) each time.

### First poll vs subsequent polls (deduplication contract)

The trigger must distinguish "already seen" entries from new ones so a single workflow run fires only for genuinely new items:

- **First poll after activation:** emit every entry currently in the feed once (baseline), so the workflow sees the current state.
- **Subsequent polls:** emit only entries whose identity key (`guid`; when absent, the `link`; when both absent, the `title`+`pubDate`) was not seen in any earlier poll.
- **Unchanged feed between polls:** emit nothing (empty result).

Seen-entry keys must be persisted across polls for the lifetime of the active trigger (per trigger instance), and written only after the poll's items have been emitted so that a failed emission does not mark entries as seen.

### Output

Each newly detected feed entry is emitted as one output item. The item carries the parsed entry fields normalized from the source feed format, including conventional fields such as `title`, `link`, `description`/`content`, `pubDate`/`updated`, `creator`/`author`, `categories`, `guid`, and `enclosure` (when present). Exact field names and presence depend on the source feed.

### Errors

- A missing or empty `feedUrl` must throw (required parameter).
- If a poll fails (unreachable URL, HTTP error, invalid/ill-formed XML), the poll throws; with default settings the error follows the workflow's error handling (`continueOnFail` or stop). Unreachable or malformed feeds should surface as errors rather than silently producing no items.

### Expressions

`feedUrl` accepts n8n expression strings (e.g. sourced from workflow static data). Poll schedule fields are fixed configuration and do not typically use expressions.

## Acceptance tests

### Test: first poll emits every current entry

**Given** a feed `https://example.com/feed.xml` whose first fetch returns 3 entries (guids `g1`, `g2`, `g3`).

**Parameters:**
```json
{
  "feedUrl": "https://example.com/feed.xml",
  "schedule": { "mode": "everyX", "value": 5, "unit": "minutes" }
}
```

**Expect** output[0] to contain 3 items, one per entry, each with at least a `title` and `link`:
```json
[
  { "json": { "guid": "g1", "title": "Post 1", "link": "https://example.com/1", "pubDate": "Mon, 01 Jan 2024 00:00:00 GMT" } },
  { "json": { "guid": "g2", "title": "Post 2", "link": "https://example.com/2", "pubDate": "Mon, 02 Jan 2024 00:00:00 GMT" } },
  { "json": { "guid": "g3", "title": "Post 3", "link": "https://example.com/3", "pubDate": "Mon, 03 Jan 2024 00:00:00 GMT" } }
]
```

### Test: unchanged feed on second poll emits nothing

**Given** the same feed as above, fetched a second time with no new entries.

**Expect** the poll to produce an empty output (no items emitted). The previously seen guids `g1`–`g3` must not be re-emitted.

### Test: third poll emits only the genuinely new entry

**Given** the feed now contains `g1`, `g2`, `g3`, and one new entry `g4` (title "Post 4", link `https://example.com/4`).

**Expect** output[0] to contain exactly one item, for `g4`, and none of `g1`–`g3`.

### Test: unreachable or malformed feed throws

**Given** `feedUrl` pointing at a nonexistent host (or an HTTP endpoint returning non-XML).

**Expect** the poll to throw an error (no items emitted) rather than silently succeeding.

### Test: missing feed URL throws

**Given** parameters with `feedUrl` empty or absent.

**Expect** a required-parameter error; the node must not attempt a poll.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Purpose (new item triggers workflow) | documented | Public docs state the trigger starts a workflow when a new item is published |
| Poll schedule modes, mode-specific ranges, cron format (six fields, optional seconds) | documented | Public docs |
| Feed URL parameter | documented | Public docs |
| Output item shape per entry | inferred | Field normalization is internal; expected fields follow standard RSS/Atom conventions |
| First-poll baseline (emit all once) and dedup by guid/link across polls | inferred | Required by "new item" semantics and deterministic two-poll/three-poll behavior; not spelled out in docs |
| Error handling on failed polls and required `feedUrl` | inferred | Consistent with n8n node error-handling conventions |
| Parameter key names (`feedUrl`, `schedule.*`) | inferred | Public docs describe labels; exact wire keys follow n8n naming conventions and should be confirmed by the implementation side |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/rss-feed-read-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
