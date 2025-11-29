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
      const filename = "test.jpg";
      const fileSize = 1024;

      const jobId = await service.createJob(guildId, galleryName, filename, fileSize);

      expect(jobId).toBeTruthy();
      expect(typeof jobId).toBe("string");
      expect(redis.client.set).toHaveBeenCalled();
      expect(redis.client.expire).toHaveBeenCalled();
      expect(redis.client.rPush).toHaveBeenCalled();
    });
  });

  describe("getJob", () => {
    it("should return null for non-existent job", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

      const job = await service.getJob("non-existent");

      expect(job).toBeNull();
    });

    it("should return job data for existing job", async () => {
      const mockJob = {
        jobId: "job123",
        status: "pending",
        galleryName: "test-gallery",
        guildId: "guild123",
        filename: "test.jpg",
        fileSize: 1024,
        createdAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockJob));

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

      const mockJob = {
        jobId: "job123",
        status: "processing",
        galleryName: "test-gallery",
        guildId: "guild123",
        filename: "test.jpg",
        fileSize: 1024,
        createdAt: Date.now(),
        progress,
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockJob));

      const job = await service.getJob("job123");

      expect(job?.progress).toBeTruthy();
      expect(job?.progress?.processedFiles).toBe(5);
      expect(job?.progress?.totalFiles).toBe(10);
    });
  });

  describe("updateJobStatus", () => {
    it("should update job status", async () => {
      const mockJob = {
        jobId: "job123",
        status: "pending",
        galleryName: "test-gallery",
        guildId: "guild123",
        filename: "test.jpg",
        fileSize: 1024,
        createdAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockJob));

      await service.updateJobStatus("job123", "processing");

      expect(redis.client.get).toHaveBeenCalledWith("upload:job:job123");
      expect(redis.client.set).toHaveBeenCalled();
      const callArgs = vi.mocked(redis.client.set).mock.calls[0];
      expect(callArgs[0]).toBe("upload:job:job123");
      const updatedJob = JSON.parse(callArgs[1]);
      expect(updatedJob.status).toBe("processing");
    });

    it("should set startedAt when status changes to processing", async () => {
      const mockJob = {
        jobId: "job123",
        status: "pending",
        galleryName: "test-gallery",
        guildId: "guild123",
        filename: "test.jpg",
        fileSize: 1024,
        createdAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockJob));

      await service.updateJobStatus("job123", "processing");

      const callArgs = vi.mocked(redis.client.set).mock.calls[0];
      const updatedJob = JSON.parse(callArgs[1]);
      expect(updatedJob.startedAt).toBeDefined();
    });

    it("should set completedAt when status is completed or failed", async () => {
      const mockJob = {
        jobId: "job123",
        status: "processing",
        galleryName: "test-gallery",
        guildId: "guild123",
        filename: "test.jpg",
        fileSize: 1024,
        createdAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockJob));

      await service.updateJobStatus("job123", "completed");

      const callArgs = vi.mocked(redis.client.set).mock.calls[0];
      const updatedJob = JSON.parse(callArgs[1]);
      expect(updatedJob.completedAt).toBeDefined();
    });

    it("should set error message when provided", async () => {
      const mockJob = {
        jobId: "job123",
        status: "processing",
        galleryName: "test-gallery",
        guildId: "guild123",
        filename: "test.jpg",
        fileSize: 1024,
        createdAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockJob));

      await service.updateJobStatus("job123", "failed", "Test error");

      const callArgs = vi.mocked(redis.client.set).mock.calls[0];
      const updatedJob = JSON.parse(callArgs[1]);
      expect(updatedJob.error).toBe("Test error");
    });
  });

  describe("updateJobProgress", () => {
    it("should update job progress", async () => {
      const mockJob = {
        jobId: "job123",
        status: "processing",
        galleryName: "test-gallery",
        guildId: "guild123",
        filename: "test.jpg",
        fileSize: 1024,
        createdAt: Date.now(),
      };

      const progress: UploadJobProgress = {
        processedFiles: 5,
        totalFiles: 10,
        uploadedFiles: [],
        failedFiles: [],
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockJob));

      await service.updateJobProgress("job123", progress);

      expect(redis.client.get).toHaveBeenCalledWith("upload:job:job123");
      expect(redis.client.set).toHaveBeenCalled();
      const callArgs = vi.mocked(redis.client.set).mock.calls[0];
      const updatedJob = JSON.parse(callArgs[1]);
      expect(updatedJob.progress).toEqual(progress);
    });

    it("should throw error when job does not exist", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

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
