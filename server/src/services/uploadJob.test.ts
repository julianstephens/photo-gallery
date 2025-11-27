import type { UploadJobProgress } from "utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockRedisModule } from "../utils/test-mocks.ts";
import { UploadJobService } from "./uploadJob.ts";

// Mock redis
vi.mock("../redis.ts", () => mockRedisModule());

// Import redis after mock
import redis from "../redis.ts";

describe("UploadJobService", () => {
  let service: UploadJobService;

  beforeEach(() => {
    service = new UploadJobService();
    vi.clearAllMocks();
  });

  describe("createJob", () => {
    it("should create a new upload job", async () => {
      const guildId = "guild123";
      const galleryName = "test-gallery";
      const filename = "test.zip";
      const fileSize = 1024;

      const jobId = await service.createJob(guildId, galleryName, filename, fileSize);

      expect(jobId).toBeTruthy();
      expect(typeof jobId).toBe("string");
      expect(redis.client.hSet).toHaveBeenCalled();
      expect(redis.client.expire).toHaveBeenCalled();
      expect(redis.client.rPush).toHaveBeenCalled();
    });
  });

  describe("getJob", () => {
    it("should return null for non-existent job", async () => {
      vi.mocked(redis.client.hGetAll).mockResolvedValue({});

      const job = await service.getJob("non-existent");

      expect(job).toBeNull();
    });

    it("should return job data for existing job", async () => {
      const mockJobData = {
        jobId: "job123",
        status: "pending",
        galleryName: "test-gallery",
        guildId: "guild123",
        filename: "test.zip",
        fileSize: "1024",
        createdAt: String(Date.now()),
      };

      vi.mocked(redis.client.hGetAll).mockResolvedValue(mockJobData);

      const job = await service.getJob("job123");

      expect(job).toBeTruthy();
      expect(job?.jobId).toBe("job123");
      expect(job?.status).toBe("pending");
      expect(job?.fileSize).toBe(1024);
    });

    it("should parse progress data if present", async () => {
      const progress: UploadJobProgress = {
        processedFiles: 5,
        totalFiles: 10,
        uploadedFiles: [],
        failedFiles: [],
      };

      const mockJobData = {
        jobId: "job123",
        status: "processing",
        galleryName: "test-gallery",
        guildId: "guild123",
        filename: "test.zip",
        fileSize: "1024",
        createdAt: String(Date.now()),
        progress: JSON.stringify(progress),
      };

      vi.mocked(redis.client.hGetAll).mockResolvedValue(mockJobData);

      const job = await service.getJob("job123");

      expect(job?.progress).toBeTruthy();
      expect(job?.progress?.processedFiles).toBe(5);
      expect(job?.progress?.totalFiles).toBe(10);
    });
  });

  describe("updateJobStatus", () => {
    it("should update job status", async () => {
      vi.mocked(redis.client.exists).mockResolvedValue(1);

      await service.updateJobStatus("job123", "processing");

      expect(redis.client.exists).toHaveBeenCalledWith("upload:job:job123");
      expect(redis.client.hSet).toHaveBeenCalled();
      const callArgs = vi.mocked(redis.client.hSet).mock.calls[0];
      expect(callArgs[0]).toBe("upload:job:job123");
      expect(callArgs[1]).toHaveProperty("status", "processing");
    });

    it("should set startedAt when status changes to processing", async () => {
      vi.mocked(redis.client.exists).mockResolvedValue(1);
      vi.mocked(redis.client.hGet).mockResolvedValue(null);

      await service.updateJobStatus("job123", "processing");

      const callArgs = vi.mocked(redis.client.hSet).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("startedAt");
    });

    it("should set completedAt when status is completed or failed", async () => {
      vi.mocked(redis.client.exists).mockResolvedValue(1);

      await service.updateJobStatus("job123", "completed");

      const callArgs = vi.mocked(redis.client.hSet).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("completedAt");
    });

    it("should set error message when provided", async () => {
      vi.mocked(redis.client.exists).mockResolvedValue(1);

      await service.updateJobStatus("job123", "failed", "Test error");

      const callArgs = vi.mocked(redis.client.hSet).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("error", "Test error");
    });
  });

  describe("updateJobProgress", () => {
    it("should update job progress", async () => {
      vi.mocked(redis.client.exists).mockResolvedValue(1);

      const progress: UploadJobProgress = {
        processedFiles: 5,
        totalFiles: 10,
        uploadedFiles: [],
        failedFiles: [],
      };

      await service.updateJobProgress("job123", progress);

      expect(redis.client.exists).toHaveBeenCalledWith("upload:job:job123");
      expect(redis.client.hSet).toHaveBeenCalled();
      const callArgs = vi.mocked(redis.client.hSet).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("progress");
    });

    it("should throw error when job does not exist", async () => {
      vi.mocked(redis.client.exists).mockResolvedValue(0);

      const progress: UploadJobProgress = {
        processedFiles: 5,
        totalFiles: 10,
        uploadedFiles: [],
        failedFiles: [],
      };

      await expect(service.updateJobProgress("nonexistent", progress)).rejects.toThrow(
        "Job nonexistent does not exist",
      );
    });
  });

  describe("deleteJob", () => {
    it("should delete job and remove from list", async () => {
      await service.deleteJob("job123");

      expect(redis.client.del).toHaveBeenCalledWith("upload:job:job123");
      expect(redis.client.lRem).toHaveBeenCalledWith("upload:jobs", 0, "job123");
    });
  });
});
