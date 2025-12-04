// CRITICAL: Set REDIS_URL from individual env vars BEFORE any imports.
// This must happen before utils/redis is imported because that module
// creates the Redis client at import time using process.env.REDIS_URL.

// Check if this is the main entry point
const isMainModule = process.argv[1] === new URL(import.meta.url).pathname;

if (isMainModule) {
  // Read from environment (set by Docker/runtime)
  const redisUser = process.env.REDIS_USER || "";
  const redisPassword = process.env.REDIS_PASSWORD || "";
  const redisHost = process.env.REDIS_HOST || "localhost";
  const redisPort = process.env.REDIS_PORT || "6379";
  const redisDb = process.env.REDIS_DB || "1";

  // Construct REDIS_URL from individual env variables
  // This overrides any default value and is used when utils/redis is imported below
  process.env.REDIS_URL = `redis://${redisUser}:${redisPassword}@${redisHost}:${redisPort}/${redisDb}`;
}

import { disconnectRedis, initializeRedis } from "utils/redis";
import { appLogger } from "./middleware/logger.ts";
import env from "./schemas/env.ts";
import { createApp, printRegisteredRoutes } from "./server.ts";

// Start server if run directly
if (isMainModule) {
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
