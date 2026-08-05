---
type: n8n-nodes-base.linkedInTool
displayName: LinkedIn Tool
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# LinkedIn Tool

AI agent tool variant of the LinkedIn node. Wraps a single Post → Create
operation so that an AI agent can publish posts to LinkedIn on behalf of a
person or an organization page. All relevant parameters may be populated
dynamically by the calling agent via `$fromAI()`.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.linkedin.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/linkedin.md | Public docs only |
| https://learn.microsoft.com/en-us/linkedin/ | Public docs only (third-party service docs) |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.linkedInTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (also receives `ai_tool` when connected to an AI Agent root node)
- **Outputs:** `main` × 1
- **Credentials:** either `linkedInOAuth2Api` (Standard OAuth2) or
  `linkedInCommunityManagementOAuth2Api` (Community Management OAuth2), selected
  by the `authentication` parameter. Community Management targets the modern
  LinkedIn Community Management API version 202404.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | fixed (Standard / Community Management) | Standard | yes | | Picks the credential variant. |
| postAs | fixed (Person / Organization) | Person | yes | | Whether the post is on behalf of a member profile or a company page. |
| person | string | — | conditional | shown when postAs=Person | Member identifier resolvable to `urn:li:person:<id>`. |
| organization | string | — | conditional | shown when postAs=Organization | Organization numeric page ID (e.g. `03262013`, not the full URN prefix). |
| text | string | — | yes | | The post contents. |
| mediaCategory | fixed (None / Article / Image) | None | yes | | Declares whether the post includes an article URL or an image; None means text-only. |
| binaryPropertyName | string | data | conditional | shown when mediaCategory=Image | Name of the input binary property holding the image to attach. |
| additionalFields.description | string | — | no | | Short description for article or image posts. |

All string parameters accept expressions and, when the node is connected as an
AI agent tool, may be populated dynamically by the agent using `$fromAI()`.

## Runtime behavior

### Input

Each input item is processed independently. When used as an AI tool, the agent
may supply only one effective item after resolving `$fromAI()` expressions.
Empty input produces empty output.

### Output

One output item per input item on the single `main` output. `json` contains the
API response for the created post — at minimum the assigned post/share
identifier (`id` or `activity` URN), with the full server response preserved.

### Errors

- HTTP failures (4xx/5xx) from the LinkedIn API surface as node errors.
- Missing or unresolvable author identifier throws before any network call.
- `continueOnFail` yields an item carrying the error instead of halting.
- Image posts referencing a missing binary property fail with a clear error.

### Expressions

All string parameters (`person`, `organization`, `text`,
`additionalFields.description`, `binaryPropertyName`) accept expressions.

## Acceptance tests

### Test: text-only post as a person (tool mode)

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

### Test: post as an organization

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
| Single resource and operation | documented | Post → Create, same as the base LinkedIn node. |
| Tool-mode parameter population | documented | Public docs describe `$fromAI()` mechanism for tools. |
| Credential types | documented | Two OAuth2 variants per credentials page. |
| Post As Person / Organization | documented | Same parameter set as the base LinkedIn node. |
| Media categories | documented | None / Article / Image per public docs. |
| Image upload mechanics | inferred | Binary property upload; exact media registration flow derived from service API conventions. |
| Exact response body shape | inferred | Docs do not fix the response shape; spec only requires a post identifier plus passthrough. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/linkedinTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
