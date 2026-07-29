import { Hono } from "hono";
import { config } from "../config";
import { authMiddleware, type AppEnv } from "./middleware/auth";
import apiKeysRoute from "./routes/api-keys";
import authRoute from "./routes/auth";
import credentialsRoute from "./routes/credentials";
import executionsRoute from "./routes/executions";
import healthRoute from "./routes/health";
import schedulesRoute, { initializeSchedules } from "./routes/schedules";
import webhooksRoute from "./routes/webhooks";
import workflowsRoute from "./routes/workflows";
import { startWorker } from "./worker";

const app = new Hono<AppEnv>();

app.use("*", authMiddleware);

healthRoute(app);
authRoute(app);
apiKeysRoute(app);
credentialsRoute(app);
executionsRoute(app);
webhooksRoute(app);
workflowsRoute(app);
schedulesRoute(app);

initializeSchedules().catch(console.error);

if (config.worker.enabled) {
  startWorker(config.worker.concurrency);
}

export default app;
