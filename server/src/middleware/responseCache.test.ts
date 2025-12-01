import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockRedisClient } from "../utils/test-mocks.ts";

vi.mock("../redis.ts", () => ({
  default: {
    client: mockRedisClient,
  },
}));

vi.mock("./logger.ts", () => ({
  appLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const { createResponseCache, invalidateGalleriesCache, invalidateDefaultGuildCache } = await import(
  "./responseCache.ts"
);

const createMockReq = (overrides: Partial<Request> = {}): Request => {
  const req: Partial<Request> = {
    method: "GET",
    originalUrl: "/api/test",
    query: {},
    session: { userId: "user-123" } as Request["session"],
    ...overrides,
  };
  return req as Request;
};

const createMockRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  res.statusCode = 200;
  return res as Response;
};

const createMockNext = (): NextFunction => vi.fn();

describe("responseCache middleware", () => {
  beforeEach(() => {
    Object.values(mockRedisClient).forEach((mockFn) => {
      if (typeof mockFn === "function" && "mockReset" in mockFn) {
        mockFn.mockReset();
      }
    });
  });

  describe("createResponseCache", () => {
    it("should skip caching for non-GET requests", async () => {
      const middleware = createResponseCache();
      const req = createMockReq({ method: "POST" });
      const res = createMockRes();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it("should return cached response on cache hit", async () => {
      const cachedData = JSON.stringify({ statusCode: 200, body: { data: "cached" } });
      mockRedisClient.get.mockResolvedValue(cachedData);

      const middleware = createResponseCache();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.set).toHaveBeenCalledWith("X-Cache", "HIT");
      expect(res.json).toHaveBeenCalledWith({ data: "cached" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should proceed and cache response on cache miss", async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setEx.mockResolvedValue("OK");

      const middleware = createResponseCache({ ttlSeconds: 300 });
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();

      // Simulate the response being sent
      res.json({ data: "new" });

      // Wait for the async setEx call
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        expect.stringContaining("cache:response:"),
        300,
        expect.stringContaining('"data":"new"'),
      );
    });

    it("should set X-Cache header to MISS on cache miss", async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setEx.mockResolvedValue("OK");

      const middleware = createResponseCache();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      await middleware(req, res, next);
      res.json({ data: "test" });

      expect(res.set).toHaveBeenCalledWith("X-Cache", "MISS");
    });

    it("should not cache non-2xx responses", async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setEx.mockResolvedValue("OK");

      const middleware = createResponseCache();
      const req = createMockReq();
      const res = createMockRes();
      res.statusCode = 400;
      const next = createMockNext();

      await middleware(req, res, next);
      res.json({ error: "bad request" });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });

    it("should proceed without caching on Redis error", async () => {
      mockRedisClient.get.mockRejectedValue(new Error("Redis connection failed"));

      const middleware = createResponseCache();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should use custom key generator when provided", async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const customKeyGenerator = vi.fn().mockReturnValue("custom:cache:key");

      const middleware = createResponseCache({ keyGenerator: customKeyGenerator });
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(customKeyGenerator).toHaveBeenCalledWith(req);
      expect(mockRedisClient.get).toHaveBeenCalledWith("custom:cache:key");
    });
  });

  describe("invalidateGalleriesCache", () => {
    it("should delete all cache keys matching the guild pattern using SCAN", async () => {
      const keys = [
        "cache:response:galleries:list:guild:123:user:a",
        "cache:response:galleries:list:guild:123:user:b",
      ];
      // SCAN returns cursor 0 to indicate completion
      mockRedisClient.scan.mockResolvedValue({ cursor: 0, keys });
      mockRedisClient.del.mockResolvedValue(2);

      await invalidateGalleriesCache("123", "user-a");

      expect(mockRedisClient.scan).toHaveBeenCalledWith(0, {
        MATCH: "cache:response:galleries:list:guild:123:*",
        COUNT: 100,
      });
      expect(mockRedisClient.del).toHaveBeenCalledWith(keys);
    });

    it("should not call del if no matching keys found", async () => {
      mockRedisClient.scan.mockResolvedValue({ cursor: 0, keys: [] });

      await invalidateGalleriesCache("123");

      expect(mockRedisClient.scan).toHaveBeenCalled();
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedisClient.scan.mockRejectedValue(new Error("Redis error"));

      await expect(invalidateGalleriesCache("123")).resolves.not.toThrow();
    });
  });

  describe("invalidateDefaultGuildCache", () => {
    it("should delete the cache key for the specified user", async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await invalidateDefaultGuildCache("user-123");

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        "cache:response:guilds:default:user:user-123",
      );
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedisClient.del.mockRejectedValue(new Error("Redis error"));

      await expect(invalidateDefaultGuildCache("user-123")).resolves.not.toThrow();
    });
  });
});
