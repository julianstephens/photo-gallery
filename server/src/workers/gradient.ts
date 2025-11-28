import {
  generateGradientJobSchema,
  generateGradientWithPlaceholder,
  type GenerateGradientJobData,
  type ImageGradient,
} from "utils";
import { appLogger } from "../middleware/logger.ts";
import redis from "../redis.ts";
import env from "../schemas/env.ts";
import { BucketService } from "../services/bucket.ts";
import { GradientMetaService } from "../services/gradientMeta.ts";

const QUEUE_KEY = "gradient:queue";
const PROCESSING_KEY = "gradient:processing";
const DELAYED_KEY = "gradient:delayed"; // Sorted set for delayed retry jobs
const JOB_PREFIX = "gradient:job:";

// Metrics for monitoring
let jobsProcessed = 0;
let jobsFailed = 0;
let totalProcessingTimeMs = 0;

// Worker state
let workerRunning = false;
let workerIntervalId: ReturnType<typeof setInterval> | null = null;
let activeJobCount = 0; // Track currently processing jobs for concurrency control

/**
 * Get current metrics for monitoring.
 */
export function getGradientWorkerMetrics() {
  return {
    jobsProcessed,
    jobsFailed,
    avgProcessingTimeMs: jobsProcessed > 0 ? totalProcessingTimeMs / jobsProcessed : 0,
    isEnabled: env.GRADIENT_WORKER_ENABLED,
    isRunning: workerRunning,
    activeJobs: activeJobCount,
  };
}

/**
 * Generate a unique job ID from the storage key.
 */
function generateJobId(storageKey: string): string {
  return `gradient-${storageKey.replace(/\//g, "-")}`;
}

/**
 * Enqueue a gradient generation job.
 */
export async function enqueueGradientJob(data: GenerateGradientJobData): Promise<string | null> {
  if (!env.GRADIENT_WORKER_ENABLED) {
    appLogger.debug(
      { storageKey: data.storageKey },
      "[GradientWorker] Worker disabled, skipping job enqueue",
    );
    return null;
  }

  // Validate job data
  const parsed = generateGradientJobSchema.safeParse(data);
  if (!parsed.success) {
    appLogger.error({ data, error: parsed.error }, "[GradientWorker] Invalid job data");
    return null;
  }

  const jobId = generateJobId(data.storageKey);
  const jobKey = `${JOB_PREFIX}${jobId}`;

  // Check if job already exists
  const existingJob = await redis.client.get(jobKey);
  if (existingJob) {
    appLogger.debug({ jobId, storageKey: data.storageKey }, "[GradientWorker] Job already exists");
    return jobId;
  }

  // Mark as pending in metadata
  const gradientMetaService = new GradientMetaService();
  await gradientMetaService.markPending(data.storageKey);

  // Store job data
  const jobData = {
    ...data,
    jobId,
    attempts: 0,
    createdAt: Date.now(),
  };

  await redis.client.set(jobKey, JSON.stringify(jobData));
  await redis.client.expire(jobKey, 86400); // 24 hour TTL

  // Add to queue
  await redis.client.rPush(QUEUE_KEY, jobId);

  appLogger.info({ jobId, storageKey: data.storageKey }, "[GradientWorker] Job enqueued");

  return jobId;
}

/**
 * Process a single gradient generation job.
 * Exported for testing purposes.
 */
export async function processJob(jobId: string): Promise<void> {
  const jobKey = `${JOB_PREFIX}${jobId}`;
  const startTime = Date.now();

  // Get job data
  const jobDataStr = await redis.client.get(jobKey);
  if (!jobDataStr) {
    appLogger.warn({ jobId }, "[GradientWorker] Job not found, skipping");
    return;
  }

  let jobData: GenerateGradientJobData & { jobId: string; attempts: number; createdAt: number };
  try {
    jobData = JSON.parse(jobDataStr);
  } catch {
    appLogger.error({ jobId }, "[GradientWorker] Failed to parse job data");
    await redis.client.del(jobKey);
    return;
  }

  const { storageKey, guildId, galleryName } = jobData;
  const currentAttempt = jobData.attempts + 1;

  appLogger.info(
    { jobId, storageKey, guildId, galleryName, attempt: currentAttempt },
    "[GradientWorker] Processing job",
  );

  const bucketService = new BucketService();
  const gradientMetaService = new GradientMetaService();

  // Mark as processing
  await gradientMetaService.markProcessing(storageKey);

  // Update attempt count
  jobData.attempts = currentAttempt;
  await redis.client.set(jobKey, JSON.stringify(jobData));

  try {
    // Download the image buffer from S3
    const { data: imageBuffer } = await bucketService.getObject(storageKey);

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error(`Empty image buffer for key: ${storageKey}`);
    }

    // Generate gradient and placeholder
    const gradientResult = await generateGradientWithPlaceholder(imageBuffer);

    // Convert to ImageGradient type
    const gradient: ImageGradient = {
      palette: gradientResult.palette,
      primary: gradientResult.primary,
      secondary: gradientResult.secondary,
      foreground: gradientResult.foreground,
      css: gradientResult.css,
      blurDataUrl: gradientResult.placeholder,
    };

    // Save to metadata
    await gradientMetaService.markCompleted(storageKey, gradient);

    // Clean up job
    await redis.client.del(jobKey);
    await redis.client.lRem(PROCESSING_KEY, 0, jobId);

    const processingTime = Date.now() - startTime;
    jobsProcessed++;
    totalProcessingTimeMs += processingTime;

    appLogger.info(
      {
        jobId,
        storageKey,
        processingTimeMs: processingTime,
        primary: gradient.primary,
        secondary: gradient.secondary,
      },
      "[GradientWorker] Job completed successfully",
    );
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    appLogger.error(
      {
        jobId,
        storageKey,
        attempt: currentAttempt,
        maxAttempts: env.GRADIENT_JOB_MAX_RETRIES,
        processingTimeMs: processingTime,
        error: errorMessage,
      },
      "[GradientWorker] Job failed",
    );

    // Remove from processing list
    await redis.client.lRem(PROCESSING_KEY, 0, jobId);

    // Check if max retries reached
    if (currentAttempt >= env.GRADIENT_JOB_MAX_RETRIES) {
      jobsFailed++;
      // Mark as permanently failed (no-gradient)
      await gradientMetaService.markFailed(storageKey, errorMessage);
      // Clean up job
      await redis.client.del(jobKey);
      appLogger.warn(
        { jobId, storageKey },
        "[GradientWorker] Max retries reached, marking as no-gradient",
      );
    } else {
      // Schedule for delayed retry using Redis sorted set with timestamp as score
      const backoffMs = Math.pow(2, currentAttempt) * 1000; // 2^attempt seconds
      const retryAt = Date.now() + backoffMs;
      await redis.client.zAdd(DELAYED_KEY, { score: retryAt, value: jobId });
      appLogger.debug(
        { jobId, storageKey, backoffMs, retryAt },
        "[GradientWorker] Job scheduled for delayed retry",
      );
    }
  }
}

/**
 * Move delayed jobs that are ready back to the main queue.
 */
async function processDelayedJobs(): Promise<void> {
  try {
    const now = Date.now();
    // Get all jobs that are ready (score <= now)
    const readyJobs = await redis.client.zRangeByScore(DELAYED_KEY, 0, now);

    for (const jobId of readyJobs) {
      // Remove from delayed set and add to main queue
      const removed = await redis.client.zRem(DELAYED_KEY, jobId);
      if (removed > 0) {
        await redis.client.rPush(QUEUE_KEY, jobId);
        appLogger.debug({ jobId }, "[GradientWorker] Moved delayed job to queue");
      }
    }
  } catch (error) {
    appLogger.error({ error }, "[GradientWorker] Error processing delayed jobs");
  }
}

/**
 * Process jobs from the queue with concurrency control.
 */
async function processQueue(): Promise<void> {
  if (!workerRunning) return;

  // Check concurrency limit before acquiring a job
  if (activeJobCount >= env.GRADIENT_WORKER_CONCURRENCY) {
    return;
  }

  try {
    // Move job from queue to processing list atomically
    const jobId = await redis.client.lMove(QUEUE_KEY, PROCESSING_KEY, "LEFT", "RIGHT");

    if (jobId) {
      activeJobCount++;
      try {
        await processJob(jobId);
      } finally {
        activeJobCount--;
      }
    }
  } catch (error) {
    appLogger.error({ error }, "[GradientWorker] Error processing queue");
  }
}

/**
 * Start the gradient generation worker.
 */
export function startGradientWorker(): void {
  if (!env.GRADIENT_WORKER_ENABLED) {
    appLogger.info("[GradientWorker] Worker disabled by configuration");
    return;
  }

  if (workerRunning) {
    appLogger.warn("[GradientWorker] Worker already running");
    return;
  }

  workerRunning = true;
  activeJobCount = 0;

  // Process queue at regular intervals
  const pollIntervalMs = 1000; // Poll every second
  workerIntervalId = setInterval(() => {
    // Process delayed jobs first (move ready jobs to main queue)
    processDelayedJobs().catch((err) => {
      appLogger.error({ err }, "[GradientWorker] Error processing delayed jobs");
    });

    // Try to process jobs up to concurrency limit
    // The processQueue function checks concurrency internally
    const promises: Promise<void>[] = [];
    for (let i = 0; i < env.GRADIENT_WORKER_CONCURRENCY; i++) {
      promises.push(processQueue());
    }
    Promise.all(promises).catch((err) => {
      appLogger.error({ err }, "[GradientWorker] Error in worker loop");
    });
  }, pollIntervalMs);

  appLogger.info(
    { concurrency: env.GRADIENT_WORKER_CONCURRENCY },
    "[GradientWorker] Worker started",
  );
}

/**
 * Stop the gradient generation worker.
 */
export async function stopGradientWorker(): Promise<void> {
  if (!workerRunning) {
    return;
  }

  workerRunning = false;

  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }

  // Move any jobs in processing back to queue
  try {
    let jobId: string | null;
    while (
      (jobId = await redis.client.lMove(PROCESSING_KEY, QUEUE_KEY, "LEFT", "RIGHT")) !== null
    ) {
      appLogger.debug({ jobId }, "[GradientWorker] Moved job from processing back to queue");
    }
  } catch (error) {
    appLogger.error({ error }, "[GradientWorker] Error moving jobs back to queue");
  }

  appLogger.info("[GradientWorker] Worker stopped");
}

/**
 * Get the current queue length.
 */
export async function getQueueLength(): Promise<number> {
  return await redis.client.lLen(QUEUE_KEY);
}

/**
 * Get the current processing count.
 */
export async function getProcessingCount(): Promise<number> {
  return await redis.client.lLen(PROCESSING_KEY);
}

/**
 * Get the count of delayed jobs waiting for retry.
 */
export async function getDelayedCount(): Promise<number> {
  return await redis.client.zCard(DELAYED_KEY);
}
