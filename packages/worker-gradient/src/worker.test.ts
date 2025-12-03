import type { RedisClientType } from "redis";
import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env.js";
import { GradientWorker } from "./worker.js";

// Mock the bucket service - now mocking the createBucketService function
vi.mock("./bucket.js", () => ({
  createBucketService: vi.fn(() => ({
    getObject: vi.fn().mockResolvedValue({
      data: Buffer.from("fake-image-data"),
      contentType: "image/jpeg",
    }),
    ensureBucket: vi.fn().mockResolvedValue(undefined),
  })),
  BucketService: class MockBucketService {
    getObject = vi.fn().mockResolvedValue({
      data: Buffer.from("fake-image-data"),
      contentType: "image/jpeg",
    });
  },
}));

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

  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
    set: vi.fn((key: string, value: string) => {
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
    lMove: vi.fn((src: string, dest: string, srcDir: string, _destDir: string) => {
      const srcList = lists.get(src) || [];
      if (srcList.length === 0) return Promise.resolve(null);
      const item = srcDir === "LEFT" ? srcList.shift()! : srcList.pop()!;
      if (!lists.has(dest)) lists.set(dest, []);
      lists.get(dest)!.push(item);
      return Promise.resolve(item);
    }),
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

  describe("enqueueJob", () => {
    it("should enqueue a valid job", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

      const jobId = await worker.enqueueJob({
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      expect(jobId).toBeTruthy();
      expect(jobId).toContain("gradient-");
    });

    it("should return null for invalid job data", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

      const jobId = await worker.enqueueJob({
        guildId: "", // Invalid: empty guildId
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      expect(jobId).toBeNull();
    });

    it("should return existing job ID if job already exists", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

      // First enqueue
      const jobId1 = await worker.enqueueJob({
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      // Second enqueue with same data
      const jobId2 = await worker.enqueueJob({
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      expect(jobId1).toBe(jobId2);
    });
  });

  describe("start/stop", () => {
    it("should start and stop the worker", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

      expect(worker.isRunning()).toBe(false);

      worker.start();
      expect(worker.isRunning()).toBe(true);

      await worker.stop();
      expect(worker.isRunning()).toBe(false);
    });

    it("should not start if already running", () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

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

      const length = await worker.getQueueLength();
      expect(typeof length).toBe("number");
    });

    it("should return processing count", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

      const count = await worker.getProcessingCount();
      expect(typeof count).toBe("number");
    });

    it("should return delayed count", async () => {
      const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

      const count = await worker.getDelayedCount();
      expect(typeof count).toBe("number");
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should skip processing when job data is not found", async () => {
    const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

    await worker.processJob("non-existent-job");

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { jobId: "non-existent-job" },
      "Job not found, skipping",
    );
  });

  it("should process a valid job successfully", async () => {
    const worker = new GradientWorker(mockRedis.asRedis(), mockLogger, mockEnv);

    // Enqueue a job first
    const jobId = await worker.enqueueJob({
      guildId: "guild123",
      galleryName: "test-gallery",
      storageKey: "test/image.jpg",
      itemId: "test-image-jpg",
    });

    expect(jobId).toBeTruthy();

    // Process the job
    await worker.processJob(jobId!);

    // Verify job completed
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId,
        storageKey: "test/image.jpg",
        primary: "#FF0000",
        secondary: "#00FF00",
      }),
      "Job completed successfully",
    );
  });
});
