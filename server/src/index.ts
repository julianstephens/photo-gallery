import { appLogger } from "./middleware/logger.ts";
import env from "./schemas/env.ts";
import { createApp, printRegisteredRoutes } from "./server.ts";
import { startGradientWorker, stopGradientWorker } from "./workers/index.ts";

// Start server if run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const app = createApp();

  // Start the gradient generation worker if enabled
  startGradientWorker();

  appLogger.info("Registered Routes:");
  printRegisteredRoutes(app.router.stack);
  const server = app.listen(env.PORT, () => {
    appLogger.info(`Server listening on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    appLogger.info({ signal }, `${signal} received, shutting down...`);

    // Stop the gradient worker first
    try {
      await stopGradientWorker();
    } catch (err) {
      appLogger.error({ err }, "Error stopping gradient worker");
    }

    server.close((err?: Error) => {
      if (err) {
        appLogger.error({ err }, "Error during server close");
        process.exit(1);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
