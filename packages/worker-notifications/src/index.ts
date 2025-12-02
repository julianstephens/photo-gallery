import Redis from "ioredis";
import { parseEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { NotificationWorker } from "./worker.js";

async function main(): Promise<void> {
  // Parse and validate environment variables
  const env = parseEnv();

  // Create logger
  const logger = createLogger(env);

  logger.info("Initializing notification worker");

  // Create Redis connection
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) {
        logger.error({ attempts: times }, "Redis connection failed after max retries");
        return null; // Stop retrying
      }
      const delay = Math.min(times * 200, 2000);
      logger.warn({ attempt: times, delayMs: delay }, "Retrying Redis connection");
      return delay;
    },
  });

  redis.on("error", (err) => {
    logger.error({ error: err.message }, "Redis connection error");
  });

  redis.on("connect", () => {
    logger.info("Connected to Redis");
  });

  try {
    // Wait for Redis connection
    await redis.ping();

    // Create and run the worker
    const worker = new NotificationWorker(redis, logger, env);
    const success = await worker.run();

    // Get final stats
    const stats = worker.getStats();
    logger.info({ stats, success }, "Worker execution completed");

    // Cleanup
    await redis.quit();

    // Exit with appropriate code
    process.exit(success ? 0 : 1);
  } catch (error) {
    logger.fatal({ error: error instanceof Error ? error.message : String(error) }, "Fatal error");
    await redis.quit().catch(() => {});
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
