import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockBucketServiceModule, mockLoggerModule, mockRedisModule } from "../utils/test-mocks.ts";

// Mock env with worker enabled
const mockEnvEnabled = {
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  PORT: 4000,
  S3_ENDPOINT: "http://s3.test",
  S3_ACCESS_KEY: "test-access",
  S3_SECRET_KEY: "test-secret",
  MASTER_BUCKET_NAME: "master-bucket",
  DISCORD_API_URL: "https://discord.com/api",
  DISCORD_CLIENT_ID: "test-client-id",
  DISCORD_CLIENT_SECRET: "test-client-secret",
  DISCORD_REDIRECT_URI: "http://localhost/callback",
  CLIENT_URL: "http://localhost:3000",
  REDIS_HOST: "localhost",
  REDIS_PORT: 6379,
  REDIS_USER: "test-user",
  REDIS_PASSWORD: "test-password",
  REDIS_DB: 1,
  SESSION_SECRET: "test-session-secret",
  CORS_ORIGINS: "http://localhost:3000",
  CORS_CREDENTIALS: true,
  JSON_LIMIT: "1mb",
  URLENCODED_LIMIT: "1mb",
  ADMIN_USER_IDS: ["admin-user-1", "admin-user-2"],
  GRADIENT_WORKER_ENABLED: true,
  GRADIENT_WORKER_CONCURRENCY: 2,
  GRADIENT_JOB_MAX_RETRIES: 3,
  GRADIENT_WORKER_POLL_INTERVAL_MS: 1000,
};

const mockEnvDisabled = {
  ...mockEnvEnabled,
  GRADIENT_WORKER_ENABLED: false,
};

vi.mock("../middleware/logger.ts", () => mockLoggerModule());
vi.mock("../redis.ts", () => mockRedisModule());
vi.mock("../services/bucket.ts", () => mockBucketServiceModule());

// Create a mock for GradientMetaService as a proper class mock
const mockMarkPending = vi.fn();
const mockMarkProcessing = vi.fn();
const mockMarkCompleted = vi.fn();
const mockMarkFailed = vi.fn();
const mockGetGradient = vi.fn();

vi.mock("../services/gradientMeta.ts", () => ({
  GradientMetaService: class MockGradientMetaService {
    markPending = mockMarkPending;
    markProcessing = mockMarkProcessing;
    markCompleted = mockMarkCompleted;
    markFailed = mockMarkFailed;
    getGradient = mockGetGradient;
  },
}));

// Mock utils gradient generation
const mockGenerateGradient = vi.fn().mockResolvedValue({
  palette: ["#FF0000", "#00FF00"],
  primary: "#FF0000",
  secondary: "#00FF00",
  foreground: "#FFFFFF",
  css: "linear-gradient(135deg, #FF0000 0%, #00FF00 100%)",
  placeholder: "data:image/jpeg;base64,test",
});

vi.mock("utils/server", async () => {
  const actual = await vi.importActual("utils/server");
  return {
    ...actual,
    generateGradientWithPlaceholder: mockGenerateGradient,
  };
});

import redis from "../redis.ts";

describe("GradientWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGenerateGradient.mockResolvedValue({
      palette: ["#FF0000", "#00FF00"],
      primary: "#FF0000",
      secondary: "#00FF00",
      foreground: "#FFFFFF",
      css: "linear-gradient(135deg, #FF0000 0%, #00FF00 100%)",
      placeholder: "data:image/jpeg;base64,test",
    });
  });

  describe("enqueueGradientJob", () => {
    it("should return null when worker is disabled", async () => {
      vi.doMock("../schemas/env.ts", () => ({ default: mockEnvDisabled }));

      // Re-import to get fresh module with new env
      const { enqueueGradientJob } = await import("./gradient.ts");

      const result = await enqueueGradientJob({
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      expect(result).toBeNull();
    });

    it("should enqueue job and return job ID when worker is enabled", async () => {
      vi.doMock("../schemas/env.ts", () => ({ default: mockEnvEnabled }));
      vi.mocked(redis.client.get).mockResolvedValue(null); // No existing job
      vi.mocked(redis.client.rPush).mockResolvedValue(1);

      const { enqueueGradientJob } = await import("./gradient.ts");

      const result = await enqueueGradientJob({
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      expect(result).toBeTruthy();
      expect(result).toContain("gradient-");
      expect(mockMarkPending).toHaveBeenCalledWith("test/image.jpg");
      expect(redis.client.set).toHaveBeenCalled();
      expect(redis.client.rPush).toHaveBeenCalledWith("gradient:queue", expect.any(String));
    });

    it("should return existing job ID if job already exists", async () => {
      vi.doMock("../schemas/env.ts", () => ({ default: mockEnvEnabled }));
      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify({ jobId: "existing-job" }));

      const { enqueueGradientJob } = await import("./gradient.ts");

      const result = await enqueueGradientJob({
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      expect(result).toBe("gradient-test-image.jpg");
      expect(redis.client.set).not.toHaveBeenCalled();
      expect(redis.client.rPush).not.toHaveBeenCalled();
    });

    it("should return null for invalid job data", async () => {
      vi.doMock("../schemas/env.ts", () => ({ default: mockEnvEnabled }));

      const { enqueueGradientJob } = await import("./gradient.ts");

      const result = await enqueueGradientJob({
        guildId: "",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      expect(result).toBeNull();
    });
  });

  describe("getGradientWorkerMetrics", () => {
    it("should return worker metrics including activeJobs", async () => {
      vi.doMock("../schemas/env.ts", () => ({ default: mockEnvEnabled }));

      const { getGradientWorkerMetrics } = await import("./gradient.ts");

      const metrics = getGradientWorkerMetrics();

      expect(metrics).toHaveProperty("jobsProcessed");
      expect(metrics).toHaveProperty("jobsFailed");
      expect(metrics).toHaveProperty("avgProcessingTimeMs");
      expect(metrics).toHaveProperty("isEnabled");
      expect(metrics).toHaveProperty("isRunning");
      expect(metrics).toHaveProperty("activeJobs");
    });
  });

  describe("startGradientWorker", () => {
    it("should not start when worker is disabled", async () => {
      vi.doMock("../schemas/env.ts", () => ({ default: mockEnvDisabled }));

      const { startGradientWorker, getGradientWorkerMetrics } = await import("./gradient.ts");

      startGradientWorker();

      const metrics = getGradientWorkerMetrics();
      expect(metrics.isRunning).toBe(false);
    });
  });

  describe("stopGradientWorker", () => {
    it("should stop the worker gracefully", async () => {
      vi.doMock("../schemas/env.ts", () => ({ default: mockEnvEnabled }));
      vi.mocked(redis.client.lMove).mockResolvedValue(null); // No jobs to move

      const { startGradientWorker, stopGradientWorker, getGradientWorkerMetrics } = await import(
        "./gradient.ts"
      );

      startGradientWorker();
      await stopGradientWorker();

      const metrics = getGradientWorkerMetrics();
      expect(metrics.isRunning).toBe(false);
    });
  });

  describe("getQueueLength", () => {
    it("should return the queue length", async () => {
      vi.doMock("../schemas/env.ts", () => ({ default: mockEnvEnabled }));
      vi.mocked(redis.client.lLen).mockResolvedValue(5);

      const { getQueueLength } = await import("./gradient.ts");

      const length = await getQueueLength();

      expect(length).toBe(5);
      expect(redis.client.lLen).toHaveBeenCalledWith("gradient:queue");
    });
  });

  describe("getProcessingCount", () => {
    it("should return the processing count", async () => {
      vi.doMock("../schemas/env.ts", () => ({ default: mockEnvEnabled }));
      vi.mocked(redis.client.lLen).mockResolvedValue(2);

      const { getProcessingCount } = await import("./gradient.ts");

      const count = await getProcessingCount();

      expect(count).toBe(2);
      expect(redis.client.lLen).toHaveBeenCalledWith("gradient:processing");
    });
  });

  describe("getDelayedCount", () => {
    it("should return the delayed jobs count", async () => {
      vi.doMock("../schemas/env.ts", () => ({ default: mockEnvEnabled }));
      vi.mocked(redis.client.zCard).mockResolvedValue(3);

      const { getDelayedCount } = await import("./gradient.ts");

      const count = await getDelayedCount();

      expect(count).toBe(3);
      expect(redis.client.zCard).toHaveBeenCalledWith("gradient:delayed");
    });
  });
});
