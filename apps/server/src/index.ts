// Check if this is the main entry point
const isMainModule = process.argv[1] === new URL(import.meta.url).pathname;

// Dynamic import to ensure all env setup happens before Redis client is created
if (isMainModule) {
  (async () => {
    // First: Import env.ts to run dotenv.config() and set REDIS_URL
    const env = await import("./schemas/env.ts").then((m) => m.default);

    // Then: Dynamically import modules that depend on REDIS_URL
    const { disconnectRedis, initializeRedis } = await import("utils/redis");
    const { appLogger } = await import("./middleware/logger.ts");
    const { createApp, printRegisteredRoutes } = await import("./server.ts");

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
