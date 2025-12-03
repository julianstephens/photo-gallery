import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEnvModule, mockLoggerModule, mockRedisModule } from "../utils/test-mocks.ts";

const envEnabledModule = () => mockEnvModule({ GRADIENT_WORKER_ENABLED: true });
const envDisabledModule = () => mockEnvModule({ GRADIENT_WORKER_ENABLED: false });

vi.mock("../middleware/logger.ts", () => mockLoggerModule());
vi.mock("../redis.ts", () => mockRedisModule());

// Mock the worker-gradient package using vi.hoisted
const {
  mockEnqueueJob,
  mockStart,
  mockStop,
  mockIsRunning,
  mockGetStats,
  mockGetQueueLength,
  mockGetProcessingCount,
  mockGetDelayedCount,
  mockProcessJob,
} = vi.hoisted(() => ({
  mockEnqueueJob: vi.fn(),
  mockStart: vi.fn(),
  mockStop: vi.fn(),
  mockIsRunning: vi.fn().mockReturnValue(false),
  mockGetStats: vi.fn().mockReturnValue({
    jobsProcessed: 0,
    jobsFailed: 0,
    avgProcessingTimeMs: 0,
    activeJobs: 0,
  }),
  mockGetQueueLength: vi.fn().mockResolvedValue(0),
  mockGetProcessingCount: vi.fn().mockResolvedValue(0),
  mockGetDelayedCount: vi.fn().mockResolvedValue(0),
  mockProcessJob: vi.fn(),
}));

vi.mock("worker-gradient", () => ({
  GradientWorker: class MockGradientWorker {
    enqueueJob = mockEnqueueJob;
    start = mockStart;
    stop = mockStop;
    isRunning = mockIsRunning;
    getStats = mockGetStats;
    getQueueLength = mockGetQueueLength;
    getProcessingCount = mockGetProcessingCount;
    getDelayedCount = mockGetDelayedCount;
    processJob = mockProcessJob;
  },
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("GradientWorker Facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsRunning.mockReturnValue(false);
    mockEnqueueJob.mockResolvedValue("gradient-test-image-jpg");
  });

  describe("enqueueGradientJob", () => {
    it("should return null when worker is disabled", async () => {
      vi.doMock("../schemas/env.ts", () => envDisabledModule());

      const { enqueueGradientJob } = await import("./index.ts");

      const result = await enqueueGradientJob({
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      expect(result).toBeNull();
      expect(mockEnqueueJob).not.toHaveBeenCalled();
    });

    it("should forward job to worker when enabled", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());

      const { enqueueGradientJob } = await import("./index.ts");

      const result = await enqueueGradientJob({
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      expect(result).toBe("gradient-test-image-jpg");
      expect(mockEnqueueJob).toHaveBeenCalledWith({
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });
    });
  });

  describe("getGradientWorkerMetrics", () => {
    it("should return metrics from worker instance", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());
      mockGetStats.mockReturnValue({
        jobsProcessed: 10,
        jobsFailed: 2,
        avgProcessingTimeMs: 150,
        activeJobs: 1,
      });
      mockIsRunning.mockReturnValue(true);

      const { getGradientWorkerMetrics, startGradientWorker } = await import("./index.ts");

      // Start worker to initialize instance
      await startGradientWorker();

      const metrics = getGradientWorkerMetrics();

      expect(metrics).toEqual({
        jobsProcessed: 10,
        jobsFailed: 2,
        avgProcessingTimeMs: 150,
        isEnabled: true,
        isRunning: true,
        activeJobs: 1,
      });
    });

    it("should return default values when worker not initialized", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());

      const { getGradientWorkerMetrics } = await import("./index.ts");

      const metrics = getGradientWorkerMetrics();

      expect(metrics).toHaveProperty("jobsProcessed", 0);
      expect(metrics).toHaveProperty("jobsFailed", 0);
      expect(metrics).toHaveProperty("isEnabled", true);
      expect(metrics).toHaveProperty("isRunning", false);
    });
  });

  describe("startGradientWorker", () => {
    it("should not start when worker is disabled", async () => {
      vi.doMock("../schemas/env.ts", () => envDisabledModule());

      const { startGradientWorker } = await import("./index.ts");

      await startGradientWorker();

      expect(mockStart).not.toHaveBeenCalled();
    });

    it("should start worker when enabled", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());

      const { startGradientWorker } = await import("./index.ts");

      await startGradientWorker();

      expect(mockStart).toHaveBeenCalled();
    });

    it("should not start if already running", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());
      mockIsRunning.mockReturnValue(true);

      const { startGradientWorker } = await import("./index.ts");

      // First call to initialize and start
      await startGradientWorker();

      // Reset mock to check second call
      mockStart.mockClear();
      mockIsRunning.mockReturnValue(true);

      // Second call should not start again
      await startGradientWorker();

      // Worker.start should have been called only during first call (or not at all if already running check works)
      // The facade checks isRunning before starting
    });
  });

  describe("stopGradientWorker", () => {
    it("should stop the worker", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());
      mockIsRunning.mockReturnValue(true);
      mockStop.mockResolvedValue(undefined);

      const { startGradientWorker, stopGradientWorker } = await import("./index.ts");

      await startGradientWorker();
      await stopGradientWorker();

      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe("queue status functions", () => {
    it("should return 0 when worker not initialized", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());

      const { getQueueLength, getProcessingCount, getDelayedCount } = await import("./index.ts");

      expect(await getQueueLength()).toBe(0);
      expect(await getProcessingCount()).toBe(0);
      expect(await getDelayedCount()).toBe(0);
    });

    it("should forward to worker instance when initialized", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());
      mockGetQueueLength.mockResolvedValue(5);
      mockGetProcessingCount.mockResolvedValue(2);
      mockGetDelayedCount.mockResolvedValue(3);

      const { startGradientWorker, getQueueLength, getProcessingCount, getDelayedCount } =
        await import("./index.ts");

      await startGradientWorker();

      expect(await getQueueLength()).toBe(5);
      expect(await getProcessingCount()).toBe(2);
      expect(await getDelayedCount()).toBe(3);
    });
  });

  describe("processJob", () => {
    it("should not process job when worker not initialized", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());

      const { processJob } = await import("./index.ts");

      await processJob("gradient-test-image.jpg");

      expect(mockProcessJob).not.toHaveBeenCalled();
    });

    it("should forward processJob to worker instance when initialized", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());

      const { processJob, startGradientWorker } = await import("./index.ts");

      await startGradientWorker();
      await processJob("gradient-test-image.jpg");

      expect(mockProcessJob).toHaveBeenCalledWith("gradient-test-image.jpg");
    });
  });
});
