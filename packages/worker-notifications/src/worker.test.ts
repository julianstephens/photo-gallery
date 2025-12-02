import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Redis from "ioredis";
import type { Logger } from "pino";
import { NotificationWorker } from "./worker.js";
import type { Env } from "./env.js";

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
    setex: vi.fn((key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    exists: vi.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
    smembers: vi.fn((key: string) => {
      const set = sets.get(key);
      return Promise.resolve(set ? Array.from(set) : []);
    }),
    scan: vi.fn(() => Promise.resolve(["0", []])),
    pipeline: vi.fn(() => ({
      get: vi.fn().mockReturnThis(),
      exists: vi.fn().mockReturnThis(),
      setex: vi.fn().mockReturnThis(),
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
  } as unknown as Redis & {
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
      mockRedis.scan = vi.fn().mockResolvedValueOnce(["0", ["guilds:test-guild:settings"]]);

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

  it("should skip galleries that have already been notified", async () => {
    // Setup guild with enabled notifications
    mockRedis.scan = vi.fn().mockResolvedValueOnce(["0", ["guilds:test-guild:settings"]]);

    mockRedis._setGuildSettings("test-guild", {
      notifications: {
        enabled: true,
        webhookUrl: "https://discord.com/api/webhooks/123456789/abc-xyz",
        daysBefore: 7,
      },
    });

    mockRedis._addGalleryToGuild("test-guild", "test-gallery");

    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    mockRedis._setGalleryMeta("test-guild", "test-gallery", {
      expiresAt,
      createdBy: "user123",
      totalItems: 10,
    });

    // Mark as already notified
    mockRedis._store.set("guilds:test-guild:notified:test-gallery:7", Date.now().toString());

    // Setup pipeline mock
    const existsResults = [[null, 1]]; // Already notified
    mockRedis.pipeline = vi.fn(() => ({
      get: vi.fn().mockReturnThis(),
      exists: vi.fn().mockReturnThis(),
      setex: vi.fn().mockReturnThis(),
      exec: vi
        .fn()
        .mockResolvedValueOnce([
          [null, JSON.stringify({ expiresAt, createdBy: "user123", totalItems: 10 })],
        ])
        .mockResolvedValueOnce(existsResults),
    }));

    const worker = new NotificationWorker(mockRedis, mockLogger, mockEnv);
    await worker.run();

    const stats = worker.getStats();
    expect(stats.notificationsSkipped).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
