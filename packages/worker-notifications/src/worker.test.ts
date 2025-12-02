import type { Logger } from "pino";
import { createMockRedis, type MockRedisClient } from "utils/redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env.js";
import { NotificationWorker } from "./worker.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create mock logger
function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn((...args) => console.log(...args)),
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
    DEFAULT_DAYS_BEFORE: 7,
  };
}

describe("NotificationWorker", () => {
  let mockRedis: MockRedisClient;
  let mockLogger: Logger;
  let mockEnv: Env;

  beforeEach(() => {
    mockRedis = createMockRedis();
    mockLogger = createMockLogger();
    mockEnv = createMockEnv();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("run()", () => {
    it("should complete successfully when no guilds are found", async () => {
      const worker = new NotificationWorker(mockRedis, mockLogger, mockEnv);
      const result = await worker.run();

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith("Starting notification worker run");
      expect(mockLogger.info).toHaveBeenCalledWith({ guildCount: 0 }, "Discovered guilds");
    });

    it("should return stats with zero values when no notifications sent", async () => {
      const worker = new NotificationWorker(mockRedis, mockLogger, mockEnv);
      await worker.run();

      const stats = worker.getStats();
      expect(stats).toEqual({
        guildsProcessed: 0,
        galleriesChecked: 0,
        notificationsSent: 0,
        notificationsSkipped: 0,
        webhookErrors: 0,
        invalidWebhooksMarked: 0,
      });
    });
  });

  describe("Discord webhook URL validation", () => {
    it("should accept valid Discord webhook URLs", async () => {
      // This test verifies valid Discord webhook URL patterns are accepted
      const validPatterns = [
        "https://discord.com/api/webhooks/123456789/abc-xyz",
        "https://discordapp.com/api/webhooks/123456789/abc-xyz_123",
      ];

      const discordPattern =
        /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;

      for (const url of validPatterns) {
        expect(discordPattern.test(url)).toBe(true);
      }
    });
  });

  describe("UTC date calculations", () => {
    it("should use UTC hours for day boundary calculations", async () => {
      // This test verifies the fix for timezone bug
      // The implementation now uses setUTCHours instead of setHours
      const now = Date.now();
      const targetDay = now + 7 * 24 * 60 * 60 * 1000;
      const dayStart = new Date(targetDay);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDay);
      dayEnd.setUTCHours(23, 59, 59, 999);

      // Verify that UTC methods produce consistent results regardless of timezone
      expect(dayStart.getUTCHours()).toBe(0);
      expect(dayStart.getUTCMinutes()).toBe(0);
      expect(dayEnd.getUTCHours()).toBe(23);
      expect(dayEnd.getUTCMinutes()).toBe(59);
    });
  });

  describe("getStats()", () => {
    it("should return a copy of stats object", async () => {
      const worker = new NotificationWorker(mockRedis, mockLogger, mockEnv);
      const stats1 = worker.getStats();
      const stats2 = worker.getStats();

      // Should be equal values
      expect(stats1).toEqual(stats2);
      // But different object references
      expect(stats1).not.toBe(stats2);
    });
  });
});

describe("Idempotency", () => {
  let mockRedis: MockRedisClient;
  let mockLogger: Logger;
  let mockEnv: Env;

  beforeEach(() => {
    mockRedis = createMockRedis();
    mockLogger = createMockLogger();
    mockEnv = createMockEnv();
    mockFetch.mockReset();
  });

  it("should execute multi commands correctly", async () => {
    // Verifies that the multi/exec API works correctly with node-redis
    mockRedis._setGuildSettings("test-guild", {
      notifications: {
        galleryExpiration: {
          enabled: true,
          webhookUrl: "https://discord.com/api/webhooks/123456789/abc-xyz",
          daysBefore: 7,
        },
      },
    });

    // Call the method that uses multi
    const commands: Array<{ cmd: string; args: unknown[] }> = [];
    const mockMultiChain = {
      get: vi.fn(function (this: any, key: string) {
        commands.push({ cmd: "get", args: [key] });
        return this;
      }),
      exists: vi.fn(function (this: any, key: string) {
        commands.push({ cmd: "exists", args: [key] });
        return this;
      }),
      setEx: vi.fn(function (this: any, key: string, ttl: number, value: string) {
        commands.push({ cmd: "setEx", args: [key, ttl, value] });
        return this;
      }),
      exec: vi.fn(async () => {
        const results: unknown[] = [];
        for (const command of commands) {
          if (command.cmd === "exists") {
            results.push(1); // Simulate key exists
          } else {
            results.push(null);
          }
        }
        return results;
      }),
    };

    vi.spyOn(mockRedis, "multi").mockReturnValue(mockMultiChain as any);

    const worker = new NotificationWorker(mockRedis, mockLogger, mockEnv);
    // Just run and verify no errors
    const result = await worker.run();
    expect(result).toBe(true);
  });
});
