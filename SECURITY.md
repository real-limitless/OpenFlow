# Security

## Reporting a vulnerability

If you find a security issue in OpenFlow (including accidental secret exposure in the repo or a deploy), please report it privately to the maintainers rather than opening a public issue with exploit details.

Include:

- What you found and how to reproduce it
- Affected version / commit if known
- Whether any live secrets or user data may have been exposed

## What counts as a secret

Never commit or paste these into issues, PRs, or logs:

| Secret | Where it lives |
| --- | --- |
| `CREDENTIALS_KEY` | `.env` or Docker `secrets-data` volume — encrypts stored credentials |
| `OPENFLOW_ASSISTANT_API_KEY` / `OPENAI_API_KEY` | `.env` — LLM assistant |
| OAuth access/refresh tokens (`ofa_` / `ofr_`) | Hashed in DB; issued to remote MCP clients |
| `OPENCODE_API_KEY` / server password | `.env` when using the OpenCode backend |
| Database passwords | `POSTGRES_PASSWORD` (Compose builds `DATABASE_URL`). Not `CREDENTIALS_KEY` |
| Cloud keys (AWS, Vault, S3, Datadog, …) | `.env` or secret providers UI |
| Workflow credential payloads | Database (encrypted at rest with `CREDENTIALS_KEY`) |

`.env` is gitignored. The only committed template is [`.env.example`](.env.example) (empty values and comments).

## Local defaults (not production secrets)

Docker Compose uses a local-only Postgres password until the prod overlay:

- Postgres user/password/db: `openflow` / `openflow` / `openflow`
- `AUTH_DISABLED=false`, `OPENFLOW_HOT_NODES=false`, `OPENFLOW_OPEN_REGISTER=false`, `OPENFLOW_ALLOW_FIRST_OWNER=false`
- `REDIS_PASSWORD` is required and has no default

`AUTH_DISABLED=true` is an INSECURE local try-out (no login). Do not expose that mode, or the dev Postgres password, past your own machine. For production, see [docs/install.md](docs/install.md).

## Rotation checklist

If a secret may have leaked:

1. **Rotate immediately** at the provider (API key, cloud IAM, DB password).
2. Generate a new `CREDENTIALS_KEY` only if you accept re-encrypting / re-entering stored credentials (changing the key invalidates ciphertext encrypted with the old key).
3. Remove the secret from git history if it was committed (`git filter-repo` / BFG) and force-push only with team coordination.
4. Revoke any sessions or API keys issued under the compromised material.

## Repo hygiene

- Run `bash scripts/check-no-secrets.sh` before publishing branches.
- Prefer the TUI install wizard or `npm run setup` so `CREDENTIALS_KEY` is generated locally and never shared.
- Do not put real keys in docs, screenshots, or test fixtures (tests already use obvious placeholders).

## Production hardening (summary)

- Set a strong 64-hex-char `CREDENTIALS_KEY` and keep it stable.
- Leave `AUTH_DISABLED=false` (the default).
- Terminate TLS in front of the API.
- Do not publish Postgres or Redis ports. They stay on the internal `backend` network.
- Back up `pgdata`, `binary-data`, and `secrets-data` volumes.

## Agents and secrets

AI agents (MCP, API keys, OAuth) authenticate as an OpenFlow user but are **not** given secret-write by default:

- Opt-in scopes: `openflow:credentials`, `openflow:variables` (API Keys UI / OAuth consent / temp MCP mint).
- Create/update/delete via MCP or REST never returns decrypted secret payloads (variables with `secret: true` are redacted as `••••••••`).
- Runtime executors still resolve credentials and `$vars` inside workflow runs.
- Prefer binding existing credentials with `list_credentials` + `update_node` when possible.

Details: [docs/mcp.md](docs/mcp.md), [docs/install.md](docs/install.md#production-checklist).

## Kill switch and incident response

Use these in order when a key, session, or the instance itself is no longer trusted. Do not put secret values in tickets or shell history.

### Revoke an API key

The key's user calls:

```http
DELETE /api/v1/api-keys/:id
```

A successful call returns `204` and deletes the `api_keys` row. Grants on that key are removed with it. There is no separate revoked flag.

If the API is unreachable or the key's user cannot sign in, delete the row directly:

```sql
DELETE FROM api_keys WHERE id = '<id>';
```

List a user's keys first: `SELECT id, name, "userId" FROM api_keys WHERE "userId" = '<user id>';`

### Revoke sessions

The signed-in caller ends their own session with `POST /api/v1/auth/logout` (deletes that cookie's row in `sessions`).

To drop every session for one user, or every session on the instance:

```sql
DELETE FROM sessions WHERE "userId" = '<user id>';
DELETE FROM sessions;
```

Expired rows are also removed when a request presents them. New logins stay possible until login is disabled or the process is stopped.

### Force-disable login and registration

Set these in the environment and recreate `api` (and `worker` if it serves auth):

| Variable | Effect |
| --- | --- |
| `OPENFLOW_LOGIN_DISABLED=true` | Rejects `POST /api/v1/auth/login` and SSO sign-in (`403`, `login_disabled`) |
| `OPENFLOW_OPEN_REGISTER=false` | Default. Public signup, including the first owner, is rejected (`403`, `invite_only`) |
| `OPENFLOW_ALLOW_FIRST_OWNER=true` | Opt-in. Allows one public first-owner signup while open register stays false. Set it back to false after |
| `OPENFLOW_REGISTRATION_DISABLED=true` | Rejects every signup, including first-run `/setup` and SSO account creation (`403`, `registration_disabled`) |

`AUTH_DISABLED=true` does the opposite of a lockout: it skips login. Do not set it during an incident.

### Take the service offline

Stop the API and worker. Leave Postgres and Redis running if you still need the database for the SQL steps above.

```sh
docker compose stop api worker
```

Production overlay:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop api worker
```

Bring them back with the same files and `start` after the env kill switches are in place.

### On-call

Interim on-call is the project owner (Chen Chiu), with the DevOps agent as first responder, pending owner confirmation.
