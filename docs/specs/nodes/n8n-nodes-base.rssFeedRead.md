---
type: n8n-nodes-base.rssFeedRead
displayName: RSS Read
category: Core Nodes
versions: [1, 1.1, 1.2]
priority: high
status: specced
---

# RSS Read

Read entries from a public RSS or Atom feed URL and emit one workflow item
per feed entry.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedread.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedreadtrigger.md | Public docs only (related trigger sibling) |
| https://n8n.io/integrations/rss-read | Public template gallery |
| Public workflow JSON (template gallery API exports using `n8n-nodes-base.rssFeedRead`) | Public workflow JSON |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, `dist/types/nodes.json` → `rssFeedRead`; `dist/node-definitions/nodes/n8n-nodes-base/rssFeedRead/v1.ts` / `v11.ts` / `v12.ts` + schemas) | Public descriptor metadata — parameter names, defaults, versions only |

## Wire format

- **Type string:** `n8n-nodes-base.rssFeedRead`
- **Aliases:** (none)
- **Display name / defaults.name:** `RSS Read` (**descriptor**)
- **Inputs:** `main` × 1 (**descriptor**)
- **Outputs:** `main` × 1 (**descriptor**)
- **Credentials:** (none)
- **Node versions:** `1`, `1.1`, `1.2` (**descriptor**)
- **Group:** `input` (**descriptor**)
- **Codex categories:** Core Nodes (**descriptor**)
- **AI tool:** `usableAsTool: true` — may be attached to an AI agent (**descriptor**)
- **Default color:** `#b02020` (**descriptor**)
- **Icon:** `fa:rss`, color `orange-red` (**descriptor**)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| url | string | `""` | yes | — | URL of the RSS/Atom feed (**documented**; wire name + default **descriptor**). Accepts expressions (**public workflow JSON**). |
| options | collection | `{}` | no | — | Optional collection; UI placeholder “Add option” (**descriptor**) |
| options.customFields | string | `""` | no | options | Comma-separated list of extra feed fields to include in each output item. Descriptor example: `"author, contentSnippet"` (**descriptor**; not listed on the short public docs page — **descriptor** only). |
| options.ignoreSSL | boolean | `false` | no | options | Ignore SSL/TLS certificate verification when fetching the feed (**documented** as “Ignore SSL Issues”; wire name `ignoreSSL` **descriptor**). |

### Version differences

- Parameter surface is **identical** across `1`, `1.1`, and `1.2` in the
  published descriptor interfaces and Zod schemas (**descriptor**).
- Public templates use `typeVersion` **1.1** and **1.2** with the same
  `url` + `options` shape (**public workflow JSON**).
- No version-gated `displayOptions` or extra parameters appear in the
  descriptor (**descriptor**). Implementers should accept all three versions
  with the same runtime contract unless a future public release documents a
  break.

## Runtime behavior

### Input

- The node is a normal action node (not a trigger). It consumes items on
  `main` input 0.
- **Per input item:** resolve `url` (and options) for that item, fetch the
  feed once, and expand feed entries into output items for that input item
  (**inferred** standard item loop; public templates often pass a different
  feed URL per upstream item via expressions such as
  `={{ $json.rss }}`).
- When the node runs with **no upstream items** (e.g. first node after a
  manual trigger that still supplies one empty item), treat it as a single
  execution against the configured static `url` (**inferred** / standard).
- `url` must be a non-empty HTTP(S) feed URL after expression evaluation
  (**documented** required field; empty-string default is invalid at run time
  — **inferred**).

### Fetch

- Perform an HTTP GET of the resolved feed URL.
- Parse the response body as **RSS 2.0** and/or **Atom** XML (and common
  RSS variants served as XML). The public docs only say “read data from RSS
  feeds”; format coverage is **inferred** from the product name and public
  feed URLs used in templates (RSS and Atom `.xml` / `/feed` endpoints).
- When `options.ignoreSSL` is `true`, TLS certificate errors must not fail
  the request solely due to untrusted/invalid certs (**documented**).
- When `options.ignoreSSL` is `false` (default), standard TLS verification
  applies (**documented**).
- No authentication parameters or credentials are defined on this node
  (**descriptor**). Feeds that require auth are out of band (use HTTP
  Request or a gateway) unless a future public version adds credentials.

### Output

- Emit **one output item per feed entry** on `main` output 0
  (**inferred** from public templates that iterate “each article” and from
  the node purpose).
- Each output item’s `json` is a flat object of entry fields. Fields commonly
  present on public feeds and referenced in public workflow JSON include:

  | Field | Notes |
  |-------|-------|
  | `title` | Entry title (**public workflow JSON**) |
  | `link` | Canonical entry URL (**public workflow JSON**) |
  | `content` | Full HTML/text body when present (**public workflow JSON**) |
  | `contentSnippet` | Plain-text summary/snippet (**public workflow JSON**; also named in `customFields` example) |
  | `pubDate` | Publisher date string when present (**public workflow JSON**) |
  | `isoDate` | ISO-8601 form of the entry date when available (**public workflow JSON**) |
  | `creator` / `author` | Author byline when present (**inferred**; `author` appears in descriptor `customFields` example) |
  | `guid` / `id` | Stable entry id when present (**inferred** from common feed shapes) |

  Exact default field set is **not fully documented** on the public page.
  OpenFlow should expose the usual entry identity/content/date fields above
  when the feed provides them, and omit missing keys rather than inventing
  values (**inferred**).

- **`options.customFields`:** split on commas, trim whitespace, and for each
  requested name copy that property from the parsed entry onto the output
  item when present. Descriptor example values (`author`, `contentSnippet`)
  imply these may be optional extras or parser-specific keys beyond the
  default projection (**descriptor**). Empty `customFields` adds nothing.
- Feed-level metadata (channel title, site link) is **not** required on every
  item unless a custom field requests it (**inferred**).
- Empty feed (valid document, zero entries) → **empty** output array for that
  input item (no throw) (**inferred**).
- Binary data is not produced (**inferred**).

### Multi-item expansion

When one input item yields N feed entries, the node returns N items on
output[0] for that execution path. Downstream nodes see N items
(**inferred**). Order should preserve feed document order
(**inferred**).

### Errors

- Missing/blank `url` after evaluation → fail the item/node (**inferred**).
- Network failure, DNS failure, timeout, or non-success HTTP status → fail
  (**inferred** standard HTTP client behavior).
- Response body that is not a parseable feed → fail (**inferred**).
- TLS failure when `ignoreSSL` is false → fail (**documented** inverse of
  ignore option).
- `continueOnFail`: failed input item yields an error item
  `{ json: { error: <message> } }` (or engine-standard error shape) and
  execution continues (**inferred** standard). Successful sibling input items
  still emit their feed entries.

### Expressions

- `url`, `options.customFields`, and `options.ignoreSSL` accept expression
  strings where the UI allows expressions (**descriptor**:
  `string | Expression<…>` / `boolean | Expression<boolean>`).
- Public templates commonly set `url` to `={{ $json.… }}` so each upstream
  row can target a different feed (**public workflow JSON**).

## Acceptance tests

### Test: static URL returns one item per entry

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "url": "https://example.com/feed.xml",
  "options": {}
}
```

**Mock feed** (2 items) with titles `"A"` and `"B"`, links
`https://example.com/a` and `https://example.com/b`.

**Expect** output[0] length `2`; items include at least:

```json
[
  { "json": { "title": "A", "link": "https://example.com/a" } },
  { "json": { "title": "B", "link": "https://example.com/b" } }
]
```

(Additional fields such as `content` / `isoDate` may be present when the
fixture provides them.)

### Test: per-item URL expression

**Given** input items:

```json
[
  { "json": { "rss": "https://example.com/feed-a.xml" } },
  { "json": { "rss": "https://example.com/feed-b.xml" } }
]
```

**Parameters:**

```json
{
  "url": "={{ $json.rss }}",
  "options": { "ignoreSSL": false }
}
```

**Mock:** feed-a has 1 entry, feed-b has 2 entries.

**Expect** output[0] length `3` (1 + 2), each entry fetched from the
corresponding URL (**public workflow JSON** pattern).

### Test: ignoreSSL option wire shape

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "url": "https://self-signed.example/feed.xml",
  "options": { "ignoreSSL": true }
}
```

**Expect** fetch proceeds without failing solely on TLS certificate
validation (**documented**). With `ignoreSSL: false` against the same
endpoint, expect failure when the cert is untrusted (**documented**).

### Test: customFields includes extra keys

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "url": "https://example.com/feed.xml",
  "options": {
    "customFields": "author, contentSnippet"
  }
}
```

**Mock entry** with `author: "Ada"`, `contentSnippet: "Hello"`, `title: "T"`.

**Expect** output item json includes `author` and `contentSnippet` (and
usual defaults such as `title`) (**descriptor** example).

### Test: empty feed

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "url": "https://example.com/empty-feed.xml",
  "options": {}
}
```

**Mock:** well-formed feed with zero entries.

**Expect** output[0] is `[]` (no throw) (**inferred**).

### Test: invalid URL / fetch failure with continueOnFail

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "url": "https://invalid.invalid/no-feed",
  "options": {}
}
```

**Node settings:** `continueOnFail: true`

**Expect** no hard workflow abort; output contains an error item
(engine-standard `{ json: { error: ... } }` shape) (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| `url` + Ignore SSL Issues | documented | Public docs page is short |
| Wire names `options.ignoreSSL`, `options.customFields` | descriptor | Docs label only “Ignore SSL Issues”; custom fields not on docs page |
| Versions 1 / 1.1 / 1.2 | descriptor | Same params in published interfaces |
| `usableAsTool` | descriptor | Not on docs page |
| One item per feed entry | inferred | Consistent with templates and node purpose |
| Default output field set (`title`, `link`, `content`, …) | inferred | From public workflow field references + common feed shapes; not enumerated in docs |
| `customFields` split/trim semantics | inferred | Comma-separated list per descriptor description |
| Empty feed → empty output | inferred | Reasonable default |
| Timeout / User-Agent / redirect policy | inferred | Not documented — use engine HTTP defaults |
| Atom vs RSS field normalization | inferred | Map common Atom tags onto the same json keys when possible |
| Auth-protected feeds | documented absence | No credentials on node |
| Version behavioral deltas | inferred none | Descriptor params identical |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/rss-feed-read.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **HTTP:** use OpenFlow’s shared HTTP helper (respect `ignoreSSL` /
  unauthorized certs flag). Do **not** load third-party node packages.
- **Parsing:** any RSS/Atom library is fine if the output field contract
  above is honored; prefer a maintained parser over hand-rolled XML.
