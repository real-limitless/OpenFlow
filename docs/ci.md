# CI

GitHub Actions workflow: `.github/workflows/ci.yml`.

On every pull request and push to `DEVELOPMENT` / `PRODUCTION` it runs:

1. `npm ci` and `prisma generate`
2. Targeted unit tests (`npm run test:ci`)
3. `tsc --noEmit -p tsconfig.ci.json` (server, sdk, config; not the factory executor dump)
4. `eslint` on `src/server`, `src/sdk`, `src/config.ts`

Docker image builds stay in `.github/workflows/docker.yml` and now also listen to `DEVELOPMENT`.
