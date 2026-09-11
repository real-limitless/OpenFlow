# Shipped P0/P1 gap work

Parent tracker: [#86](https://github.com/real-limitless/OpenFlow/issues/86) (stays open).

Product code landed on `DEVELOPMENT` (PRs #87–#125). This CORE note is the default-branch record of that cut so the child tickets can close. It is not marketing copy and does not belong on the GitHub Pages site.

| Issue | What shipped |
| --- | --- |
| [#7](https://github.com/real-limitless/OpenFlow/issues/7) | CI: test, lint, typecheck on DEVELOPMENT PRs |
| [#8](https://github.com/real-limitless/OpenFlow/issues/8) | Auth defaults (invite-only / session hardening) |
| [#9](https://github.com/real-limitless/OpenFlow/issues/9) | Secrets boot (no static salt; fail closed in prod) |
| [#10](https://github.com/real-limitless/OpenFlow/issues/10) | Webhook host authentication |
| [#11](https://github.com/real-limitless/OpenFlow/issues/11) | Rate limits |
| [#12](https://github.com/real-limitless/OpenFlow/issues/12) | Durable cron |
| [#13](https://github.com/real-limitless/OpenFlow/issues/13) | Durable wait / resume |
| [#14](https://github.com/real-limitless/OpenFlow/issues/14) | Security headers / CORS |
| [#16](https://github.com/real-limitless/OpenFlow/issues/16) | Instance admin and invite-only onboarding |
| [#18](https://github.com/real-limitless/OpenFlow/issues/18) | Execution governance (timeouts, cancel, quotas) |
| [#19](https://github.com/real-limitless/OpenFlow/issues/19) | Binary and spreadsheet data paths |
| [#20](https://github.com/real-limitless/OpenFlow/issues/20) | Production AWS Secrets Manager backend |
| [#21](https://github.com/real-limitless/OpenFlow/issues/21) | Separate worker service |
| [#22](https://github.com/real-limitless/OpenFlow/issues/22) | Prometheus / OpenTelemetry metrics |
| [#24](https://github.com/real-limitless/OpenFlow/issues/24) | Honest depth badges / top-N dogfood |
| [#26](https://github.com/real-limitless/OpenFlow/issues/26) | Execution retention and PII redaction |
| [#27](https://github.com/real-limitless/OpenFlow/issues/27) | Workflow versions, diff, rollback |
| [#28](https://github.com/real-limitless/OpenFlow/issues/28) | Admin audit log |
| [#29](https://github.com/real-limitless/OpenFlow/issues/29) | CSRF protection for cookie-session mutations |
| [#32](https://github.com/real-limitless/OpenFlow/issues/32) | Import compatibility score |
| [#33](https://github.com/real-limitless/OpenFlow/issues/33) | Certified template pack |
| [#34](https://github.com/real-limitless/OpenFlow/issues/34) | Signed plugin marketplace (OpenFlow plugins) |
| [#36](https://github.com/real-limitless/OpenFlow/issues/36) | Error workflows, DLQ, replay |
| [#37](https://github.com/real-limitless/OpenFlow/issues/37) | Webhook idempotency |
| [#38](https://github.com/real-limitless/OpenFlow/issues/38) | Circuit breakers per credential/host |
| [#40](https://github.com/real-limitless/OpenFlow/issues/40) | Multi-env promotion and credential overrides |
| [#42](https://github.com/real-limitless/OpenFlow/issues/42) | Folders, tags, saved views |
| [#45](https://github.com/real-limitless/OpenFlow/issues/45) | Human-in-the-loop approval inbox |
| [#50](https://github.com/real-limitless/OpenFlow/issues/50) | Outbound signed lifecycle webhooks |
| [#54](https://github.com/real-limitless/OpenFlow/issues/54) | Markdown on `/templates` |
| [#67](https://github.com/real-limitless/OpenFlow/issues/67) | Honesty bar items in this cut (LICENSE, install path, no 400+ claim) |
| [#79](https://github.com/real-limitless/OpenFlow/issues/79) | QA viability items covered by the P0/P1 cut |
| [#114](https://github.com/real-limitless/OpenFlow/issues/114) | Sandboxed Python Code node |
| [#121](https://github.com/real-limitless/OpenFlow/issues/121) | Helm chart (api + worker + Postgres + Redis) |
| [#122](https://github.com/real-limitless/OpenFlow/issues/122) | OIDC SSO login |

Already closed: [#6](https://github.com/real-limitless/OpenFlow/issues/6) (LICENSE / packaging).

n8n mentions in the product tree are JSON interop only. See [LEGAL.md](../LEGAL.md).
