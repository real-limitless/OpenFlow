---
type: n8n-nodes-base.rssFeedReadTool
displayName: RSS Feed Read
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# RSS Feed Read (AI Tool)

A tool variant of the RSS Read node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate the feed URL using the `$fromAI()` function or the "let model fill" toggle. Fetches and parses RSS/Atom feeds from the public internet.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedread/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.rssFeedReadTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none — fetches public RSS feeds)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| url | string | — | true | URL of the RSS or Atom feed to fetch |

### Options

| key path | type | default | notes |
|----------|------|---------|-------|
| options.ignoreSSLIssues | boolean | false | Skip SSL/TLS certificate validation |

### Tool-only behavior

When used as an AI agent tool, the `url` parameter supports `$fromAI()` expressions for dynamic population by the LLM. No additional tool-optimization response options are exposed — the full parsed feed data is returned to the agent.

## Runtime behavior

### Input

Consumes one item from the `main` input. The `url` parameter may reference expression values from the input item's `json` data.

### Output

Produces one output item containing a JSON representation of the parsed RSS/Atom feed. The output structure follows standard RSS/Atom field conventions:

- `title` — feed-level title
- `description` or `subtitle` — feed-level description
- `link` — feed-level link
- `items` — array of feed entries, each containing common RSS fields such as `title`, `link`, `description` or `content`, `pubDate` or `updated`, `creator` or `author`, `categories`, `guid`, `enclosure` (if present with url/type/length)

The exact field names and presence depend on the source feed. The node normalizes common RSS 2.0, Atom, and RDF formats into a consistent JSON shape. Each input item produces exactly one output item containing the entire feed result.

### Errors

If the URL is unreachable, the feed is malformed, or the response is not valid XML/RSS/Atom, the node throws an error (workflow stops or `continueOnFail` path is taken). SSL errors are thrown unless `ignoreSSLIssues` is enabled. Timeout errors occur if the server does not respond within the default HTTP timeout.

### Expressions

The `url` parameter accepts n8n expression strings. All option values also accept expressions.

## Acceptance tests

### Test: fetch a known RSS feed

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "url": "https://example.com/feed.xml"
}
```

**Expect** output[0] to contain:
```json
[{
  "json": {
    "title": "Example Feed",
    "description": "An example RSS feed",
    "link": "https://example.com",
    "items": [
      {
        "title": "First Post",
        "link": "https://example.com/first-post",
        "description": "This is the first post.",
        "pubDate": "Mon, 01 Jan 2024 00:00:00 GMT"
      }
    ]
  }
}]
```

The exact field names and values depend on the feed content; the test verifies the presence of `title`, `items` (non-empty array), and at least one entry with a `title` and `link`.

### Test: feed with SSL issues allowed

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "url": "https://self-signed.badssl.com/feed.xml",
  "options": {
    "ignoreSSLIssues": true
  }
}
```

**Expect** output[0] to contain items (errors from SSL are suppressed).

### Test: unreachable URL throws

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "url": "https://nonexistent.invalid/feed.xml"
}
```

**Expect** the node to throw an error (no output items produced).

### Test: URL from input expression

**Given** input items:
```json
[{ "json": { "feedUrl": "https://example.com/feed.xml" } }]
```

**Parameters:**
```json
{
  "url": "={{ $json.feedUrl }}"
}
```

**Expect** output[0] to contain parsed feed items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Required URL parameter | documented | Confirmed in public docs |
| Ignore SSL Issues option | documented | Confirmed in public docs |
| Output shape (RSS fields) | inferred | Based on standard RSS/Atom format expectations; exact field normalization is internal to the node |
| Tool-specific $fromAI() support | documented | Common pattern across all n8n tool nodes, confirmed in public tool docs |
| No credentials needed | documented | Public feeds require no authentication per docs |
| Error behavior (malformed feed) | inferred | Standard node error handling consistent with n8n conventions |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/rssFeedReadTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only