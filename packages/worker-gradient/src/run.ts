import http from "node:http";
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

    // Create health check server
    const healthCheckServer = http.createServer(async (req, res) => {
      if (req.method === "GET" && req.url === "/health") {
        try {
          await redis.ping();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        } catch (e) {
          logger.error({ error: e }, "Health check failed: Redis ping failed");
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "error", reason: "Redis connection failed" }));
        }
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", reason: "Not found" }));
      }
    });

    const healthCheckPort = 9876;
    healthCheckServer.listen(healthCheckPort, () => {
      logger.info(`Health check server listening on port ${healthCheckPort}`);
    });

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      logger.info({ signal }, `${signal} received, shutting down...`);
      await worker.stop();
      const stats = worker.getStats();
      logger.info({ stats }, "Worker final stats");

      healthCheckServer.close(() => {
        logger.info("Health check server closed.");
      });

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
