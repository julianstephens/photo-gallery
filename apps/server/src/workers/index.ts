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

// Lock to prevent race conditions during initialization
let initializingPromise: Promise<GradientWorker> | null = null;

/**
 * Create worker environment configuration from server env.
 * This is extracted to avoid duplication between enqueueGradientJob and startGradientWorker.
 */
function createWorkerEnv() {
  return {
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
}

/**
 * Get or create the worker instance with proper synchronization.
 * Uses a promise-based lock to prevent race conditions during initialization.
 */
async function getOrCreateWorkerInstance(): Promise<GradientWorker> {
  // Fast path: instance already exists
  if (workerInstance) {
    return workerInstance;
  }

  // Check if another call is already initializing
  if (initializingPromise) {
    return initializingPromise;
  }

  // Create initialization promise
  initializingPromise = (async () => {
    // Double-check after acquiring "lock"
    if (workerInstance) {
      return workerInstance;
    }

    const workerEnv = createWorkerEnv();
    const logger = createLogger(workerEnv);
    workerInstance = new GradientWorker(redis.client, logger, workerEnv);
    return workerInstance;
  })();

  try {
    const instance = await initializingPromise;
    return instance;
  } finally {
    initializingPromise = null;
  }
}

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

  // Get or create worker instance with proper synchronization
  const instance = await getOrCreateWorkerInstance();
  return instance.enqueueJob(data);
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
export async function startGradientWorker(): Promise<void> {
  if (!env.GRADIENT_WORKER_ENABLED) {
    appLogger.info("[GradientWorker] Worker disabled by configuration");
    return;
  }

  const instance = await getOrCreateWorkerInstance();

  if (instance.isRunning()) {
    appLogger.warn("[GradientWorker] Worker already running");
    return;
  }

  instance.start();

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
  if (!workerInstance) {
    return 0;
  }
  return await workerInstance.getQueueLength();
}

/**
 * Get the current processing count.
 */
export async function getProcessingCount(): Promise<number> {
  if (!workerInstance) {
    return 0;
  }
  return await workerInstance.getProcessingCount();
}

/**
 * Get the count of delayed jobs waiting for retry.
 */
export async function getDelayedCount(): Promise<number> {
  if (!workerInstance) {
    return 0;
  }
  return await workerInstance.getDelayedCount();
}
