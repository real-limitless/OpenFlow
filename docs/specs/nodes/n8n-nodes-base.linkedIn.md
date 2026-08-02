---
type: n8n-nodes-base.linkedIn
displayName: LinkedIn
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# LinkedIn

Publishes posts to LinkedIn, either as an individual member or on behalf of an
organization page.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.linkedin.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/linkedin.md | Public docs only |
| https://learn.microsoft.com/en-us/linkedin/ | Public docs only (third-party service docs) |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata (type string + resource/operation list only) |

## Wire format

- **Type string:** `n8n-nodes-base.linkedIn`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** one of `linkedInOAuth2Api` (Standard) or
  `linkedInCommunityManagementOAuth2Api` (Community Management), selected by the
  `authentication` parameter.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | fixed (Standard / Community Management) | Standard | yes | | Picks the credential variant. Community Management targets the modern LinkedIn Community Management API (version 202404). |
| postAs | fixed (Person / Organization) | Person | yes | | Whether the post is published on behalf of a member profile or a company page. |
| person | string | — | conditional | shown when postAs=Person | Member identifier of the author (resolvable to `urn:li:person:<id>`). |
| organization | string | — | conditional | shown when postAs=Organization | Organization identifier; the numeric page id is entered directly (e.g. `03262013`, not a full `urn:li:company:` prefix). |
| text | string | — | yes | | The primary post content. |
| mediaCategory | fixed (None / Article / Image) | None | yes | | Declares whether the post carries an article URL or an image; None means text-only. |
| binaryPropertyName | string | data | conditional | shown when mediaCategory=Image | Name of the input binary property holding the image to attach. |
| additionalFields.description | string | — | no | | Short description accompanying an article or image post. |

All string parameters accept expressions. Because the node can be used as an AI
agent tool, most parameters may also be populated dynamically by the calling
agent (see `$fromAI()` usage in n8n docs).

## Runtime behavior

### Input

Each input item is processed independently. Values are rendered per item; an
empty input produces empty output.

### Output

One output item per input item on the single `main` output. `json` contains the
API response for the created post — at minimum the assigned post/share
identifier (`id` or `activity` URN), with the full server response preserved so
downstream nodes can reference it.

### Errors

- HTTP failures (4xx/5xx) from the LinkedIn API surface as node errors.
- Missing or unresolvable author identifier throws before any network call.
- `continueOnFail` yields an item carrying the error instead of halting the run.
- Image posts that reference a missing binary property fail with a clear error.

### Expressions

All string parameters (`person`, `organization`, `text`,
`additionalFields.description`, `binaryPropertyName`) accept expressions.

## Acceptance tests

### Test: text-only post as a person

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "postAs": "Person",
  "person": "urn:li:person:abcdefg",
  "text": "Hello from OpenFlow",
  "mediaCategory": "None"
}
```

**Expect** output[0] `json` contains the created post identifier from the
LinkedIn posts API response (`id` field), and the API was called with the
author set to the person's URN and the given text.

### Test: post as an organization page

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "postAs": "Organization",
  "organization": "03262013",
  "text": "Company announcement",
  "mediaCategory": "None"
}
```

**Expect** the author URN in the request is derived as
`urn:li:organization:03262013` and output[0] `json` contains the created post
identifier.

### Test: post with an image

**Given** input items:

```json
[{
  "json": {},
  "binary": {
    "photo": { "data": "base64-encoded-image", "mimeType": "image/png", "fileName": "banner.png" }
  }
}]
```

**Parameters:**

```json
{
  "postAs": "Person",
  "person": "urn:li:person:abcdefg",
  "text": "Check out this image",
  "mediaCategory": "Image",
  "binaryPropertyName": "photo"
}
```

**Expect** the binary data is uploaded/registered with the media API and the
post request references the registered media asset; output[0] `json` contains
the created post identifier.

### Test: post with an article URL

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "postAs": "Person",
  "person": "urn:li:person:abcdefg",
  "text": "Read this",
  "mediaCategory": "Article",
  "additionalFields": { "description": "Summary of the article" }
}
```

**Expect** the post request carries an article media object with a URL and the
optional description; output[0] `json` contains the created post identifier.

### Test: continueOnFail produces error item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "continueOnFail": true,
  "postAs": "Person",
  "person": "urn:li:person:unknown",
  "text": "This will fail",
  "mediaCategory": "None"
}
```

**Expect** output[0] contains a single item whose `json` carries the API error
rather than halting the workflow.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Single resource (Post) and single operation (Create) | documented | Public docs list exactly Post → Create. |
| Two authentication modes | documented | Credentials docs describe Standard OAuth2 vs Community Management OAuth2; node descriptor confirms both. |
| Post As Person / Organization | documented | Public docs describe both targets and the organization URN entry format. |
| Text + Media Category (None/Article/Image) | documented | Public docs describe text content and media categories for images and article URLs. |
| Community Management API version 202404 | documented | Stated on the credentials page. |
| Image binary upload mechanics | inferred | Binary input property needed for image posts; exact media registration flow derived from service API conventions, not node docs. |
| Additional fields (description) | partially documented | Description accompanying media posts is a service-level concept; node-level support inferred from descriptor metadata at a high level. |
| Exact response body shape | inferred | Docs do not fix the response shape; spec only requires a post identifier plus passthrough of the server response. |
| Person identifier resolution | inferred | Docs show a picker; spec requires a URN-resolvable identifier at the outcome level. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/linkedin.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
