import type { RedisClientType } from "redis";
import { generateGradientJobSchema, type GenerateGradientJobData, type ImageGradient } from "utils";
import { generateGradientWithPlaceholder } from "utils/server";
import { createBucketService, type BucketService } from "./bucket.js";
import type { Env } from "./env.js";
import { GradientMetaService } from "./gradientMeta.js";
import type { Logger } from "./logger.js";

export const GRADIENT_JOB_QUEUE = "gradient:queue";
const PROCESSING_KEY = "gradient:processing";
const DELAYED_KEY = "gradient:delayed"; // Sorted set for delayed retry jobs
const JOB_PREFIX = "gradient:job:";

interface WorkerStats {
  jobsProcessed: number;
  jobsFailed: number;
  totalProcessingTimeMs: number;
  activeJobs: number;
}

/**
 * Gradient Generation Worker
 *
 * This worker processes gradient generation jobs from a Redis queue.
 * It downloads images from S3, generates color gradients and blur placeholders,
 * then stores the results in Redis.
 */
export class GradientWorker {
  #redis: RedisClientType;
  #logger: Logger;
  #env: Env;
  #bucketService: BucketService;
  #gradientMetaService: GradientMetaService;
  #running: boolean = false;
  #intervalId: ReturnType<typeof setInterval> | null = null;
  #activeJobCount: number = 0;
  #stats: WorkerStats = {
    jobsProcessed: 0,
    jobsFailed: 0,
    totalProcessingTimeMs: 0,
    activeJobs: 0,
  };

  constructor(redis: RedisClientType, logger: Logger, env: Env) {
    this.#redis = redis;
    this.#logger = logger;
    this.#env = env;
    this.#bucketService = createBucketService(env);
    this.#gradientMetaService = new GradientMetaService(redis, logger);
  }

  /**
   * Generate a unique job ID from the storage key.
   */
  #generateJobId(storageKey: string): string {
    return `gradient-${storageKey.replace(/\//g, "-")}`;
  }

  /**
   * Enqueue a gradient generation job.
   */
  async enqueueJob(data: GenerateGradientJobData): Promise<string | null> {
    // Validate job data
    const parsed = generateGradientJobSchema.safeParse(data);
    if (!parsed.success) {
      this.#logger.error({ data, error: parsed.error }, "Invalid job data");
      return null;
    }

    const jobId = this.#generateJobId(data.storageKey);
    const jobKey = `${JOB_PREFIX}${jobId}`;

    // Check if job already exists
    const existingJob = await this.#redis.get(jobKey);
    if (existingJob) {
      this.#logger.debug({ jobId, storageKey: data.storageKey }, "Job already exists");
      return jobId;
    }

    // Mark as pending in metadata
    await this.#gradientMetaService.markPending(data.storageKey);

    // Store job data
    const jobData = {
      ...data,
      jobId,
      attempts: 0,
      createdAt: Date.now(),
    };

    await this.#redis.set(jobKey, JSON.stringify(jobData));
    await this.#redis.expire(jobKey, 86400); // 24 hour TTL

    // Add to queue
    await this.#redis.rPush(GRADIENT_JOB_QUEUE, jobId);

    this.#logger.info({ jobId, storageKey: data.storageKey }, "Job enqueued");

    return jobId;
  }

  /**
   * Process a single gradient generation job.
   */
  async processJob(jobId: string): Promise<void> {
    const jobKey = `${JOB_PREFIX}${jobId}`;
    const startTime = Date.now();

    // Get job data
    const jobDataStr = await this.#redis.get(jobKey);
    if (!jobDataStr) {
      this.#logger.warn({ jobId }, "Job not found, skipping");
      await this.#redis.lRem(PROCESSING_KEY, 0, jobId);
      return;
    }

    let jobData: GenerateGradientJobData & { jobId: string; attempts: number; createdAt: number };
    try {
      jobData = JSON.parse(jobDataStr);
    } catch {
      this.#logger.error({ jobId }, "Failed to parse job data");
      await this.#redis.del(jobKey);
      await this.#redis.lRem(PROCESSING_KEY, 0, jobId);
      return;
    }

    const { storageKey, guildId, galleryName } = jobData;
    const currentAttempt = jobData.attempts + 1;

    this.#logger.info(
      { jobId, storageKey, guildId, galleryName, attempt: currentAttempt },
      "Processing job",
    );

    // Mark as processing
    await this.#gradientMetaService.markProcessing(storageKey);

    // Update attempt count
    jobData.attempts = currentAttempt;
    await this.#redis.set(jobKey, JSON.stringify(jobData));

    try {
      // Download the image buffer from S3
      const { data: imageBuffer } = await this.#bucketService.getObject(storageKey);

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
      await this.#gradientMetaService.markCompleted(storageKey, gradient);

      // Clean up job
      await this.#redis.del(jobKey);
      await this.#redis.lRem(PROCESSING_KEY, 0, jobId);

      const processingTime = Date.now() - startTime;
      this.#stats.jobsProcessed++;
      this.#stats.totalProcessingTimeMs += processingTime;

      this.#logger.info(
        {
          jobId,
          storageKey,
          processingTimeMs: processingTime,
          primary: gradient.primary,
          secondary: gradient.secondary,
        },
        "Job completed successfully",
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.#logger.error(
        {
          jobId,
          storageKey,
          attempt: currentAttempt,
          maxAttempts: this.#env.GRADIENT_JOB_MAX_RETRIES,
          processingTimeMs: processingTime,
          error: errorMessage,
        },
        "Job failed",
      );

      // Remove from processing list
      await this.#redis.lRem(PROCESSING_KEY, 0, jobId);

      // Check if max retries reached
      if (currentAttempt >= this.#env.GRADIENT_JOB_MAX_RETRIES) {
        this.#stats.jobsFailed++;
        // Mark as permanently failed (no-gradient)
        await this.#gradientMetaService.markFailed(storageKey, errorMessage);
        // Clean up job
        await this.#redis.del(jobKey);
        this.#logger.warn({ jobId, storageKey }, "Max retries reached, marking as no-gradient");
      } else {
        // Schedule for delayed retry using Redis sorted set with timestamp as score
        const backoffMs = Math.pow(2, currentAttempt) * 1000; // 2^attempt seconds
        const retryAt = Date.now() + backoffMs;
        await this.#redis.zAdd(DELAYED_KEY, { score: retryAt, value: jobId });
        this.#logger.debug(
          { jobId, storageKey, backoffMs, retryAt },
          "Job scheduled for delayed retry",
        );
      }
    }
  }

  /**
   * Move delayed jobs that are ready back to the main queue.
   */
  async #processDelayedJobs(): Promise<void> {
    try {
      const now = Date.now();
      // Get all jobs that are ready (score <= now)
      const readyJobs = await this.#redis.zRangeByScore(DELAYED_KEY, 0, now);

      for (const jobId of readyJobs) {
        // Remove from delayed set and add to main queue
        const removed = await this.#redis.zRem(DELAYED_KEY, jobId);
        if (removed > 0) {
          await this.#redis.rPush(GRADIENT_JOB_QUEUE, jobId);
          this.#logger.debug({ jobId }, "Moved delayed job to queue");
        }
      }
    } catch (error) {
      this.#logger.error({ error }, "Error processing delayed jobs");
    }
  }

  /**
   * Process jobs from the queue with concurrency control.
   */
  async #processQueue(): Promise<void> {
    if (!this.#running) return;

    // Check concurrency limit before acquiring a job
    if (this.#activeJobCount >= this.#env.GRADIENT_WORKER_CONCURRENCY) {
      return;
    }

    try {
      // Move job from queue to processing list atomically
      const jobId = await this.#redis.lMove(GRADIENT_JOB_QUEUE, PROCESSING_KEY, "LEFT", "RIGHT");

      if (jobId) {
        this.#activeJobCount++;
        this.#stats.activeJobs = this.#activeJobCount;
        try {
          await this.processJob(jobId);
        } finally {
          this.#activeJobCount--;
          this.#stats.activeJobs = this.#activeJobCount;
        }
      }
    } catch (error) {
      this.#logger.error({ error }, "Error processing queue");
    }
  }

  /**
   * Start the gradient generation worker.
   */
  start(): void {
    if (this.#running) {
      this.#logger.warn("Worker already running");
      return;
    }

    this.#running = true;
    this.#activeJobCount = 0;

    // Process queue at regular intervals
    const pollIntervalMs = this.#env.GRADIENT_WORKER_POLL_INTERVAL_MS;
    this.#intervalId = setInterval(() => {
      // Process delayed jobs first (move ready jobs to main queue)
      this.#processDelayedJobs().catch((err) => {
        this.#logger.error({ err }, "Error processing delayed jobs");
      });

      // Try to process jobs up to concurrency limit
      const promises: Promise<void>[] = [];
      for (let i = 0; i < this.#env.GRADIENT_WORKER_CONCURRENCY; i++) {
        promises.push(this.#processQueue());
      }
      Promise.all(promises).catch((err) => {
        this.#logger.error({ err }, "Error in worker loop");
      });
    }, pollIntervalMs);

    this.#logger.info({ concurrency: this.#env.GRADIENT_WORKER_CONCURRENCY }, "Worker started");
  }

  /**
   * Stop the gradient generation worker.
   */
  async stop(): Promise<void> {
    if (!this.#running) {
      return;
    }

    this.#running = false;

    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }

    // Move any jobs in processing back to queue
    try {
      let jobId: string | null;
      while (
        (jobId = await this.#redis.lMove(PROCESSING_KEY, GRADIENT_JOB_QUEUE, "LEFT", "RIGHT")) !==
        null
      ) {
        this.#logger.debug({ jobId }, "Moved job from processing back to queue");
      }
    } catch (error) {
      this.#logger.error({ error }, "Error moving jobs back to queue");
    }

    this.#logger.info("Worker stopped");
  }

  /**
   * Get the current queue length.
   */
  async getQueueLength(): Promise<number> {
    return await this.#redis.lLen(GRADIENT_JOB_QUEUE);
  }

  /**
   * Get the current processing count.
   */
  async getProcessingCount(): Promise<number> {
    return await this.#redis.lLen(PROCESSING_KEY);
  }

  /**
   * Get the count of delayed jobs waiting for retry.
   */
  async getDelayedCount(): Promise<number> {
    return await this.#redis.zCard(DELAYED_KEY);
  }

  /**
   * Get current worker metrics.
   */
  getStats(): WorkerStats & { isRunning: boolean; avgProcessingTimeMs: number } {
    return {
      ...this.#stats,
      isRunning: this.#running,
      avgProcessingTimeMs:
        this.#stats.jobsProcessed > 0
          ? this.#stats.totalProcessingTimeMs / this.#stats.jobsProcessed
          : 0,
    };
  }

  /**
   * Check if worker is running.
   */
  isRunning(): boolean {
    return this.#running;
  }
}
