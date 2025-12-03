import type { GenerateGradientJobData } from "utils";
import { GRADIENT_JOB_QUEUE } from "worker-gradient";
import { appLogger } from "../middleware/logger.ts";
import redis from "../redis.ts";
import env from "../schemas/env.ts";

/**
 * Enqueue a gradient generation job for a standalone worker.
 */
export async function enqueueGradientJob(data: GenerateGradientJobData): Promise<string | null> {
  if (!env.GRADIENT_WORKER_ENABLED) {
    appLogger.debug(
      { storageKey: data.storageKey },
      "[GradientWorker] Worker disabled, skipping job enqueue",
    );
    return null;
  }

  try {
    // Generate a unique job ID
    const jobId = crypto.randomUUID();
    const jobPayload = { ...data, jobId };

    await redis.client.lPush(GRADIENT_JOB_QUEUE, JSON.stringify(jobPayload));
    appLogger.info({ jobId, storageKey: data.storageKey }, "Enqueued gradient job");
    return jobId;
  } catch (error) {
    appLogger.error({ error, storageKey: data.storageKey }, "Failed to enqueue gradient job");
    return null;
  }
}
