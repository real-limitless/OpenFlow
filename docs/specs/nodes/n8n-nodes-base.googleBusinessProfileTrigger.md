---
type: n8n-nodes-base.googleBusinessProfileTrigger
displayName: Google Business Profile Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Google Business Profile Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlebusinessprofiletrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlebusinessprofile.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://developers.google.com/my-business/reference/rest | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleBusinessProfileTrigger`
- **Aliases:** `Google My Business`, `GMB`, `My Business`
- **Inputs:** `main` × 0 (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `googleBusinessProfileOAuth2Api` (Google OAuth2 with mybusiness API scopes) or shared `googleApi` (generic Google OAuth2/Service Account)
- **Category:** Communication
- **Node version:** 1.0
- **Codex version:** 1.0

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | string (multi-select, fixed) | `reviewAdded` | yes | — | Only supported event: new review created on a Business Profile location. Future events may be added. |
| accountId | string (resource-locator) | — | yes | — | Google My Business account ID. Typically loaded dynamically from the accounts.list endpoint. |
| locationId | string (resource-locator) | — | yes | — | Business location ID under the selected account. Typically loaded dynamically from accounts.locations.list. |

### Parameter details

- **events:** A picklist of Business Profile event types that trigger the workflow. Currently the only documented event is `reviewAdded`, which fires when a new customer review is posted.
- **accountId / locationId:** Resource locators that resolve to Google My Business account and location resource names (format `accounts/{accountId}` and `accounts/{accountId}/locations/{locationId}`). The node loads the available accounts and their locations from the Google My Business API v4.

## Runtime behavior

### Activation

On workflow activation the node does not register a persistent webhook. Instead, it polls the Google My Business API for new reviews at each execution. The node is a polling trigger.

### Polling mechanism

At each polling cycle the node queries `GET https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews` for the specified location. It compares returned review IDs against previously-seen IDs (tracked via the account-level notification cursor or pagination offset across polls). Reviews whose `createTime` is newer than the last poll time are emitted as new items.

### Output

Each firing emits one output item per new review. The item `json` contains the raw review object from the Google My Business Reviews API:

```json
{
  "name": "accounts/{accountId}/locations/{locationId}/reviews/{reviewId}",
  "reviewId": "string",
  "reviewer": {
    "displayName": "string",
    "profilePhotoUrl": "string"
  },
  "starRating": "FIVE",
  "comment": "string",
  "createTime": "string (RFC 3339)",
  "updateTime": "string (RFC 3339)",
  "reviewReply": {
    "comment": "string",
    "updateTime": "string (RFC 3339)"
  }
}
```

- `starRating` is an enum string: `ONE`, `TWO`, `THREE`, `FOUR`, `FIVE` (or `STAR_RATING_UNSPECIFIED`).
- `reviewReply` is present only if the business has already published a reply.
- A single poll cycle may produce zero to many items (one per new review).

### Errors

- API authentication failures (expired token, missing scopes) throw a `NodeOperationError`.
- Network errors or rate-limiting (HTTP 429) from the Google My Business API should be surfaced as `NodeOperationError` with the upstream error detail.
- `continueOnFail` behavior follows the standard trigger-node pattern: on error, the node logs the failure and either retries or stops polling depending on the error type.

### Expressions

The `accountId` and `locationId` parameters accept expression strings. The `events` parameter is a fixed picklist and does not support expressions.

## Acceptance tests

### Test: emits item when a new review is detected

**Given** the node is configured with a valid accountId and locationId, and the polling mechanism has a stored cursor pointing to known reviews.

**When** a new review with `createTime` later than the cursor appears in the API response.

**Then** the node emits one output item whose `json.reviewId` matches the new review's ID and `json.starRating` is one of the known enum values.

### Test: emits zero items when no new reviews

**Given** the same setup, but the API returns only reviews whose IDs are already in the seen set.

**Then** the node emits an empty array (no firing).

### Test: account and location context are required

**Given** the node is activated without setting accountId or locationId.

**Then** the node throws a validation error during parameter resolution before making any API call.

### Test: emitted item includes all standard review fields

**Given** a new review exists with the full response shape.

**Then** the emitted `json` object contains all expected fields: `name`, `reviewId`, `reviewer` (with `displayName` and `profilePhotoUrl`), `starRating`, `comment`, `createTime`, `updateTime`, and optionally `reviewReply`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event types | documented | Public docs state only "Review Added" event. The node may support additional events (e.g. new question, new media) but these are not documented. |
| Polling interval | inferred | Standard n8n polling trigger pattern; exact interval defaults are not documented for this specific node. |
| Account/location selection UI | inferred | Resource-locator pattern with dynamic loading is standard for Google Business Profile nodes in n8n. |
| Polling cursor / dedup | inferred | Review-based polling triggers typically track seen review IDs or timestamps internally; exact implementation detail is not documented. |
| Credential scope | inferred | Requires OAuth2 scopes for `mybusiness` API. No dedicated credential page exists; reuses the shared Google OAuth2 credential infrastructure. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleBusinessProfileTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
