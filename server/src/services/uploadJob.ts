import { randomUUID } from "crypto";
import type { UploadJob, UploadJobProgress, UploadJobStatus } from "utils";
import redis from "../redis.ts";

const UPLOAD_JOBS_PREFIX = "upload:job:";
const UPLOAD_JOBS_LIST = "upload:jobs";
const JOB_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const TERMINAL_JOB_TTL_SECONDS = 10 * 60; // Keep completed jobs for 10 minutes

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
    await redis.client.set(jobKey, JSON.stringify(job));
    await redis.client.expire(jobKey, JOB_TTL_SECONDS);
    await redis.client.rPush(UPLOAD_JOBS_LIST, jobId);

    return jobId;
  };

  getJob = async (jobId: string): Promise<UploadJob | null> => {
    const jobKey = this.#buildJobKey(jobId);
    const jobJson = await redis.client.get(jobKey);

    if (!jobJson) {
      return null;
    }

    try {
      const job = JSON.parse(jobJson) as UploadJob;
      return job;
    } catch (error) {
      console.error(`Failed to parse upload job ${jobId}:`, error);
      return null;
    }
  };

  updateJobStatus = async (jobId: string, status: UploadJobStatus, error?: string) => {
    const jobKey = this.#buildJobKey(jobId);

    // Get current job
    const jobJson = await redis.client.get(jobKey);
    if (!jobJson) {
      throw new Error(`Job ${jobId} does not exist`);
    }

    const job = JSON.parse(jobJson) as UploadJob;
    job.status = status;

    if (status === "processing" && !job.startedAt) {
      job.startedAt = Date.now();
    }

    if (status === "completed" || status === "failed") {
      job.completedAt = Date.now();
    }

    if (error) {
      job.error = error;
    }

    await redis.client.set(jobKey, JSON.stringify(job));
  };

  updateJobProgress = async (jobId: string, progress: UploadJobProgress) => {
    const jobKey = this.#buildJobKey(jobId);

    // Get current job
    const jobJson = await redis.client.get(jobKey);
    if (!jobJson) {
      throw new Error(`Job ${jobId} does not exist`);
    }

    const job = JSON.parse(jobJson) as UploadJob;
    job.progress = progress;

    const updatedJson = JSON.stringify(job);
    await redis.client.set(jobKey, updatedJson);
  };

  deleteJob = async (jobId: string) => {
    const jobKey = this.#buildJobKey(jobId);
    await redis.client.del(jobKey);
    await redis.client.lRem(UPLOAD_JOBS_LIST, 0, jobId);
  };

  finalizeJob = async (jobId: string) => {
    const jobKey = this.#buildJobKey(jobId);
    const exists = await redis.client.exists(jobKey);
    if (!exists) {
      return;
    }
    // For completed/failed jobs, keep them in the list for a short time so clients can see final state
    // They will be automatically removed when the key expires
    await redis.client.expire(jobKey, TERMINAL_JOB_TTL_SECONDS);
    // Don't remove from list immediately - let clients see the final state
  };

  getAllJobs = async (): Promise<UploadJob[]> => {
    const jobIds = await redis.client.lRange(UPLOAD_JOBS_LIST, 0, -1);
    const jobs: UploadJob[] = [];

    for (const jobId of jobIds) {
      const job = await this.getJob(jobId);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs;
  };
}
