# OpenFlow Helm chart

Deploys:

- **api** — `OPENFLOW_ROLE=main`, `RUN_WORKER=false`
- **worker** — `OPENFLOW_ROLE=worker` (scale `worker.replicaCount`)
- **Postgres 16** and **Redis 7** (disable and set `externalDatabaseUrl` / `externalRedisUrl` to use managed services)

## Install

```bash
helm install openflow ./deploy/helm/openflow \
  --set secrets.credentialsKey=$(openssl rand -hex 32) \
  --set secrets.postgresPassword="$(openssl rand -hex 16)"
```

Wait for the API:

```bash
kubectl rollout status deploy/openflow-openflow-api
kubectl port-forward svc/openflow-openflow-api 3000:3000
curl -sS http://127.0.0.1:3000/health
```

Production: set `ingress.enabled=true`, a real `credentialsKey`, and `secrets.authDisabled=false`. Do not keep placeholder secrets.

Worker replicas show in Settings → Worker runtime after the API is up (`OPENFLOW_ROLE` / concurrency).
