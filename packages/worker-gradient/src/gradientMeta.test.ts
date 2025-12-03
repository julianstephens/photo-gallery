import type { RedisClientType } from "redis";
import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradientMetaService } from "./gradientMeta.js";

// Create mock Redis client for testing
function createMockRedisClient() {
  const store = new Map<string, string>();

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
    _store: store,
    _clear: () => store.clear(),
    asRedis: function () {
      return this as unknown as RedisClientType;
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

describe("GradientMetaService", () => {
  let mockRedis: ReturnType<typeof createMockRedisClient>;
  let mockLogger: Logger;
  let service: GradientMetaService;

  beforeEach(() => {
    mockRedis = createMockRedisClient();
    mockLogger = createMockLogger();
    service = new GradientMetaService(mockRedis.asRedis(), mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockRedis._clear();
  });

  describe("getGradient", () => {
    it("should return null when gradient not found", async () => {
      const result = await service.getGradient("test/image.jpg");

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith("gradient:test/image.jpg");
    });

    it("should return stored gradient data", async () => {
      const storedData = {
        status: "completed",
        gradient: {
          primary: "#FF0000",
          secondary: "#00FF00",
          foreground: "#FFFFFF",
          css: "linear-gradient(135deg, #FF0000 0%, #00FF00 100%)",
        },
        attempts: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockRedis._store.set("gradient:test/image.jpg", JSON.stringify(storedData));

      const result = await service.getGradient("test/image.jpg");

      expect(result).toBeTruthy();
      expect(result?.status).toBe("completed");
      expect(result?.gradient?.primary).toBe("#FF0000");
    });

    it("should return null for invalid JSON", async () => {
      mockRedis._store.set("gradient:test/image.jpg", "invalid json");

      const result = await service.getGradient("test/image.jpg");

      expect(result).toBeNull();
    });
  });

  describe("setGradient", () => {
    it("should save gradient with pending status", async () => {
      await service.setGradient("test/image.jpg", "pending");

      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();

      const savedData = JSON.parse(mockRedis._store.get("gradient:test/image.jpg") || "{}");
      expect(savedData.status).toBe("pending");
      expect(savedData.createdAt).toBeDefined();
      expect(savedData.updatedAt).toBeDefined();
    });

    it("should save gradient with completed status and gradient data", async () => {
      const gradient = {
        primary: "#FF0000",
        secondary: "#00FF00",
        foreground: "#FFFFFF",
        css: "linear-gradient(135deg, #FF0000 0%, #00FF00 100%)",
      };

      await service.setGradient("test/image.jpg", "completed", gradient);

      const savedData = JSON.parse(mockRedis._store.get("gradient:test/image.jpg") || "{}");
      expect(savedData.status).toBe("completed");
      expect(savedData.gradient).toEqual(gradient);
    });

    it("should save gradient with failed status and error message", async () => {
      await service.setGradient("test/image.jpg", "failed", undefined, "Network error");

      const savedData = JSON.parse(mockRedis._store.get("gradient:test/image.jpg") || "{}");
      expect(savedData.status).toBe("failed");
      expect(savedData.lastError).toBe("Network error");
    });

    it("should preserve existing attempts and createdAt", async () => {
      const existingData = {
        status: "pending",
        attempts: 2,
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 5000,
      };
      mockRedis._store.set("gradient:test/image.jpg", JSON.stringify(existingData));

      await service.setGradient("test/image.jpg", "processing");

      const savedData = JSON.parse(mockRedis._store.get("gradient:test/image.jpg") || "{}");
      expect(savedData.attempts).toBe(2);
      expect(savedData.createdAt).toBe(existingData.createdAt);
    });
  });

  describe("markPending", () => {
    it("should mark gradient as pending", async () => {
      await service.markPending("test/image.jpg");

      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();

      const savedData = JSON.parse(mockRedis._store.get("gradient:test/image.jpg") || "{}");
      expect(savedData.status).toBe("pending");
    });

    it("should not overwrite completed gradient", async () => {
      const completedData = {
        status: "completed",
        gradient: { primary: "#FF0000" },
        attempts: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockRedis._store.set("gradient:test/image.jpg", JSON.stringify(completedData));

      await service.markPending("test/image.jpg");

      // set should not have been called since it was already completed
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe("markProcessing", () => {
    it("should mark gradient as processing", async () => {
      const pendingData = {
        status: "pending",
        attempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockRedis._store.set("gradient:test/image.jpg", JSON.stringify(pendingData));

      await service.markProcessing("test/image.jpg");

      expect(mockRedis.set).toHaveBeenCalled();
      const savedData = JSON.parse(mockRedis._store.get("gradient:test/image.jpg") || "{}");
      expect(savedData.status).toBe("processing");
    });

    it("should do nothing if gradient not found", async () => {
      await service.markProcessing("test/image.jpg");

      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe("markCompleted", () => {
    it("should mark gradient as completed with gradient data", async () => {
      const gradient = {
        primary: "#FF0000",
        secondary: "#00FF00",
        foreground: "#FFFFFF",
        css: "linear-gradient(135deg, #FF0000 0%, #00FF00 100%)",
      };

      await service.markCompleted("test/image.jpg", gradient);

      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();

      const savedData = JSON.parse(mockRedis._store.get("gradient:test/image.jpg") || "{}");
      expect(savedData.status).toBe("completed");
      expect(savedData.gradient).toEqual(gradient);
    });
  });

  describe("markFailed", () => {
    it("should mark gradient as failed with error message", async () => {
      await service.markFailed("test/image.jpg", "Download failed");

      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();

      const savedData = JSON.parse(mockRedis._store.get("gradient:test/image.jpg") || "{}");
      expect(savedData.status).toBe("failed");
      expect(savedData.lastError).toBe("Download failed");
    });
  });

  describe("key prefix", () => {
    it("should use gradient: prefix for all keys", async () => {
      await service.setGradient("gallery/photo.jpg", "pending");

      expect(mockRedis.set).toHaveBeenCalledWith("gradient:gallery/photo.jpg", expect.any(String));
    });
  });

  describe("TTL", () => {
    it("should set 30-day TTL on gradient metadata", async () => {
      await service.setGradient("test/image.jpg", "pending");

      // 30 days in seconds
      const expectedTTL = 30 * 24 * 60 * 60;
      expect(mockRedis.expire).toHaveBeenCalledWith("gradient:test/image.jpg", expectedTTL);
    });
  });
});
