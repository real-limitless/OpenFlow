import { Hono } from "hono";
import { config } from "../config";
import { authMiddleware, type AppEnv } from "./middleware/auth";
import apiKeysRoute from "./routes/api-keys";
import authRoute from "./routes/auth";
import credentialsRoute from "./routes/credentials";
import dataTablesRoute from "./routes/data-tables";
import executionsRoute from "./routes/executions";
import healthRoute from "./routes/health";
import setupRoute from "./routes/setup";
import schedulesRoute, { initializeSchedules } from "./routes/schedules";
import webhooksRoute from "./routes/webhooks";
import workflowsRoute from "./routes/workflows";
import templatesRoute from "./routes/templates";
import templateSourcesRoute from "./routes/template-sources";
import projectsRoute from "./routes/projects";
import sharesRoute from "./routes/shares";
import variablesRoute from "./routes/variables";
import environmentsRoute from "./routes/environments";
import secretProvidersRoute from "./routes/secret-providers";
import devRoute from "./routes/dev";
import assistantRoute from "./routes/assistant";
import aiGenerateRoute from "./routes/ai-generate";
import formsRoute from "./routes/forms";
import openflowMcpRoute from "./mcp/openflow-server";
import { startWorker } from "./worker";
import { seedBuiltinExecutors } from "../lib/engine";
import { seedBuiltinDescriptions } from "../lib/nodes/registry";
import { initBinaryStorage } from "./binary-init";
import { initLogStreaming, log } from "./log";

// Ensure live registry is populated when the API process boots.
seedBuiltinExecutors();
seedBuiltinDescriptions();
initLogStreaming();
initBinaryStorage();

const app = new Hono<AppEnv>();

app.use("*", authMiddleware);

healthRoute(app);
setupRoute(app);
authRoute(app);
apiKeysRoute(app);
projectsRoute(app);
sharesRoute(app);
variablesRoute(app);
environmentsRoute(app);
secretProvidersRoute(app);
credentialsRoute(app);
dataTablesRoute(app);
executionsRoute(app);
webhooksRoute(app);
formsRoute(app);
workflowsRoute(app);
templatesRoute(app);
templateSourcesRoute(app);
schedulesRoute(app);
assistantRoute(app);
aiGenerateRoute(app);
openflowMcpRoute(app);
devRoute(app);

initializeSchedules().catch((err) =>
  log.error("schedule init failed", {
    component: "api",
    error: err instanceof Error ? err.message : String(err),
  }),
);

if (config.worker.enabled) {
  startWorker(config.worker.concurrency);
}

log.info("api ready", {
  component: "api",
  auth: config.auth.disabled ? "disabled" : "enabled",
  worker: config.worker.enabled,
});

export default app;
