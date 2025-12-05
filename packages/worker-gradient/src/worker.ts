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

// The payload that will be stored in the Redis queue
type JobPayload = GenerateGradientJobData & {
  jobId: string;
  attempts: number;
  createdAt: number;
};

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
  #listenPromise: Promise<void> | null = null;
  #inFlightJobs: Set<Promise<void>> = new Set();
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
   * Process a single gradient generation job.
   * The payload is the full job data, received directly from the queue.
   */
  async processJob(jobPayloadStr: string): Promise<void> {
    const startTime = Date.now();

    let jobData: JobPayload;
    try {
      const parsedPayload = JSON.parse(jobPayloadStr);
      // We still validate here to ensure the payload from the queue is correct
      const validated = generateGradientJobSchema.safeParse(parsedPayload);
      if (!validated.success) {
        throw new Error(`Invalid job payload: ${validated.error.message}`);
      }
      if (!parsedPayload.jobId) {
        throw new Error("Job payload missing jobId");
      }
      jobData = {
        ...validated.data,
        jobId: parsedPayload.jobId,
        attempts: parsedPayload.attempts || 0,
        createdAt: parsedPayload.createdAt || Date.now(),
      };
    } catch (e) {
      this.#logger.error(
        { error: e, payload: jobPayloadStr },
        "Failed to parse job data, discarding",
      );
      // Cannot process or retry, so we just drop it
      return;
    }

    const { jobId, storageKey, guildId, galleryName } = jobData;
    const currentAttempt = jobData.attempts + 1;

    this.#logger.info(
      { jobId, storageKey, guildId, galleryName, attempt: currentAttempt },
      "Processing job",
    );

    // Mark as processing in metadata
    await this.#gradientMetaService.markProcessing(storageKey);

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

      // Check if max retries reached
      if (currentAttempt >= this.#env.GRADIENT_JOB_MAX_RETRIES) {
        this.#stats.jobsFailed++;
        // Mark as permanently failed (no-gradient)
        await this.#gradientMetaService.markFailed(storageKey, errorMessage);
        this.#logger.warn({ jobId, storageKey }, "Max retries reached, marking as no-gradient");
      } else {
        // Schedule for delayed retry with updated attempt count
        const backoffMs = Math.pow(2, currentAttempt) * 1000; // 2^attempt seconds
        const retryAt = Date.now() + backoffMs;
        const nextPayload: JobPayload = { ...jobData, attempts: currentAttempt };

        await this.#redis.zAdd(DELAYED_KEY, {
          score: retryAt,
          value: JSON.stringify(nextPayload),
        });

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
    let readyJobs: string[] | undefined;
    try {
      const now = Date.now();
      // Get all jobs that are ready (score <= now)
      readyJobs = await this.#redis.zRangeByScore(DELAYED_KEY, 0, now);

      if (readyJobs.length > 0) {
        // Atomically remove from sorted set and push to queue
        const multi = this.#redis.multi();
        multi.zRem(DELAYED_KEY, readyJobs);
        multi.rPush(GRADIENT_JOB_QUEUE, readyJobs);
        await multi.exec();

        this.#logger.debug({ count: readyJobs.length }, "Moved delayed jobs to queue");
      }
    } catch (error) {
      this.#logger.error(
        { error, readyJobsCount: readyJobs?.length },
        "Error processing delayed jobs",
      );
      // Don't rethrow - this is called from setInterval and should not break the loop
    }
  }

  /**
   * Starts the worker.
   * It begins listening for jobs on the queue and processing delayed jobs.
   */
  start(): void {
    if (this.#running) {
      this.#logger.warn("Worker already running");
      return;
    }

    this.#running = true;
    this.#logger.info({ concurrency: this.#env.GRADIENT_WORKER_CONCURRENCY }, "Worker started");
    // Start the two main loops, but don't wait for them here.
    // listenForJobs will only exit when #running is false.
    this.#listenPromise = this.listenForJobs();
    this.#intervalId = setInterval(() => this.#processDelayedJobs(), 5000); // Check every 5s
  }

  /**
   * Stops the worker gracefully.
   * It will finish any in-flight job and wait for the listen loop to exit.
   */
  async stop(): Promise<void> {
    if (!this.#running) {
      this.#logger.warn("Worker is not running");
      return;
    }

    this.#logger.info("Stopping worker...");
    this.#running = false;

    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }

    // Wait for the listenForJobs loop to finish. This can take up to the
    // blMove timeout (5s) plus any final processing.
    if (this.#listenPromise) {
      await this.#listenPromise;
    }

    // Wait for all in-flight jobs to complete
    if (this.#inFlightJobs.size > 0) {
      this.#logger.info(
        { count: this.#inFlightJobs.size },
        "Waiting for in-flight jobs to complete...",
      );
      await Promise.all(this.#inFlightJobs);
    }

    this.#logger.info("Worker stopped gracefully.");
  }

  /**
   * Process jobs from the queue.
   * This method is called by the listening loop and should not be called directly.
   */
  async listenForJobs(): Promise<void> {
    this.#logger.info("Worker is now listening for jobs on the queue...");
    while (this.#running) {
      // Check concurrency limit before acquiring a new job
      if (this.#activeJobCount >= this.#env.GRADIENT_WORKER_CONCURRENCY) {
        // If at capacity, wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      try {
        // Use a blocking pop to wait for a job for up to 5 seconds
        const jobPayload = await this.#redis.blMove(
          GRADIENT_JOB_QUEUE,
          PROCESSING_KEY,
          "LEFT",
          "RIGHT",
          5, // 5-second timeout
        );

        if (jobPayload) {
          // Increment the active job count immediately to prevent race conditions
          // where the loop checks the limit before the async job increments the counter
          this.#activeJobCount++;
          this.#stats.activeJobs = this.#activeJobCount;

          // Process the job without awaiting it to allow for concurrency
          // Track the promise so we can wait for it during shutdown
          // Create wrapped promise with cleanup to avoid race conditions
          const jobPromise = this.processJobWithConcurrency(jobPayload).finally(() => {
            this.#inFlightJobs.delete(jobPromise);
          });
          this.#inFlightJobs.add(jobPromise);
        }
        // If jobPayload is null, the timeout was reached, and the loop will continue
      } catch (error) {
        this.#logger.error({ error }, "Error listening for jobs, retrying in 5s...");
        // Avoid a tight loop on persistent Redis errors
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    this.#logger.info("Worker has stopped listening for jobs.");
  }

  /**
   * Wrapper to process a job and handle concurrency counting.
   * Note: #activeJobCount is incremented by the caller before this method is called
   * to prevent race conditions in the concurrency check.
   */
  async processJobWithConcurrency(jobPayload: string): Promise<void> {
    try {
      await this.processJob(jobPayload);
    } catch (error) {
      let jobId = "unknown";
      try {
        jobId = JSON.parse(jobPayload)?.jobId || "unknown";
      } catch {
        // ignore parse errors, jobId stays "unknown"
      }
      this.#logger.error({ error, jobId }, "Unhandled error in processJobWithConcurrency");
    } finally {
      // We move the job out of the processing list here, after it's done.
      await this.#redis.lRem(PROCESSING_KEY, 1, jobPayload);
      // Guard against going negative if called directly without prior increment
      if (this.#activeJobCount > 0) {
        this.#activeJobCount--;
      }
      this.#stats.activeJobs = this.#activeJobCount;
    }
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
