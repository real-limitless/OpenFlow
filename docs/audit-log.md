# Audit log

OpenFlow writes one JSON object per line to stdout. Every line includes `ts` (UTC ISO-8601), `level`, `service`, `env`, `project`, `event`, `request_id`, `actor`, `client_ip`, `user_agent`, `host`, `path`, `method`, `status`, `action`, and `outcome`.

| Field        | Source                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env`        | `OPENFLOW_ENV`, otherwise `NODE_ENV`. Only `production` / `prod` map to `production`. Every other value is `development`.                                 |
| `project`    | `LOG_PROJECT`. Default `real-limitless`.                                                                                                                  |
| `service`    | `LOG_SERVICE`. Default `openflow`.                                                                                                                        |
| `request_id` | Incoming `X-Request-Id`, or a generated id. The response echoes `X-Request-Id`.                                                                           |
| `actor`      | User id, or the first 8 characters of an API key.                                                                                                         |
| `client_ip`  | Trusted-proxy helper. Untrusted peers use the socket address. A trusted peer (`TRUSTED_PROXY_CIDRS`, or `TRUSTED_PROXY_COUNT` when no CIDR list is set) uses the right-most untrusted `X-Forwarded-For` hop. |
| `event`      | `auth_success`, `auth_failure`, `denial`, `key_change`, `config_change`, `admin_action`, `rate_limit`, `error`. Routine access lines leave `event` empty. |
| `outcome`    | `success`, `failure`, or `denied`.                                                                                                                        |

Passwords, tokens, API keys, cookies, `Authorization` headers, and secret-like body fields are redacted before a line is written. Login failures store a hash of the attempted email, or the user id when the account exists. They do not store the password.

Each request emits one access line. Security actions also append an `AuditLog` row when a durable record is appropriate (login, denial, key create/revoke/expiry/use denied, settings changes, admin actions). Rate-limit hits are log lines with `event` `rate_limit` and are not inserted as rows.

## Append-only retention

`audit_logs` rejects `UPDATE`, `DELETE`, and `TRUNCATE` from the application role. Triggers `audit_logs_append_only_row` and `audit_logs_append_only_truncate` call `openflow_audit_logs_append_only()`.

The application pruner does not delete audit rows. `OPENFLOW_AUDIT_RETENTION_DAYS` defaults to off (`0`). A configured value below 90 days is treated as 90. Rows younger than 90 days are never eligible for pruning.

To remove rows older than the retention window, a database administrator grants `openflow_audit_maintenance` to a maintenance role and deletes with an explicit age predicate. The migration creates that role as `NOLOGIN` when the database user is allowed to create roles. Example, run as a superuser, only after confirming the cutoff is at least 90 days:

```sql
GRANT openflow_audit_maintenance TO openflow_audit_maintainer;
SET ROLE openflow_audit_maintainer;
DELETE FROM audit_logs WHERE "at" < CURRENT_TIMESTAMP - INTERVAL '90 days';
RESET ROLE;
```

The trigger checks `current_user`, so the `SET ROLE` above is required. The application role must not be a member of `openflow_audit_maintenance`.

Do not `TRUNCATE` the table. The down migration `prisma/migrations/20261023120000_audit_log_append_only/down.sql` drops the triggers and function if the policy must be reversed.

Execution retention is separate and still deletes finished execution rows. It does not touch `audit_logs`.
