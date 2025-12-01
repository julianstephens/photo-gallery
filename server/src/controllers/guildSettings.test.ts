import { DEFAULT_GUILD_SETTINGS, type GuildSettings } from "utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockRedisModule } from "../utils/test-mocks.ts";
import { GuildSettingsController } from "./guildSettings.ts";

// Mock redis
vi.mock("../redis.ts", () => mockRedisModule());

// Valid Discord snowflake ID for testing (17-19 digits)
const VALID_CHANNEL_ID = "123456789012345678";

describe("GuildSettingsController", () => {
  let controller: GuildSettingsController;
  let mockRedisClient: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    controller = new GuildSettingsController();
    const redis = (await import("../redis.ts")).default;
    mockRedisClient = redis.client as unknown as typeof mockRedisClient;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getSettings", () => {
    it("should return default settings when no settings exist", async () => {
      const guildId = "guild-123";
      mockRedisClient.get.mockResolvedValueOnce(null);

      const result = await controller.getSettings(guildId);

      expect(result).toEqual(DEFAULT_GUILD_SETTINGS);
      expect(mockRedisClient.get).toHaveBeenCalledWith("guilds:guild-123:settings");
    });

    it("should return stored settings when they exist", async () => {
      const guildId = "guild-456";
      const storedSettings: GuildSettings = {
        notifications: {
          galleryExpiration: {
            enabled: true,
            channelId: VALID_CHANNEL_ID,
            daysBefore: 3,
          },
        },
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(storedSettings));

      const result = await controller.getSettings(guildId);

      expect(result).toEqual(storedSettings);
      expect(mockRedisClient.get).toHaveBeenCalledWith("guilds:guild-456:settings");
    });

    it("should return default settings when stored JSON is invalid", async () => {
      const guildId = "guild-789";
      mockRedisClient.get.mockResolvedValueOnce("invalid-json");

      const result = await controller.getSettings(guildId);

      expect(result).toEqual(DEFAULT_GUILD_SETTINGS);
    });

    it("should return default settings when stored settings fail validation", async () => {
      const guildId = "guild-validation";
      const invalidSettings = {
        notifications: {
          galleryExpiration: {
            enabled: "not-a-boolean", // Invalid type
            channelId: 123, // Invalid type
            daysBefore: 100, // Out of range
          },
        },
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(invalidSettings));

      const result = await controller.getSettings(guildId);

      expect(result).toEqual(DEFAULT_GUILD_SETTINGS);
    });

    it("should throw error when guildId is empty", async () => {
      await expect(controller.getSettings("")).rejects.toThrow("guildId cannot be empty");
    });

    it("should throw error when guildId is whitespace only", async () => {
      await expect(controller.getSettings("   ")).rejects.toThrow("guildId cannot be empty");
    });

    it("should trim guildId before using it", async () => {
      const guildId = "  guild-trimmed  ";
      mockRedisClient.get.mockResolvedValueOnce(null);

      await controller.getSettings(guildId);

      expect(mockRedisClient.get).toHaveBeenCalledWith("guilds:guild-trimmed:settings");
    });
  });

  describe("updateSettings", () => {
    it("should store settings and return them", async () => {
      const guildId = "guild-123";
      const settings: GuildSettings = {
        notifications: {
          galleryExpiration: {
            enabled: true,
            channelId: VALID_CHANNEL_ID,
            daysBefore: 5,
          },
        },
      };
      mockRedisClient.set.mockResolvedValueOnce("OK");

      const result = await controller.updateSettings(guildId, settings);

      expect(result).toEqual(settings);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "guilds:guild-123:settings",
        JSON.stringify(settings),
      );
    });

    it("should throw error when guildId is empty", async () => {
      const settings: GuildSettings = {
        notifications: {
          galleryExpiration: {
            enabled: false,
            channelId: null,
            daysBefore: 7,
          },
        },
      };

      await expect(controller.updateSettings("", settings)).rejects.toThrow(
        "guildId cannot be empty",
      );
    });

    it("should throw error when settings are invalid", async () => {
      const guildId = "guild-123";
      const invalidSettings = {
        notifications: {
          galleryExpiration: {
            enabled: "not-a-boolean",
          },
        },
      } as unknown as GuildSettings;

      await expect(controller.updateSettings(guildId, invalidSettings)).rejects.toThrow();
    });

    it("should trim guildId before using it", async () => {
      const guildId = "  guild-trimmed  ";
      const settings: GuildSettings = {
        notifications: {
          galleryExpiration: {
            enabled: false,
            channelId: null,
            daysBefore: 7,
          },
        },
      };
      mockRedisClient.set.mockResolvedValueOnce("OK");

      await controller.updateSettings(guildId, settings);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "guilds:guild-trimmed:settings",
        JSON.stringify(settings),
      );
    });
  });

  describe("deleteSettings", () => {
    it("should delete settings for a guild", async () => {
      const guildId = "guild-123";
      mockRedisClient.del.mockResolvedValueOnce(1);

      await controller.deleteSettings(guildId);

      expect(mockRedisClient.del).toHaveBeenCalledWith("guilds:guild-123:settings");
    });

    it("should throw error when guildId is empty", async () => {
      await expect(controller.deleteSettings("")).rejects.toThrow("guildId cannot be empty");
    });

    it("should not throw when settings do not exist", async () => {
      const guildId = "guild-nonexistent";
      mockRedisClient.del.mockResolvedValueOnce(0);

      await expect(controller.deleteSettings(guildId)).resolves.toBeUndefined();
    });

    it("should trim guildId before using it", async () => {
      const guildId = "  guild-trimmed  ";
      mockRedisClient.del.mockResolvedValueOnce(1);

      await controller.deleteSettings(guildId);

      expect(mockRedisClient.del).toHaveBeenCalledWith("guilds:guild-trimmed:settings");
    });
  });
});
