import { disconnectRedis, initializeRedis } from "utils";
import { appLogger } from "./middleware/logger.ts";
import env from "./schemas/env.ts";
import { createApp, printRegisteredRoutes } from "./server.ts";

// Start server if run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  // Construct REDIS_URL from individual env vars for the shared Redis client
  // This must be done before createApp() is called since modules load the Redis client at import time
  process.env.REDIS_URL = `redis://${env.REDIS_USER}:${env.REDIS_PASSWORD}@${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`;

  (async () => {
    const app = createApp();

    // Log startup configuration
    appLogger.info(
      {
        NODE_ENV: env.NODE_ENV,
        LOG_LEVEL: env.LOG_LEVEL,
        LOG_OUTPUT: env.LOG_OUTPUT || "auto",
      },
      "Logger initialized",
    );

    try {
      await initializeRedis();
    } catch (err) {
      appLogger.fatal({ err }, "Failed to initialize Redis client");
      process.exit(1);
    }

    if (env.NODE_ENV !== "production") {
      appLogger.info("Registered Routes:");
      printRegisteredRoutes(app.router.stack);
    }
    const server = app.listen(env.PORT, () => {
      appLogger.info(`Server listening on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      appLogger.info({ signal }, `${signal} received, shutting down...`);

      server.close(async (err) => {
        if (err) {
          appLogger.error({ err }, "Error during server shutdown");
          process.exit(1);
        }
        appLogger.info("Server closed");

        await disconnectRedis();
        process.exit(0);
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  })();
}
