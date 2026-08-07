# Contributing

Thanks for helping with OpenFlow.

## Get set up

1. Follow [docs/onboarding.md](docs/onboarding.md) (recommended: `npm run tui` → **Install wizard**).
2. Or non-interactive: `npm run setup && npm run dev`.
3. Confirm `GET http://localhost:3000/health` succeeds.

## Before you push

- Do not commit secrets (`.env`, keys, tokens). Run `bash scripts/check-no-secrets.sh`.
- Prefer small, focused commits. Avoid force-push or rewriting published history on shared branches unless maintainers agree.
- Run what you can locally: `npm test`, `npm run lint`, `npm run typecheck` as relevant.

## Clean-room nodes

Node work follows a clean-room pipeline: public docs → behavioral spec → SDK implement. Do not copy third-party engine source into this tree.

- Rules: [docs/clean-room.md](docs/clean-room.md)
- SDK: [docs/sdk/OVERVIEW.md](docs/sdk/OVERVIEW.md) · [src/sdk/README.md](src/sdk/README.md)
- Factory batches: [scripts/factory/README.md](scripts/factory/README.md)

## Docs worth reading

| Doc | When |
| --- | --- |
| [docs/onboarding.md](docs/onboarding.md) | First clone |
| [docs/install.md](docs/install.md) | Docker / production |
| [SECURITY.md](SECURITY.md) | Secrets & reporting |
| [docs/assistant.md](docs/assistant.md) | Editor AI assistant |
| [docs/dogfood.md](docs/dogfood.md) | End-to-end fixtures |

## Questions

Use the TUI **Help & docs** item (`npm run tui`) for a local checklist of links and default ports.
