/**
 * Gradient worker facade for in-process operation within the server.
 * This module wraps the worker-gradient-generator package to maintain
 * backwards compatibility with existing server code.
 */

import type { GenerateGradientJobData } from "utils";
import { GradientWorker, createLogger } from "worker-gradient";
import { appLogger } from "../middleware/logger.ts";
import redis from "../redis.ts";
import env from "../schemas/env.ts";

// Singleton worker instance
let workerInstance: GradientWorker | null = null;

/**
 * Get current metrics for monitoring.
 */
export function getGradientWorkerMetrics() {
  const stats = workerInstance?.getStats();
  return {
    jobsProcessed: stats?.jobsProcessed ?? 0,
    jobsFailed: stats?.jobsFailed ?? 0,
    avgProcessingTimeMs: stats?.avgProcessingTimeMs ?? 0,
    isEnabled: env.GRADIENT_WORKER_ENABLED,
    isRunning: workerInstance?.isRunning() ?? false,
    activeJobs: stats?.activeJobs ?? 0,
  };
}

/**
 * Enqueue a gradient generation job.
 * Jobs can be enqueued even if the worker is not running in-process,
 * allowing for standalone worker deployment.
 */
export async function enqueueGradientJob(data: GenerateGradientJobData): Promise<string | null> {
  if (!env.GRADIENT_WORKER_ENABLED) {
    appLogger.debug(
      { storageKey: data.storageKey },
      "[GradientWorker] Worker disabled, skipping job enqueue",
    );
    return null;
  }

  // Create worker instance lazily if not exists
  if (!workerInstance) {
    // Create worker environment from server env
    const workerEnv = {
      REDIS_URL: `redis://${env.REDIS_USER}:${env.REDIS_PASSWORD}@${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`,
      LOG_LEVEL: env.LOG_LEVEL as "trace" | "debug" | "info" | "warn" | "error" | "fatal",
      S3_ENDPOINT: env.S3_ENDPOINT,
      S3_ACCESS_KEY: env.S3_ACCESS_KEY,
      S3_SECRET_KEY: env.S3_SECRET_KEY,
      MASTER_BUCKET_NAME: env.MASTER_BUCKET_NAME,
      GRADIENT_WORKER_CONCURRENCY: env.GRADIENT_WORKER_CONCURRENCY,
      GRADIENT_JOB_MAX_RETRIES: env.GRADIENT_JOB_MAX_RETRIES,
      GRADIENT_WORKER_POLL_INTERVAL_MS: env.GRADIENT_WORKER_POLL_INTERVAL_MS,
    };

    const logger = createLogger(workerEnv);
    workerInstance = new GradientWorker(redis.client, logger, workerEnv);
    // Note: We don't start the worker here - it's just for enqueueing
  }

  return workerInstance.enqueueJob(data);
}

/**
 * Process a single gradient generation job.
 * Exported for testing purposes.
 */
export async function processJob(jobId: string): Promise<void> {
  if (!workerInstance) {
    appLogger.warn("[GradientWorker] Worker not initialized, cannot process job");
    return;
  }
  return workerInstance.processJob(jobId);
}

/**
 * Start the gradient generation worker.
 */
export function startGradientWorker(): void {
  if (!env.GRADIENT_WORKER_ENABLED) {
    appLogger.info("[GradientWorker] Worker disabled by configuration");
    return;
  }

  if (workerInstance?.isRunning()) {
    appLogger.warn("[GradientWorker] Worker already running");
    return;
  }

  // Create worker environment from server env
  const workerEnv = {
    REDIS_URL: `redis://${env.REDIS_USER}:${env.REDIS_PASSWORD}@${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`,
    LOG_LEVEL: env.LOG_LEVEL as "trace" | "debug" | "info" | "warn" | "error" | "fatal",
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_ACCESS_KEY: env.S3_ACCESS_KEY,
    S3_SECRET_KEY: env.S3_SECRET_KEY,
    MASTER_BUCKET_NAME: env.MASTER_BUCKET_NAME,
    GRADIENT_WORKER_CONCURRENCY: env.GRADIENT_WORKER_CONCURRENCY,
    GRADIENT_JOB_MAX_RETRIES: env.GRADIENT_JOB_MAX_RETRIES,
    GRADIENT_WORKER_POLL_INTERVAL_MS: env.GRADIENT_WORKER_POLL_INTERVAL_MS,
  };

  const logger = createLogger(workerEnv);
  workerInstance = new GradientWorker(redis.client, logger, workerEnv);
  workerInstance.start();

  appLogger.info(
    { concurrency: env.GRADIENT_WORKER_CONCURRENCY },
    "[GradientWorker] Worker started",
  );
}

/**
 * Stop the gradient generation worker.
 */
export async function stopGradientWorker(): Promise<void> {
  if (!workerInstance?.isRunning()) {
    return;
  }

  await workerInstance.stop();
  workerInstance = null;

  appLogger.info("[GradientWorker] Worker stopped");
}

/**
 * Get the current queue length.
 */
export async function getQueueLength(): Promise<number> {
  return workerInstance?.getQueueLength() ?? 0;
}

/**
 * Get the current processing count.
 */
export async function getProcessingCount(): Promise<number> {
  return workerInstance?.getProcessingCount() ?? 0;
}

/**
 * Get the count of delayed jobs waiting for retry.
 */
export async function getDelayedCount(): Promise<number> {
  return workerInstance?.getDelayedCount() ?? 0;
}
