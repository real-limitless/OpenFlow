---
type: n8n-nodes-base.awsIam
displayName: AWS IAM
category: Development
versions: [1]
priority: medium
status: specced
---

# AWS IAM

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awsiam/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.aws.amazon.com/IAM/latest/APIReference/welcome.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsIam`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `aws` (IAM access key) or `awsAssumeRole` (STS role assumption)

Refer to `docs/specs/nodes/n8n-nodes-base.awsS3.md` for the shared AWS credential fields schema (region, accessKeyId, secretAccessKey, sessionToken, roleArn, externalId, customEndpoints).

## Parameters

### Resource: `user`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `user` | yes | — | Fixed value `user` |
| operation | options | `getAll` | yes | resource=user | `addToGroup`, `create`, `delete`, `get`, `getAll`, `removeFromGroup`, `update` |
| user | resourceLocator | — | yes | resource=user, operation in addToGroup/delete/get/update/removeFromGroup | Identifies the target user by ID or list selection |
| group | resourceLocator | — | yes | resource=user, operation in addToGroup/removeFromGroup | Identifies the target group by ID or list selection |
| userName | string | — | yes | resource=user, operation in create/update | Name of the user to create or rename |
| returnAll | boolean | false | no | resource=user, operation=getAll | When false, `limit` controls page size |
| limit | number | — | no | resource=user, operation=getAll, returnAll=false | Max results to return |
| additionalFields | collection | `{}` | no | resource=user, operation in create/getAll/update | Optional sub-parameters (see below) |

#### User additionalFields sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| (none currently defined in the original node) | — | — | All user IAM operations rely on the AWS API's minimal required parameters; no optional extra fields are exposed. |

### Resource: `group`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `user` | yes | — | Fixed value `group` |
| operation | options | `getAll` | yes | resource=group | `create`, `delete`, `get`, `getAll`, `update` |
| group | resourceLocator | — | yes | resource=group, operation in delete/get/update | Identifies the target group by ID or list selection |
| groupName | string | — | yes | resource=group, operation in create/update | Name of the group to create or rename |
| returnAll | boolean | false | no | resource=group, operation=getAll | When false, `limit` controls page size |
| limit | number | — | no | resource=group, operation=getAll, returnAll=false | Max results to return |
| includeUsers | boolean | false | no | resource=group, operation in get/getAll | When true, the response includes the list of user memberships for each group |
| additionalFields | collection | `{}` | no | resource=group, operation in create/update | Optional sub-parameters (see below) |

#### Group additionalFields sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| (none currently defined in the original node) | — | — | All group IAM operations rely on the AWS API's minimal required parameters; no optional extra fields are exposed. |

### Shared options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| requestOptions | collection | `{}` | no | — | Generic HTTP-level overrides (currently no sub-parameters defined) |

## Runtime behavior

### Signing

All requests are sent to `https://iam.amazonaws.com` signed with the AWS Signature Version 4 process using the credential's access key/secret. The `Content-Type` header is `application/x-www-form-urlencoded`; the request body encodes the IAM API action and parameters as form-URL-encoded key-value pairs.

### Input

Each input item is processed independently. Parameters that are not expressions are evaluated once per execution batch; expression parameters are evaluated per item.

### Output

Each operation produces one output item per API response entity:

- **create / update / get / delete:** A single output item containing the IAM API response envelope (metadata + result). For `delete`, the AWS IAM API returns an empty payload on success.
- **getAll:** One output item per page of results. When `returnAll` is true, the executor paginates automatically using the `Marker` field in the IAM API response. When `returnAll` is false, results are capped at `limit`.
- **addToGroup / removeFromGroup:** A single output item per operation; the IAM API returns an empty payload on success.

### Errors

- IAM API errors (e.g., `NoSuchEntity`, `EntityAlreadyExists`, `LimitExceeded`, `MalformedPolicyDocument`) are surfaced as thrown errors in the workflow, halting execution unless `continueOnFail` is enabled on the node.
- Network or credential errors (invalid signature, missing region, connection timeout) are thrown immediately.

### Expressions

All top-level parameters (resource, operation, userName, groupName, user, group, returnAll, limit, includeUsers, additionalFields) accept expression strings.

## Acceptance tests

### Test: User — create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "create",
  "userName": "alice-dev"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "User": {
      "Path": "/",
      "UserName": "alice-dev",
      "UserId": "AIDAIOSFODNN7EXAMPLE",
      "Arn": "arn:aws:iam::123456789012:user/alice-dev",
      "CreateDate": "2024-01-15T10:00:00Z"
    }
  }
}]
```

### Test: User — get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "get",
  "user": { "mode": "id", "value": "alice-dev" }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "User": {
      "Path": "/",
      "UserName": "alice-dev",
      "UserId": "AIDAIOSFODNN7EXAMPLE",
      "Arn": "arn:aws:iam::123456789012:user/alice-dev",
      "CreateDate": "2024-01-15T10:00:00Z"
    }
  }
}]
```

### Test: User — addToGroup

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "addToGroup",
  "user": { "mode": "id", "value": "alice-dev" },
  "group": { "mode": "id", "value": "Developers" }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "success": true
  }
}]
```

### Test: Group — create and getAll with includeUsers

**Given** input items:

```json
[{"json": {}}, {"json": {}}]
```

**Parameters (item 0):**

```json
{
  "resource": "group",
  "operation": "create",
  "groupName": "Developers"
}
```

**Parameters (item 1):**

```json
{
  "resource": "group",
  "operation": "getAll",
  "returnAll": true,
  "includeUsers": true
}
```

**Expect** output[0] item 0:

```json
[{
  "json": {
    "Group": {
      "Path": "/",
      "GroupName": "Developers",
      "GroupId": "AGPAIEXAMPLEID123",
      "Arn": "arn:aws:iam::123456789012:group/Developers",
      "CreateDate": "2024-01-15T10:00:00Z"
    }
  }
}]
```

**Expect** output[0] item 1: An array of group objects, each optionally containing a `Users` array when `includeUsers` is true.

### Test: User — delete

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "delete",
  "user": { "mode": "id", "value": "alice-dev" }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "success": true
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Pagination algorithm | Inferred from AWS IAM API | Uses `Marker` and `IsTruncated` fields; public docs confirm pagination via n8n's `returnAll`+`limit` pattern |
| `additionalFields` sub-parameters | Confirmed from corpus | The original node exposes empty additionalFields for user/group create/update/getAll and group create/update |
| `requestOptions` sub-parameters | Confirmed from corpus | Empty collection; no HTTP-level overrides are exposed |
| Credential schema | Public docs | Shared AWS credential (access key / assume role) documented at docs.n8n.io |
| Base URL | Confirmed from corpus | `https://iam.amazonaws.com` with form-URL-encoded POST body |

## OpenFlow mapping

- **Definition group:** `development`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.awsIam.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
