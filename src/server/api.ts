import { Hono } from "hono";
import { config } from "../config";
import { authMiddleware, type AppEnv } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { securityHeadersMiddleware } from "./middleware/security-headers";
import { csrfMiddleware } from "./middleware/csrf";
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
import instanceSettingsRoute from "./routes/instance-settings";
import devRoute from "./routes/dev";
import assistantRoute from "./routes/assistant";
import aiGenerateRoute from "./routes/ai-generate";
import formsRoute from "./routes/forms";
import chatRoute from "./routes/chat";
import chatHubRoute from "./routes/chat-hub";
import openflowMcpRoute from "./mcp/openflow-server";
import oauthRoute from "./routes/oauth";
import mcpAccessRoute from "./routes/mcp-access";
import catalogRoute from "./routes/catalog";
import ansibleRoute from "./routes/ansible";
import mcpGalleryRoute from "./routes/mcp-gallery";
import mcpFlowRoute from "./routes/mcp-flow";
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

app.use("*", rateLimitMiddleware);
app.use("*", securityHeadersMiddleware);
app.use("*", authMiddleware);
app.use("*", csrfMiddleware);

healthRoute(app);
setupRoute(app);
oauthRoute(app);
authRoute(app);
apiKeysRoute(app);
mcpAccessRoute(app);
projectsRoute(app);
sharesRoute(app);
variablesRoute(app);
environmentsRoute(app);
secretProvidersRoute(app);
instanceSettingsRoute(app);
credentialsRoute(app);
dataTablesRoute(app);
executionsRoute(app);
webhooksRoute(app);
formsRoute(app);
chatRoute(app);
chatHubRoute(app);
workflowsRoute(app);
templatesRoute(app);
templateSourcesRoute(app);
schedulesRoute(app);
assistantRoute(app);
aiGenerateRoute(app);
catalogRoute(app);
ansibleRoute(app);
mcpGalleryRoute(app);
mcpFlowRoute(app);
openflowMcpRoute(app);
devRoute(app);

if (config.worker.scheduler) {
  initializeSchedules().catch((err) =>
    log.error("schedule init failed", {
      component: "api",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
}

if (config.worker.enabled) {
  startWorker(config.worker.concurrency);
}

log.info("api ready", {
  component: "api",
  auth: config.auth.disabled ? "disabled" : "enabled",
  role: config.worker.role,
  worker: config.worker.enabled,
});

export default app;
