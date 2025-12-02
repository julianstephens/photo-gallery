import { parseEnv } from "./env";
import { createLogger } from "./logger";
import { NotificationWorker } from "./worker";
import { redisClient as redis, initializeRedis, disconnectRedis } from "utils";

async function main(): Promise<void> {
  // Parse and validate environment variables
  const env = parseEnv();

  // Create logger
  const logger = createLogger(env);

  logger.info("Initializing notification worker");

  try {
    await initializeRedis();
    logger.info("Redis client initialized successfully.");

    // Create and run the worker
    const worker = new NotificationWorker(redis, logger, env);
    const success = await worker.run();

    // Get final stats
    const stats = worker.getStats();
    logger.info({ stats, success }, "Worker execution completed");

    // Exit with appropriate code
    process.exit(success ? 0 : 1);
  } catch (error) {
    logger.fatal({ error: error instanceof Error ? error.message : String(error) }, "Fatal error");
    await redis.quit().catch(() => {});
    process.exit(1);
  } finally {
    logger.info("Shutting down worker and disconnecting Redis client.");
    await disconnectRedis();
    logger.info("Shutdown complete.");
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      service: "photo-gallery-notification-worker",
      msg: "Unhandled error in main",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
