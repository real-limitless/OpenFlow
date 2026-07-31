---
type: n8n-nodes-base.googleBusinessProfile
displayName: Google Business Profile
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Google Business Profile

Manage a business's Google Business Profile (formerly Google My Business):
publish and maintain **local posts** (standard / event / offer / alert) and
read, list, reply to, and remove replies for **customer reviews** on the
Google My Business v4 API.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlebusinessprofile.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlebusinessprofiletrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts | Third-party service API docs |
| https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create | Third-party service API docs |
| https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews | Third-party service API docs |
| https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply | Third-party service API docs |
| https://developers.google.com/my-business/content/sunset-dates | Third-party service API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.googleBusinessProfile`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleBusinessProfileOAuth2Api` (OAuth2; extends the shared
  single-service Google OAuth2 credential with scope
  `https://www.googleapis.com/auth/business.manage`)

### Target service contract

The node talks to the **Google My Business v4** REST API
(`https://mybusiness.googleapis.com/v4`), JSON in / JSON out:

| Operation | API resource / method | HTTP |
|-----------|------------------------|------|
| Post / Create | `accounts.locations.localPosts.create` | `POST {account/location}/localPosts` |
| Post / Get | `accounts.locations.localPosts.get` | `GET .../localPosts/{postId}` |
| Post / Get Many | `accounts.locations.localPosts.list` | `GET {account/location}/localPosts` |
| Post / Update | `accounts.locations.localPosts.patch` | `PATCH .../localPosts/{postId}` |
| Post / Delete | `accounts.locations.localPosts.delete` | `DELETE .../localPosts/{postId}` |
| Review / Get | `accounts.locations.reviews.get` | `GET .../reviews/{reviewId}` |
| Review / Get Many | `accounts.locations.reviews.list` | `GET {account/location}/reviews` |
| Review / Reply | `accounts.locations.reviews.updateReply` | `PUT .../reviews/{reviewId}/reply` |
| Review / Delete Reply | `accounts.locations.reviews.deleteReply` | `DELETE .../reviews/{reviewId}/reply` |

All write and read paths are scoped to `accounts/{accountId}/locations/{locationId}/...`.
The account and location identifiers are supplied via resource locators.

## Parameters

### Resource & operation

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `post` | yes | — | Options: `post`, `review` |
| operation | options | `create` | yes | per resource | See below |

### Resource locators

Account, location, post, and review are all **resource locators** with two
interchangeable input styles: **From list** (loaded from the API) or **By name**
(an explicit resource-name string). Review additionally accepts **By ID**.

| name | modes | required | used in |
|------|-------|----------|---------|
| account | list / name | yes | all operations |
| location | list / name | yes | all operations |
| post | list / name | yes | Post Delete / Get / Update |
| review | list / id / name | yes | Review Get / Delete Reply / Reply |

Resource-name values are the full API paths, e.g. `accounts/123/locations/456`
for location and `accounts/123/locations/456/localPosts/789` for a post.

### Resource: Post

#### Operation: Create

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| postType | options | `STANDARD` | yes | `resource=post, operation=create` | Options: `STANDARD`, `EVENT`, `OFFER`, `ALERT` |
| summary | string | `''` | yes | `resource=post, operation=create` | Main text of the post |
| title | string | `''` | yes | `…, postType=EVENT` | Event name |
| startDateTime | dateTime | `''` | yes | `…, postType=EVENT` | Event start |
| endDateTime | dateTime | `''` | yes | `…, postType=EVENT` | Event end |
| title | string | `''` | yes | `…, postType=OFFER` | Offer headline (e.g. "20% off") |
| startDate | string | `''` | yes | `…, postType=OFFER` | Offer start date |
| endDate | string | `''` | yes | `…, postType=OFFER` | Offer end date |
| alertType | options | `COVID_19` | yes | `…, postType=ALERT` | Only documented alert subtype |
| options.languageCode | string | `''` | no | `resource=post, operation=create` | Post language |
| options.callToActionType | options | `''` | no | `resource=post, operation=create` | CTA action type (book / order / shop / learn more / sign up / call) |
| options.url | string | `''` | no | `resource=post, operation=create` | URL for the call to action |
| options.couponCode | string | `''` | no | `resource=post, operation=create` | Offer coupon code |
| options.redeemOnlineUrl | string | `''` | no | `resource=post, operation=create` | Online redemption link |
| options.termsConditions | string | `''` | no | `resource=post, operation=create` | Offer terms and conditions |

#### Operation: Get

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| post | resourceLocator | — | yes | `resource=post, operation=get` | Post to retrieve |

#### Operation: Get Many

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | `false` | no | `resource=post, operation=getAll` | Return all or only a limited count |
| limit | number | `20` | no | `…, returnAll=false` | Max results |

#### Operation: Update

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| post | resourceLocator | — | yes | `resource=post, operation=update` | Post to update |
| options.summary | string | `''` | no | `resource=post, operation=update` | Replace post text |
| options.languageCode | string | `''` | no | `…` | Post language |
| options.callToActionType | options | `''` | no | `…` | CTA action type |
| options.url | string | `''` | no | `…` | CTA URL |
| options.startDateTime / endDateTime | dateTime | `''` | no | `…` | Event schedule bounds |
| options.title | string | `''` | no | `…` | Event / offer title |
| options.startDate / endDate | string | `''` | no | `…` | Offer date bounds |
| options.couponCode / redeemOnlineUrl / termsConditions | string | `''` | no | `…` | Offer details |

#### Operation: Delete

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| post | resourceLocator | — | yes | `resource=post, operation=delete` | Post to delete |

### Resource: Review

#### Operation: Get

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| review | resourceLocator | — | yes | `resource=review, operation=get` | Review to retrieve |

#### Operation: Get Many

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | `false` | no | `resource=review, operation=getAll` | Return all or only a limited count |
| limit | number | `20` | yes | `…, returnAll=false` | Max results |

#### Operation: Reply

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| review | resourceLocator | — | yes | `resource=review, operation=reply` | Review to respond to |
| reply | string | `''` | yes | `resource=review, operation=reply` | Reply body, max 4096 bytes; creates the reply if none exists (verified locations only) |

#### Operation: Delete Reply

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| review | resourceLocator | — | yes | `resource=review, operation=delete` | Review whose reply to remove |

### Request options (all operations)

A generic `requestOptions` collection (batching, allow-unauthorized-certificates,
proxy, timeout) applies to the underlying HTTP calls. These are platform-level
transport options and do not alter the API payloads.

## Runtime behavior

### Input

Each input item is processed independently. Parameters resolve per item
(expression-capable) and identify the account/location/resource either
statically or from the item.

### Output

One output item is emitted to `main[0]` per input item.

- **Post / Create:** the created `LocalPost` object (with server-assigned
  `name`, `createTime`, `updateTime`, `state`, `searchUrl`).
- **Post / Get:** the `LocalPost` object.
- **Post / Get Many:** the list of `LocalPost` objects. Honors `returnAll` /
  `limit` and follows the API pagination (`pageSize` / `pageToken`).
- **Post / Update:** the updated `LocalPost` object.
- **Post / Delete:** a single success indicator item.
- **Review / Get:** the `Review` object.
- **Review / Get Many:** the list of `Review` objects, honoring `returnAll` /
  `limit`.
- **Review / Reply:** the resulting `ReviewReply` object (contains `comment`,
  output-only `updateTime`, `reviewReplyState`).
- **Review / Delete Reply:** a single success indicator item.

The `LocalPost` contract includes: `name`, `languageCode`, `summary`,
`callToAction` (`actionType`, `url`), `createTime`, `updateTime`,
`scheduledTime`, `event` (`title`, `schedule`), `state`, `media[]`,
`searchUrl`, `topicType`, and for offer posts `offer` (`couponCode`,
`redeemOnlineUrl`, `termsConditions`). The `Review` contract includes:
`name`, `reviewId`, `reviewer` (`profilePhotoUrl`, `displayName`,
`isAnonymous`), `starRating`, `comment`, `createTime`, `updateTime`,
`reviewReply`, `reviewMediaItems[]`, `reviewReplyUrl`.

### Errors

- HTTP/API errors (e.g. 404 for a missing post/review, 403 for missing scope
  or an unverified location, 400 for invalid post content) are raised as API
  errors. With `continueOnFail`, the node emits an error item on `main[0]`
  instead of failing the run.
- Invalid or missing required parameters (resource, account, location,
  operation-specific fields) are rejected before any API call.

### Expressions

All string / dateTime / number parameters and resource locator values accept
expression strings, so values can be pulled from the incoming item.

## Acceptance tests

### Test: create a standard post

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "post",
  "operation": "create",
  "account": { "mode": "name", "value": "accounts/123" },
  "location": { "mode": "name", "value": "accounts/123/locations/456" },
  "postType": "STANDARD",
  "summary": "Spring cleaning sale this week!"
}
```

**Expect** output[0] to contain a created `LocalPost`:

```json
[{
  "json": {
    "name": "accounts/123/locations/456/localPosts/__any_string__",
    "topicType": "STANDARD",
    "summary": "Spring cleaning sale this week!",
    "state": "__any_string__",
    "createTime": "__any_string__"
  }
}]
```

### Test: create an event post with call-to-action

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "post",
  "operation": "create",
  "account": { "mode": "name", "value": "accounts/123" },
  "location": { "mode": "name", "value": "accounts/123/locations/456" },
  "postType": "EVENT",
  "summary": "Join us for our anniversary party",
  "title": "Anniversary Party",
  "startDateTime": "2026-09-01T18:00:00Z",
  "endDateTime": "2026-09-01T22:00:00Z",
  "options": {
    "callToActionType": "BOOK",
    "url": "https://example.com/reserve"
  }
}
```

**Expect** output[0] to contain a `LocalPost` with the event and CTA populated:

```json
[{
  "json": {
    "topicType": "EVENT",
    "summary": "Join us for our anniversary party",
    "event": {
      "title": "Anniversary Party",
      "schedule": "__any_object__"
    },
    "callToAction": {
      "actionType": "BOOK",
      "url": "https://example.com/reserve"
    }
  }
}]
```

### Test: get a post by resource name

**Given** input items:

```json
[{ "json": { "postName": "accounts/123/locations/456/localPosts/789" } }]
```

**Parameters:**

```json
{
  "resource": "post",
  "operation": "get",
  "account": { "mode": "name", "value": "accounts/123" },
  "location": { "mode": "name", "value": "accounts/123/locations/456" },
  "post": { "mode": "name", "value": "={{ $json.postName }}" }
}
```

**Expect** output[0] to contain the matching `LocalPost` object with that `name`.

### Test: reply to a review

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "review",
  "operation": "reply",
  "account": { "mode": "name", "value": "accounts/123" },
  "location": { "mode": "name", "value": "accounts/123/locations/456" },
  "review": { "mode": "id", "value": "review-abc-123" },
  "reply": "Thank you for your feedback!"
}
```

**Expect** output[0] to contain the resulting `ReviewReply`:

```json
[{
  "json": {
    "comment": "Thank you for your feedback!",
    "reviewReplyState": "__any_string__",
    "updateTime": "__any_string__"
  }
}]
```

### Test: list reviews with a limit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "review",
  "operation": "getAll",
  "account": { "mode": "name", "value": "accounts/123" },
  "location": { "mode": "name", "value": "accounts/123/locations/456" },
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0] to contain a list of up to 5 `Review` objects, each with
`name`, `reviewId`, `starRating`, and `comment`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources / operations | Documented | Post (Create/Delete/Get/Get Many/Update) + Review (Delete Reply/Get/Get Many/Reply) listed on docs.n8n.io |
| Wire operation values | Inferred from descriptor | `getAll` (Get Many), `reply` (Reply), `delete` (Delete Reply) — docs list display names only |
| Wire resource / operation defaults | Inferred from descriptor | `post` / `create` |
| `postType` / `alertType` option values | Documented | Map 1:1 to `LocalPostTopicType` / `AlertType` enums in the Google API; only `COVID_19` is a documented alert subtype |
| Resource locator modes | Inferred from descriptor | `account`/`location`/`post` use list + name; `review` adds id mode |
| Post Update request shape | Inferred | API `patch` updates the specified local post; node exposes editable fields through `options` |
| Get Many response handling | Inferred | Pagination (`pageSize`/`pageToken`) per the Google API; platform-standard list output |
| Delete / Delete Reply output shape | Inferred | Success indicator item; API returns no body |
| Reply 4096-byte limit + verified-location requirement | Documented | Google `ReviewReply` and `updateReply` contract |
| Deprecation of Google My Business v4 API | Documented | `localPosts` / `reviews` v4 methods remain supported; related v4 insight/media methods already sunset (see sunset-dates page) |
| Sibling trigger node | Documented | `googleBusinessProfileTrigger` (polling, `reviewAdded` event) is a separate trigger type, out of scope here |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/google-business-profile.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential:** `googleBusinessProfileOAuth2Api` reusing the shared Google
  OAuth2 single-service flow with scope `https://www.googleapis.com/auth/business.manage`
