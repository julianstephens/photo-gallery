import { disconnectRedis, initializeRedis, redisClient as redis } from "utils/redis";
import { parseEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { GradientWorker } from "./worker.js";

async function main(): Promise<void> {
  // Parse and validate environment variables
  const env = parseEnv();

  // Create logger
  const logger = createLogger(env);

  logger.info("Initializing gradient generator worker");

  try {
    await initializeRedis();
    logger.info("Redis client initialized successfully.");

    // Create and start the worker
    const worker = new GradientWorker(redis, logger, env);
    worker.start();

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      logger.info({ signal }, `${signal} received, shutting down...`);
      await worker.stop();
      const stats = worker.getStats();
      logger.info({ stats }, "Worker final stats");
      await disconnectRedis();
      logger.info("Shutdown complete.");
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // Keep the process running
    logger.info("Gradient generator worker is running. Press Ctrl+C to stop.");
  } catch (error) {
    logger.fatal({ error: error instanceof Error ? error.message : String(error) }, "Fatal error");
    await disconnectRedis();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      service: "photo-gallery-worker-gradient",
      msg: "Unhandled error in main",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
