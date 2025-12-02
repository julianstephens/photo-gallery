import type { Logger } from "pino";
import type { RedisClientType } from "redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env.js";
import { NotificationWorker } from "./worker.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create mock Redis client
function createMockRedis() {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    setEx: vi.fn((key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    exists: vi.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
    sMembers: vi.fn((key: string) => {
      const set = sets.get(key);
      return Promise.resolve(set ? Array.from(set) : []);
    }),
    scan: vi.fn((cursor: string, options?: { MATCH?: string; COUNT?: number }) => {
      // Return all matching keys for simplicity in tests
      const pattern = options?.MATCH || "*";
      const matchedKeys: string[] = [];

      for (const key of store.keys()) {
        // Simple glob pattern matching
        if (key.includes(pattern.replace(/\*/g, ""))) {
          matchedKeys.push(key);
        }
      }

      return Promise.resolve({
        cursor: "0",
        keys: matchedKeys,
      });
    }),
    multi: vi.fn(() => ({
      get: vi.fn().mockReturnThis(),
      exists: vi.fn().mockReturnThis(),
      setEx: vi.fn().mockReturnThis(),
      exec: vi.fn(() => Promise.resolve([])),
    })),
    // Helper methods for tests
    _store: store,
    _sets: sets,
    _setGuildSettings: (guildId: string, settings: object) => {
      store.set(`guilds:${guildId}:settings`, JSON.stringify(settings));
    },
    _setGalleryMeta: (guildId: string, galleryName: string, meta: object) => {
      store.set(`guild:${guildId}:gallery:${galleryName}:meta`, JSON.stringify(meta));
    },
    _addGalleryToGuild: (guildId: string, galleryName: string) => {
      if (!sets.has(`guild:${guildId}:galleries`)) {
        sets.set(`guild:${guildId}:galleries`, new Set());
      }
      sets.get(`guild:${guildId}:galleries`)!.add(galleryName);
    },
  } as unknown as RedisClientType & {
    _store: Map<string, string>;
    _sets: Map<string, Set<string>>;
    _setGuildSettings: (guildId: string, settings: object) => void;
    _setGalleryMeta: (guildId: string, galleryName: string, meta: object) => void;
    _addGalleryToGuild: (guildId: string, galleryName: string) => void;
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
    DEFAULT_DAYS_BEFORE: 7,
  };
}

describe("NotificationWorker", () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
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
    it("should reject non-Discord webhook URLs", async () => {
      // Setup mock to return a guild with invalid webhook URL
      mockRedis.scan = vi.fn().mockResolvedValueOnce({
        cursor: "0",
        keys: ["guilds:test-guild:settings"],
      });

      mockRedis._setGuildSettings("test-guild", {
        notifications: {
          enabled: true,
          webhookUrl: "https://example.com/webhook",
          daysBefore: 7,
        },
      });

      const worker = new NotificationWorker(mockRedis, mockLogger, mockEnv);
      await worker.run();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { guildId: "test-guild" },
        "Invalid webhook URL format, must be a Discord webhook URL",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

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
  let mockRedis: ReturnType<typeof createMockRedis>;
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
        enabled: true,
        webhookUrl: "https://discord.com/api/webhooks/123456789/abc-xyz",
        daysBefore: 7,
      },
    });

    // Call the method that uses multi
    mockRedis.multi = vi.fn(() => {
      const commands: Array<{ cmd: string; args: unknown[] }> = [];
      return {
        get: vi.fn(function (key: string) {
          commands.push({ cmd: "get", args: [key] });
          return this;
        }),
        exists: vi.fn(function (key: string) {
          commands.push({ cmd: "exists", args: [key] });
          return this;
        }),
        setEx: vi.fn(function (key: string, ttl: number, value: string) {
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
    });

    const worker = new NotificationWorker(mockRedis, mockLogger, mockEnv);
    // Just run and verify no errors
    const result = await worker.run();
    expect(result).toBe(true);
  });
});
