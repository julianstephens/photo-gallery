import { randomUUID } from "crypto";
import type { UploadJob, UploadJobProgress, UploadJobStatus } from "utils";
import redis from "../redis.ts";

const UPLOAD_JOBS_PREFIX = "upload:job:";
const UPLOAD_JOBS_LIST = "upload:jobs";
const JOB_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export class UploadJobService {
  #buildJobKey = (jobId: string) => `${UPLOAD_JOBS_PREFIX}${jobId}`;

  createJob = async (
    guildId: string,
    galleryName: string,
    filename: string,
    fileSize: number,
  ): Promise<string> => {
    const jobId = randomUUID();
    const job: UploadJob = {
      jobId,
      status: "pending",
      galleryName,
      guildId,
      filename,
      fileSize,
      createdAt: Date.now(),
    };

    const jobKey = this.#buildJobKey(jobId);
    await redis.client.hSet(jobKey, {
      jobId,
      status: job.status,
      galleryName,
      guildId,
      filename,
      fileSize: String(fileSize),
      createdAt: String(job.createdAt),
    });
    await redis.client.expire(jobKey, JOB_TTL_SECONDS);
    await redis.client.rPush(UPLOAD_JOBS_LIST, jobId);

    return jobId;
  };

  getJob = async (jobId: string): Promise<UploadJob | null> => {
    const jobKey = this.#buildJobKey(jobId);
    const data = await redis.client.hGetAll(jobKey);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const job: UploadJob = {
      jobId: data.jobId,
      status: data.status as UploadJobStatus,
      galleryName: data.galleryName,
      guildId: data.guildId,
      filename: data.filename,
      fileSize: Number(data.fileSize),
      createdAt: Number(data.createdAt),
      startedAt: data.startedAt ? Number(data.startedAt) : undefined,
      completedAt: data.completedAt ? Number(data.completedAt) : undefined,
      error: data.error,
    };

    // Parse progress if it exists
    if (data.progress) {
      try {
        job.progress = JSON.parse(data.progress) as UploadJobProgress;
      } catch {
        // Ignore parse errors
      }
    }

    return job;
  };

  updateJobStatus = async (jobId: string, status: UploadJobStatus, error?: string) => {
    const jobKey = this.#buildJobKey(jobId);

    // Validate job exists before updating to prevent creating incomplete entries
    const exists = await redis.client.exists(jobKey);
    if (!exists) {
      throw new Error(`Job ${jobId} does not exist`);
    }

    const updates: Record<string, string> = { status };

    if (status === "processing" && !(await redis.client.hGet(jobKey, "startedAt"))) {
      updates.startedAt = String(Date.now());
    }

    if (status === "completed" || status === "failed") {
      updates.completedAt = String(Date.now());
    }

    if (error) {
      updates.error = error;
    }

    await redis.client.hSet(jobKey, updates);
  };

  updateJobProgress = async (jobId: string, progress: UploadJobProgress) => {
    const jobKey = this.#buildJobKey(jobId);

    // Validate job exists before updating to prevent creating incomplete entries
    const exists = await redis.client.exists(jobKey);
    if (!exists) {
      throw new Error(`Job ${jobId} does not exist`);
    }

    await redis.client.hSet(jobKey, {
      progress: JSON.stringify(progress),
    });
  };

  deleteJob = async (jobId: string) => {
    const jobKey = this.#buildJobKey(jobId);
    await redis.client.del(jobKey);
    await redis.client.lRem(UPLOAD_JOBS_LIST, 0, jobId);
  };
}
