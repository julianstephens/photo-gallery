/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Logger } from "pino";
import type { RedisClientType } from "redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBucketService } from "./bucket.js";
import type { Env } from "./env.js";
import { GradientWorker } from "./worker.js";

// Mock the bucket service
vi.mock("./bucket.js");

// Mock utils gradient generation
vi.mock("utils/server", () => ({
  generateGradientWithPlaceholder: vi.fn().mockResolvedValue({
    palette: ["#FF0000", "#00FF00"],
    primary: "#FF0000",
    secondary: "#00FF00",
    foreground: "#FFFFFF",
    css: "linear-gradient(135deg, #FF0000 0%, #00FF00 100%)",
    placeholder: "data:image/jpeg;base64,test",
  }),
}));

// Create comprehensive mock Redis client for gradient worker
function createMockRedisClient(): ReturnType<typeof createMockRedisClientInner> & {
  asRedis: () => RedisClientType;
} {
  const mock = createMockRedisClientInner();
  return {
    ...mock,
    asRedis: () => mock as unknown as RedisClientType,
  };
}

function createMockRedisClientInner() {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const sortedSets = new Map<string, Map<string, number>>();

  const lMove = vi.fn((src: string, dest: string, srcDir: string, _destDir: string) => {
    const srcList = lists.get(src) || [];
    if (srcList.length === 0) return Promise.resolve(null);
    const item = srcDir === "LEFT" ? srcList.shift()! : srcList.pop()!;
    if (!lists.has(dest)) lists.set(dest, []);
    lists.get(dest)!.push(item);
    return Promise.resolve(item);
  });

  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
    set: vi.fn((key: string, value: string, _opts?: any) => {
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    expire: vi.fn(() => Promise.resolve(1)),
    rPush: vi.fn((key: string, value: string) => {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key)!.push(value);
      return Promise.resolve(lists.get(key)!.length);
    }),
    lLen: vi.fn((key: string) => Promise.resolve(lists.get(key)?.length ?? 0)),
    lRem: vi.fn((key: string, _count: number, value: string) => {
      const list = lists.get(key);
      if (list) {
        const idx = list.indexOf(value);
        if (idx > -1) list.splice(idx, 1);
      }
      return Promise.resolve(1);
    }),
    lMove,
    blMove: lMove, // Add blMove as an alias for lMove for the mock
    zAdd: vi.fn((key: string, item: { score: number; value: string }) => {
      if (!sortedSets.has(key)) sortedSets.set(key, new Map());
      sortedSets.get(key)!.set(item.value, item.score);
      return Promise.resolve(1);
    }),
    zRem: vi.fn((key: string, value: string) => {
      const set = sortedSets.get(key);
      if (set) {
        set.delete(value);
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    }),
    zCard: vi.fn((key: string) => Promise.resolve(sortedSets.get(key)?.size ?? 0)),
    zRangeByScore: vi.fn((key: string, min: number, max: number) =>
      Promise.resolve(
        Array.from(sortedSets.get(key)?.entries() || [])
          .filter(([, score]) => score >= min && score <= max)
          .map(([value]) => value),
      ),
    ),
    multi: vi.fn(() => {
      const commands: (() => void)[] = [];
      const multiChain = {
        zRem: vi.fn((key: string, values: string | string[]) => {
          const vals = Array.isArray(values) ? values : [values];
          commands.push(() => {
            const set = sortedSets.get(key);
            if (set) {
              vals.forEach((v) => set.delete(v));
            }
          });
          return multiChain;
        }),
        rPush: vi.fn((key: string, values: string | string[]) => {
          const vals = Array.isArray(values) ? values : [values];
          commands.push(() => {
            if (!lists.has(key)) lists.set(key, []);
            lists.get(key)!.push(...vals);
          });
          return multiChain;
        }),
        exec: vi.fn(async () => {
          commands.forEach((cmd) => cmd());
          return Promise.resolve([]);
        }),
      };
      return multiChain;
    }),
    _store: store,
    _lists: lists,
    _sortedSets: sortedSets,
    _clear: () => {
      store.clear();
      lists.clear();
      sortedSets.clear();
    },
  };
}

// Create mock logger
function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  } as unknown as Logger;
}

// Create mock env
function createMockEnv(): Env {
  return {
    REDIS_URL: "redis://localhost:6379",
    LOG_LEVEL: "info",
    S3_ENDPOINT: "http://localhost:9000",
    S3_ACCESS_KEY: "test-access-key",
    S3_SECRET_KEY: "test-secret-key",
    MASTER_BUCKET_NAME: "test-bucket",
    GRADIENT_WORKER_CONCURRENCY: 2,
    GRADIENT_JOB_MAX_RETRIES: 3,
    GRADIENT_WORKER_POLL_INTERVAL_MS: 1000,
  };
}

describe("GradientWorker", () => {
  let mockRedis: ReturnType<typeof createMockRedisClient>;
  let mockLogger: Logger;
  let mockEnv: Env;

  beforeEach(() => {
    mockRedis = createMockRedisClient();
    mockLogger = createMockLogger();
    mockEnv = createMockEnv();
    vi.mocked(createBucketService).mockReturnValue({
      getObject: vi.fn().mockResolvedValue({
        data: Buffer.from("fake-image-data"),
        contentType: "image/jpeg",
      }),
      ensureBucket: vi.fn().mockResolvedValue(undefined),
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create a worker instance", () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);
      expect(worker).toBeDefined();
      expect(worker.isRunning()).toBe(false);
    });
  });

  describe("start/stop", () => {
    it("should start and stop the worker", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);
      // Prevent the actual loop from running in this test
      const listenSpy = vi.spyOn(worker, "listenForJobs").mockResolvedValue();

      expect(worker.isRunning()).toBe(false);

      worker.start();
      expect(worker.isRunning()).toBe(true);
      expect(listenSpy).toHaveBeenCalled();

      await worker.stop();
      expect(worker.isRunning()).toBe(false);
    });

    it("should wait for the listen loop to finish on stop", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

      let listenLoopFinished = false;
      const _listenSpy = vi.spyOn(worker, "listenForJobs").mockImplementation(async () => {
        // Simulate a delay, like waiting for blMove
        await new Promise((resolve) => setTimeout(resolve, 50));
        listenLoopFinished = true;
      });

      worker.start();
      expect(worker.isRunning()).toBe(true);

      await worker.stop();

      expect(listenLoopFinished).toBe(true);
      expect(worker.isRunning()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith("Worker stopped gracefully.");
    });

    it("should not start if already running", () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);
      // Prevent the actual loop from running in this test
      vi.spyOn(worker, "listenForJobs").mockResolvedValue();

      worker.start();
      worker.start(); // Should warn but not error

      expect(mockLogger.warn).toHaveBeenCalledWith("Worker already running");
    });
  });

  describe("getStats", () => {
    it("should return initial stats", () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

      const stats = worker.getStats();

      expect(stats.jobsProcessed).toBe(0);
      expect(stats.jobsFailed).toBe(0);
      expect(stats.activeJobs).toBe(0);
      expect(stats.isRunning).toBe(false);
      expect(stats.avgProcessingTimeMs).toBe(0);
    });
  });

  describe("queue operations", () => {
    it("should return queue length", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);
      mockRedis.lLen.mockResolvedValue(5);
      const length = await worker.getQueueLength();
      expect(length).toBe(5);
    });

    it("should return processing count", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);
      mockRedis.lLen.mockResolvedValue(2);
      const count = await worker.getProcessingCount();
      expect(count).toBe(2);
    });

    it("should return delayed count", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);
      mockRedis.zCard.mockResolvedValue(3);
      const count = await worker.getDelayedCount();
      expect(count).toBe(3);
    });
  });

  describe("delayed jobs", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should move ready delayed jobs back to the main queue", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);
      // Prevent the listen loop from running and interfering
      vi.spyOn(worker, "listenForJobs").mockResolvedValue();

      // Add some jobs to the delayed queue
      const now = Date.now();
      const job1 = { jobId: "job1", attempts: 1, createdAt: now };
      const job2 = { jobId: "job2", attempts: 1, createdAt: now };
      const futureJob = { jobId: "job3", attempts: 1, createdAt: now };

      // Add jobs that are ready now
      await mockRedis.zAdd("gradient:delayed", { score: now - 1000, value: JSON.stringify(job1) });
      await mockRedis.zAdd("gradient:delayed", { score: now, value: JSON.stringify(job2) });
      // Add a job that is not ready yet
      await mockRedis.zAdd("gradient:delayed", {
        score: now + 60000,
        value: JSON.stringify(futureJob),
      });

      worker.start();

      // Advance timers to trigger the setInterval for processing delayed jobs
      await vi.advanceTimersByTimeAsync(5000);

      // Verify that zRem and rPush were called inside a multi block
      expect(mockRedis.multi).toHaveBeenCalled();
      const multi = mockRedis.multi.mock.results[0].value;
      expect(multi.zRem).toHaveBeenCalledWith("gradient:delayed", [
        JSON.stringify(job1),
        JSON.stringify(job2),
      ]);
      expect(multi.rPush).toHaveBeenCalledWith("gradient:queue", [
        JSON.stringify(job1),
        JSON.stringify(job2),
      ]);
      expect(multi.exec).toHaveBeenCalled();

      // Verify the state of the queues
      expect(await mockRedis.zCard("gradient:delayed")).toBe(1);
      expect(await mockRedis.lLen("gradient:queue")).toBe(2);
      expect(mockLogger.debug).toHaveBeenCalledWith({ count: 2 }, "Moved delayed jobs to queue");

      await worker.stop();
    });
  });
});

describe("processJob", () => {
  let mockRedis: ReturnType<typeof createMockRedisClient>;
  let mockLogger: Logger;
  let mockEnv: Env;

  beforeEach(() => {
    mockRedis = createMockRedisClient();
    mockLogger = createMockLogger();
    mockEnv = createMockEnv();
    vi.mocked(createBucketService).mockReturnValue({
      getObject: vi.fn().mockResolvedValue({
        data: Buffer.from("fake-image-data"),
        contentType: "image/jpeg",
      }),
      ensureBucket: vi.fn().mockResolvedValue(undefined),
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should discard a job with invalid JSON payload", async () => {
    const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);
    const invalidPayload = "not-a-json";

    await worker.processJob(invalidPayload);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ payload: invalidPayload }),
      "Failed to parse job data, discarding",
    );
  });

  it("should process a valid job successfully", async () => {
    const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

    const jobPayload = {
      guildId: "guild123",
      galleryName: "test-gallery",
      storageKey: "test/image.jpg",
      itemId: "test-image-jpg",
      jobId: "job-123",
      attempts: 0,
      createdAt: Date.now(),
    };

    await worker.processJob(JSON.stringify(jobPayload));

    // Verify job completed
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-123",
        storageKey: "test/image.jpg",
      }),
      "Job completed successfully",
    );
    // Verify gradient data is stored in Redis (called via GradientMetaService.markCompleted)
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it("should move a failed job to the delayed queue for retry", async () => {
    // Force getObject to fail for this test
    vi.mocked(createBucketService).mockReturnValue({
      getObject: vi.fn().mockRejectedValue(new Error("S3 download failed")),
      ensureBucket: vi.fn().mockResolvedValue(undefined),
    } as any);

    const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

    const jobPayload = {
      guildId: "guild123",
      galleryName: "test-gallery",
      storageKey: "test/image.jpg",
      itemId: "test-image-jpg",
      jobId: "job-123",
      attempts: 0,
      createdAt: Date.now(),
    };

    await worker.processJob(JSON.stringify(jobPayload));

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-123",
        storageKey: "test/image.jpg",
        attempt: 1,
      }),
      "Job failed",
    );

    // Verify it was added to the delayed queue
    expect(mockRedis.zAdd).toHaveBeenCalledWith(
      "gradient:delayed",
      expect.objectContaining({
        value: expect.any(String),
        score: expect.any(Number),
      }),
    );
    const delayedJobPayload = JSON.parse(mockRedis.zAdd.mock.calls[0][1].value);
    expect(delayedJobPayload.attempts).toBe(1); // Attempt count should be incremented
  });

  it("should discard a job that has exceeded max retries", async () => {
    // Force getObject to fail for this test
    vi.mocked(createBucketService).mockReturnValue({
      getObject: vi.fn().mockRejectedValue(new Error("S3 download failed")),
      ensureBucket: vi.fn().mockResolvedValue(undefined),
    } as any);
    const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

    const jobPayload = {
      guildId: "guild123",
      galleryName: "test-gallery",
      storageKey: "test/image.jpg",
      itemId: "test-image-jpg",
      jobId: "job-123",
      attempts: mockEnv.GRADIENT_JOB_MAX_RETRIES, // Job is already at max retries
      createdAt: Date.now(),
    };

    await worker.processJob(JSON.stringify(jobPayload));

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-123",
        attempt: mockEnv.GRADIENT_JOB_MAX_RETRIES + 1,
      }),
      "Job failed",
    );

    // Verify it was NOT added to the delayed queue again
    expect(mockRedis.zAdd).not.toHaveBeenCalled();
  });
});
