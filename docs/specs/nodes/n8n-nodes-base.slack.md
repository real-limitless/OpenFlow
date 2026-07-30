---
type: n8n-nodes-base.slack
displayName: Slack
category: Communication
versions: [1, 2, 2.1, 2.2, 2.3, 2.4]
priority: medium
status: specced
---

# Slack

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.slack/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/slack/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.slack`
- **Aliases:** `human`, `form`, `wait`, `hitl`, `approval`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `slackApi` (accessToken) | `slackOAuth2Api` (oAuth2)
- **Subtitle:** `={{$parameter["operation"] + ": " + $parameter["resource"]}}`

## Parameters

### Global

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | accessToken | yes | — | `accessToken` \| `oAuth2` |
| resource | options | message | yes | — | `channel` \| `file` \| `message` \| `reaction` \| `star` \| `user` \| `userGroup` |

### Resource: Channel

#### Operations

| value | label | description | action |
|-------|-------|-------------|--------|
| archive | Archive | Archives a conversation | Archive a channel |
| close | Close | Closes a DM or MPIM | Close a channel |
| create | Create | Initiates a public or private channel-based conversation | Create a channel |
| get | Get | Get information about a channel | Get a channel |
| getAll | Get Many | Get many channels in a Slack team | Get many channels |
| history | History | Get a conversation's history of messages and events | Get the history of a channel |
| invite | Invite | Invite a user to a channel | Invite a user to a channel |
| join | Join | Joins an existing conversation | Join a channel |
| kick | Kick | Removes a user from a channel | Kick a user from a channel |
| leave | Leave | Leaves a conversation | Leave a channel |
| member | Member | List members of a conversation | Get members of a channel |
| open | Open | Opens or resumes a DM or MPIM | Open a channel |
| rename | Rename | Renames a conversation | Rename a channel |
| replies | Replies | Get a thread of messages posted to a channel | Get a thread of messages posted to a channel |
| setPurpose | Set Purpose | Sets the purpose for a conversation | Set the purpose of a channel |
| setTopic | Set Topic | Sets the topic for a conversation | Set the topic of a channel |
| unarchive | Unarchive | Unarchives a conversation | Unarchive a channel |

#### Fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | resourceLocator | {mode:list,value:""} | yes | resource:channel, operation:archive/close/get/invite/join/kick/leave/member/open/rename/replies/setPurpose/setTopic/unarchive | modes: list (getChannels), id, name, url; extractValue for id/name/url |
| channelId | string | "" | yes | resource:channel, operation:create | Channel name |
| channelVisibility | options | public | yes | resource:channel, operation:create | `public` \| `private` |
| userIds | multiOptions | [] | yes | resource:channel, operation:invite | loadOptions: getUsers |
| userId | options | "" | yes | resource:channel, operation:kick | loadOptions: getUsers |
| options | collection | {} | no | resource:channel, operation:get | includeNumMembers (boolean, default false) |
| returnAll | boolean | false | no | resource:channel, operation:getAll/history/replies/member | — |
| limit | number | 50/100 | no | resource:channel, operation:getAll/history/replies/member, returnAll:false | min:1, max:100 |
| filters | collection | {} | no | resource:channel, operation:getAll/history/replies | excludeArchived (bool), types (multiOptions: public_channel, private_channel, mpim, im), inclusive (bool), latest (dateTime), oldest (dateTime) |
| options | collection | {} | no | resource:channel, operation:open | channelId (string), returnIm (bool), users (multiOptions: getUsers) |
| name | string | "" | yes | resource:channel, operation:rename | New name |
| purpose | string | "" | yes | resource:channel, operation:setPurpose | — |
| topic | string | "" | yes | resource:channel, operation:setTopic | — |
| ts | number | undefined | yes | resource:channel, operation:replies | Message timestamp |
| resolveData | boolean | false | no | resource:channel, operation:member | Resolve user IDs to full user objects |

### Resource: File

#### Operations

| value | label | description | action |
|-------|-------|-------------|--------|
| upload | Upload | Create or upload an existing file | Upload a file |
| get | Get | Get a file | Get a file |
| getAll | Get Many | Get & filter team files | Get many files |

#### Fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| binaryData | boolean | false | no | resource:file, operation:upload, @version:[2,2.1] | Use binary field |
| fileContent | string | "" | no | resource:file, operation:upload, binaryData:false, @version:[2,2.1] | Text content when not binary |
| binaryPropertyName | string | "data" | yes | resource:file, operation:upload, binaryData:true/@version:gte2.2 | Binary property name |
| options | collection | {} | no | resource:file, operation:upload | channelIds (multiOptions: getChannels, v2-v2.1), channelId (options: getChannels, v2.2+), fileName (string), initialComment (string), threadTs (string), title (string) |
| returnAll | boolean | false | no | resource:file, operation:getAll | — |
| limit | number | 50 | no | resource:file, operation:getAll, returnAll:false | min:1, max:100 |
| filters | collection | {} | no | resource:file, operation:getAll | channelId (options: getChannels), showFilesHidden (bool), tsFrom (string), tsTo (string), types (multiOptions: all, gdocs, images, pdfs, snippets, spaces, zips), userId (options: getUsers) |
| fileId | string | "" | yes | resource:file, operation:get | — |

### Resource: Message

#### Operations

| value | label | description | action |
|-------|-------|-------------|--------|
| post | Send | Send a message | Send a message |
| sendAndWait | Send and Wait for Response | Send message and wait for response | Send message and wait for response |
| update | Update | Update a message | Update a message |
| delete | Delete | Delete a message | Delete a message |
| getPermalink | Get Permalink | Get a message's permalink | Get a message permalink |
| search | Search | Search for messages | Search for messages |

#### Fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| select | options | "" | yes | resource:message, operation:post | `channel` \| `user` |
| channelId | resourceLocator | {mode:list,value:""} | yes | resource:message, operation:post, select:channel | modes: list (getChannels), id, name, url; required |
| user | resourceLocator | {mode:list,value:""} | yes | resource:message, operation:post, select:user | modes: list (getUsers), id, username |
| messageType | options | text | no | resource:message, operation:post/update | `text` \| `block` \| `attachment` |
| text | string | "" | yes | resource:message, operation:post/update, messageType:text | Markdown supported |
| blocksUi | string | "" | yes | resource:message, operation:post/update, messageType:block | JSON from Block Kit Builder |
| text | string | "" | no | resource:message, operation:post/update, messageType:block | Fallback notification text |
| attachments | collection[] | {} | no | resource:message, operation:post/update, messageType:attachment | fallback, text, title, title_link, color, pretext, author_name, author_link, author_icon, image_url, thumb_url, footer, footer_icon, ts, fields (fixedCollection) |
| otherOptions | collection | {} | no | resource:message, operation:post/update | includeLinkToWorkflow (bool, default true), botProfile (fixedCollection: profilePhotoType image/emoji, icon_url, icon_emoji), link_names (bool), replyToMessageField (fixedCollection: thread_ts number, reply_broadcast bool), mrkdwn (bool, default true), unfurl_links (bool, default false), unfurl_media (bool, default true), ephemeral (fixedCollection for channel: user resourceLocator + ephemeral bool; bool for user), sendAsUser (string, accessToken only) |
| channelId | resourceLocator | {mode:list,value:""} | yes | resource:message, operation:update/getPermalink | modes: list, id, name, url |
| ts | number | undefined | yes | resource:message, operation:update/delete/getPermalink | Message timestamp |
| updateFields | collection | {} | no | resource:message, operation:update | link_names (bool), parse (options: client, full, none) |
| select | options | "" | yes | resource:message, operation:delete | `channel` \| `user` |
| channelId | resourceLocator | {mode:list,value:""} | yes | resource:message, operation:delete, select:channel | modes: list, id, name, url |
| user | resourceLocator | {mode:list,value:""} | yes | resource:message, operation:delete, select:user | modes: list, id |
| timestamp | number | undefined | yes | resource:message, operation:delete/getPermalink | Message timestamp |
| query | string | "" | yes | resource:message, operation:search | Search query |
| sort | options | desc | no | resource:message, operation:search | `desc` (newest), `asc` (oldest), `relevance` |
| returnAll | boolean | false | no | resource:message, operation:search | — |
| limit | number | 25 | no | resource:message, operation:search, returnAll:false | min:1, max:50 |
| options | collection | {} | no | resource:message, operation:search | searchChannel (multiOptions: getChannelsName) |

### Resource: Reaction

#### Operations

| value | label | description | action |
|-------|-------|-------------|--------|
| add | Add | Adds a reaction to a message | Add a reaction |
| get | Get | Get the reactions of a message | Get a reaction |
| remove | Remove | Remove a reaction of a message | Remove a reaction |

#### Fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | resourceLocator | {mode:list,value:""} | yes | resource:reaction, operation:add/get/remove | modes: list, id, name, url |
| timestamp | number | undefined | yes | resource:reaction, operation:add/get/remove | Message timestamp |
| name | string | "" | yes | resource:reaction, operation:add/remove | Emoji code (e.g., +1) |

### Resource: Star

#### Operations

| value | label | description | action |
|-------|-------|-------------|--------|
| add | Add | Add a star to an item | Add a star |
| delete | Delete | Delete a star from an item | Delete a star |
| getAll | Get Many | Get many stars of authenticated user | Get many stars |

#### Fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| target | options | "" | yes | resource:star, operation:add | `message` \| `file` |
| channelId | resourceLocator | {mode:list,value:""} | yes | resource:star, operation:add, target:message/file | modes: list, id, name, url |
| fileId | string | "" | yes | resource:star, operation:add, target:file | — |
| timestamp | number | undefined | yes | resource:star, operation:add, target:message | — |
| options | collection | {} | no | resource:star, operation:add | fileComment (string) |
| options | collection | {} | no | resource:star, operation:delete | channelId (options: getChannels), fileId (string), fileComment (string), timestamp (number) |
| returnAll | boolean | false | no | resource:star, operation:getAll | — |
| limit | number | 50 | no | resource:star, operation:getAll, returnAll:false | min:1, max:100 |

### Resource: User

#### Operations

| value | label | description | action |
|-------|-------|-------------|--------|
| info | Get | Get information about a user | Get information about a user |
| getAll | Get Many | Get a list of many users | Get many users |
| getProfile | Get User's Profile | Get a user's profile | Get a user's profile |
| getPresence | Get User's Status | Get online status of a user | Get a user's presence status |
| updateProfile | Update User's Profile | Update a user's profile | Update a user's profile |

#### Fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| user | resourceLocator | {mode:list,value:""} | yes | resource:user, operation:info/getProfile/getPresence | modes: list (getUsers), id |
| returnAll | boolean | false | no | resource:user, operation:getAll | — |
| limit | number | 50 | no | resource:user, operation:getAll, returnAll:false | min:1, max:100 |
| options | collection | {} | no | resource:user, operation:updateProfile | customFieldUi (fixedCollection: id (options: getTeamFields), value, alt), email, first_name, last_name, status (fixedCollection: status_emoji, status_expiration (dateTime), status_text), user (string, admin only) |

### Resource: User Group

#### Operations

| value | label | description | action |
|-------|-------|-------------|--------|
| create | Create | Create a user group | Create a user group |
| update | Update | Update a user group | Update a user group |
| updateUsers | Add Users | Add users to a user group | Add users to a user group |
| disable | Disable | Disable a user group | Disable a user group |
| enable | Enable | Enable a user group | Enable a user group |
| getAll | Get Many | Get many user groups | Get many user groups |
| getUsers | Get Users | Get users from a user group | Get users from a user group |

#### Fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| name | string | "" | yes | resource:userGroup, operation:create | Unique name |
| Options | collection | {} | no | resource:userGroup, operation:create | channelIds (multiOptions: getChannels), description (string), handle (string), include_count (bool, default true) |
| userGroupId | string | "" | yes | resource:userGroup, operation:update/disable/enable/getUsers | Encoded ID |
| updateFields | collection | {} | no | resource:userGroup, operation:update | channels (multiOptions: getChannels), description, handle, include_count, name |
| options | collection | {} | no | resource:userGroup, operation:disable/enable | include_count (bool, default true) |
| returnAll | boolean | false | no | resource:userGroup, operation:getAll | — |
| limit | number | 100 | no | resource:userGroup, operation:getAll, returnAll:false | min:1, max:500 |
| options | collection | {} | no | resource:userGroup, operation:getAll | include_count (bool, default true), include_disabled (bool, default true), include_users (bool, default true) |

## Runtime behavior

### Input

Consumes items on `main` input (0-indexed). Each item may contain JSON data and optional binary data. The node processes each input item independently based on the configured resource/operation.

### Output

Produces items on `main` output (0-indexed). Each output item contains the Slack API response JSON in `json` field. For operations returning arrays (getAll, history, etc.), each element becomes a separate output item when `returnAll` is true; otherwise the array is returned as a single item.

### Errors

- Throws `NodeOperationError` on API errors (HTTP 4xx/5xx, invalid parameters)
- Respects `continueOnFail`: on failure, returns error object in `json.error` for that item instead of throwing
- Rate limits: uses internal `slackApiRequestAllItemsWithRateLimit` with maxRetries=2, fallbackDelay=30s
- Validation errors (e.g., invalid JSON in blocks/attachments) throw immediately

### Expressions

All string, number, and boolean parameters accept expressions (`{{ ... }}`). Resource locator modes (list, id, name, url) support expression values. Collection and fixedCollection fields support expressions in nested values.

### Send and Wait (HITL)

- Operation `sendAndWait` posts a message via `chat.postMessage` then pauses execution via `putExecutionToWait`
- Webhook callback resumes execution; response data available in subsequent nodes
- Requires Slack app with appropriate scopes and Event Subscriptions configured
- Tooltip: `SEND_AND_WAIT_WAITING_TOOLTIP` (from n8n core)

### Pagination

- `returnAll: true` uses `slackApiRequestAllItems` to fetch all pages automatically
- `returnAll: false` uses `limit` parameter (defaults vary by operation)
- Channel history/replies sort messages descending by timestamp in v2.4+

### Binary data

- File upload supports binary property input (`binaryData: true`, `binaryPropertyName`)
- Binary data streamed via multipart/form-data for `files.upload` (v2-v2.1) or external upload URL (v2.2+)
- Downloaded files not automatically stored in binary; use HTTP Request node for file download

## Acceptance tests

### Test: Channel - Create public channel

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "create",
  "channelId": "test-channel",
  "channelVisibility": "public"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "C1234567890",
    "name": "test-channel",
    "is_channel": true,
    "is_private": false,
    "created": 1699999999
  }
}]
```

### Test: Message - Send simple text to channel

**Given** input items:
```json
[{ "json": { "message": "Hello from n8n!" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "post",
  "select": "channel",
  "channelId": { "mode": "id", "value": "C1234567890" },
  "messageType": "text",
  "text": "Hello from n8n!",
  "otherOptions": {}
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "ok": true,
    "channel": "C1234567890",
    "ts": "1699999999.123456",
    "message": { "text": "Hello from n8n!", "user": "U1234567890", "type": "message" }
  }
}]
```

### Test: Message - Send Block Kit message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "post",
  "select": "channel",
  "channelId": { "mode": "id", "value": "C1234567890" },
  "messageType": "block",
  "blocksUi": "[{\"type\":\"section\",\"text\":{\"type\":\"mrkdwn\",\"text\":\"*Hello* from Block Kit!\"}}]",
  "text": "Fallback notification text"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "ok": true,
    "channel": "C1234567890",
    "ts": "1699999999.123456",
    "message": { "blocks": [{"type":"section","text":{"type":"mrkdwn","text":"*Hello* from Block Kit!"}}] }
  }
}]
```

### Test: File - Upload binary file

**Given** input items with binary field `data`:
```json
[{ "json": {}, "binary": { "data": { "fileName": "test.txt", "mimeType": "text/plain" } } }]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "upload",
  "binaryData": true,
  "binaryPropertyName": "data",
  "options": {
    "channelIds": ["C1234567890"],
    "initialComment": "Uploaded via n8n",
    "title": "Test File"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "F1234567890",
    "name": "test.txt",
    "title": "Test File",
    "mimetype": "text/plain",
    "size": 123
  }
}]
```

### Test: Reaction - Add reaction to message

**Given** input items:
```json
[{ "json": { "ts": "1699999999.123456" } }]
```

**Parameters:**
```json
{
  "resource": "reaction",
  "operation": "add",
  "channelId": { "mode": "id", "value": "C1234567890" },
  "timestamp": "={{ $json.ts }}",
  "name": "+1"
}
```

**Expect** output[0]:
```json
[{
  "json": { "ok": true }
}]
```

### Test: User - Get user info

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "info",
  "user": { "mode": "id", "value": "U1234567890" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "U1234567890",
    "name": "john.doe",
    "real_name": "John Doe",
    "profile": { "display_name": "John", "email": "john@example.com" }
  }
}]
```

### Test: User Group - Create user group

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "userGroup",
  "operation": "create",
  "name": "engineering-team",
  "Options": {
    "handle": "eng-team",
    "description": "All engineers",
    "channelIds": ["C1234567890"],
    "include_count": true
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "S1234567890",
    "name": "engineering-team",
    "handle": "eng-team",
    "description": "All engineers",
    "users": [],
    "channel_count": 1
  }
}]
```

### Test: Channel - Get all channels with filters

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "getAll",
  "returnAll": true,
  "filters": {
    "types": ["public_channel", "private_channel"],
    "excludeArchived": true
  }
}
```

**Expect** output[0] (array of channels):
```json
[[{
  "json": { "id": "C1234567890", "name": "general", "is_channel": true, "is_private": false }
}, {
  "json": { "id": "C0987654321", "name": "random", "is_channel": true, "is_private": false }
}]]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Channel resource locator modes | documented | list, id, name, url modes from V2 descriptor |
| Message block/attachment JSON structure | documented | Referenced from Slack Block Kit Builder |
| Send and Wait webhook flow | documented | n8n docs describe HITL approval flow |
| File upload v2.2+ external URL flow | inferred | Implementation uses files.getUploadURLExternal; behavior matches Slack API |
| Rate limit retry logic | inferred | Internal utility with maxRetries=2, fallbackDelay=30s |
| Binary data handling on download | gap | File download not natively supported; requires HTTP Request node |
| User Profile custom fields | documented | Fixed collection with getTeamFields loadOptions |
| Search messages sort mapping | documented | `desc`→timestamp desc, `asc`→timestamp asc, `relevance`→score |
| Channel history sorting v2.4+ | inferred | Manual descending sort added in execute for v2.4+ |
| Ephemeral message restrictions | documented | Cannot send ephemeral as user with username mode |

## OpenFlow mapping

- **Definition group:** `integration` (app node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.slack.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Trigger variant:** `n8n-nodes-base.slackTrigger` (separate spec entry)
- **Credential types:** `slackApi` (accessToken), `slackOAuth2Api` (oAuth2)

---

# Slack Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.slacktrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/slack/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.slackTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger)
- **Outputs:** `main` × 1
- **Credentials:** `slackApi` (accessToken) | `slackOAuth2Api` (oAuth2)
- **Webhook:** uses n8n `sendAndWait` webhook infrastructure

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | accessToken | yes | — | `accessToken` \| `oAuth2` |
| event | options | — | yes | — | Slack event types: `message.channels`, `message.groups`, `message.im`, `message.mpim`, `app_mention`, `reaction_added`, `reaction_removed`, `star_added`, `star_removed`, `member_joined_channel`, `member_left_channel`, `channel_created`, `channel_renamed`, `channel_archive`, `channel_unarchive`, `team_join`, `user_change` |
| channel | resourceLocator | {mode:list,value:""} | conditional | show for channel-specific events | modes: list, id, name, url |
| additionalFields | collection | {} | no | — | Options: `includeBotMessages` (bool), `resolveUser` (bool), `resolveChannel` (bool) |

## Runtime behavior

### Input

None (trigger node). Starts workflow on incoming Slack events via webhook.

### Output

Emits one item per event on `main` output. Item `json` contains Slack event payload enriched with resolved user/channel names if `additionalFields.resolveUser/resolveChannel` enabled.

### Errors

- Webhook signature verification failure: silent drop (security)
- Missing credentials: throws on activation
- Event processing errors: logged, workflow not triggered

### Expressions

Not applicable (trigger parameters only, no per-item expressions).

## Acceptance tests

### Test: Message posted to channel

**Given** webhook payload:
```json
{
  "type": "event_callback",
  "event": {
    "type": "message",
    "subtype": null,
    "channel": "C1234567890",
    "user": "U1234567890",
    "text": "Hello world",
    "ts": "1699999999.123456"
  }
}
```

**Parameters:**
```json
{
  "event": "message.channels",
  "channel": { "mode": "id", "value": "C1234567890" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "type": "message",
    "channel": "C1234567890",
    "user": "U1234567890",
    "text": "Hello world",
    "ts": "1699999999.123456"
  }
}]
```

### Test: Reaction added

**Given** webhook payload:
```json
{
  "type": "event_callback",
  "event": {
    "type": "reaction_added",
    "user": "U1234567890",
    "reaction": "+1",
    "item": { "type": "message", "channel": "C1234567890", "ts": "1699999999.123456" },
    "event_ts": "1699999999.987654"
  }
}
```

**Parameters:**
```json
{
  "event": "reaction_added"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "type": "reaction_added",
    "user": "U1234567890",
    "reaction": "+1",
    "item": { "type": "message", "channel": "C1234567890", "ts": "1699999999.123456" },
    "event_ts": "1699999999.987654"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event type list | documented | From n8n Slack Trigger docs |
| Channel filter modes | inferred | Same resourceLocator as main node |
| Additional field options | documented | includeBotMessages, resolveUser, resolveChannel |
| Webhook signature verification | documented | n8n core handles via credentials |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.slackTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only (trigger interface)
- **Credential types:** `slackApi` (accessToken), `slackOAuth2Api` (oAuth2)