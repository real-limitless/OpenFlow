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
| Database passwords | Compose / `DATABASE_URL` |
| Cloud keys (AWS, Vault, S3, Datadog, …) | `.env` or secret providers UI |
| Workflow credential payloads | Database (encrypted at rest with `CREDENTIALS_KEY`) |

`.env` is gitignored. The only committed template is [`.env.example`](.env.example) (empty values and comments).

## Local defaults (not production secrets)

Docker Compose uses local-only defaults for try-out:

- Postgres user/password/db: `openflow` / `openflow` / `openflow`
- `AUTH_DISABLED=true` by default

These are fine on a private machine. Do **not** expose the stack on the public internet with auth disabled or with default DB credentials. For production, see [docs/install.md](docs/install.md).

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
- Set `AUTH_DISABLED=false`.
- Terminate TLS in front of the API (Caddy / nginx / Traefik).
- Do not publish Postgres/Redis ports publicly.
- Back up `pgdata`, `binary-data`, and `secrets-data` volumes.

## Agents and secrets

AI agents (MCP, API keys, OAuth) authenticate as an OpenFlow user but are **not** given secret-write by default:

- Opt-in scopes: `openflow:credentials`, `openflow:variables` (API Keys UI / OAuth consent / temp MCP mint).
- Create/update/delete via MCP or REST never returns decrypted secret payloads (variables with `secret: true` are redacted as `••••••••`).
- Runtime executors still resolve credentials and `$vars` inside workflow runs.
- Prefer binding existing credentials with `list_credentials` + `update_node` when possible.

Details: [docs/mcp.md](docs/mcp.md), [docs/install.md](docs/install.md#production-checklist).
