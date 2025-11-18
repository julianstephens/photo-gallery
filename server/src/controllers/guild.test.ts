import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GuildController } from "./guild.ts";

// Mock redis
vi.mock("../redis.ts", () => ({
  default: {
    client: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
}));

describe("GuildController", () => {
  let controller: GuildController;
  let mockRedisClient: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    controller = new GuildController();
    const redis = (await import("../redis.ts")).default;
    mockRedisClient = redis.client as typeof mockRedisClient;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getDefaultGuild", () => {
    it("should return default guild ID when set", async () => {
      const userId = "user-123";
      const expectedGuildId = "guild-456";
      mockRedisClient.get.mockResolvedValueOnce(expectedGuildId);

      const result = await controller.getDefaultGuild(userId);

      expect(result).toBe(expectedGuildId);
      expect(mockRedisClient.get).toHaveBeenCalledWith("user:user-123:defaultGuild");
    });

    it("should return null when no default guild is set", async () => {
      const userId = "user-789";
      mockRedisClient.get.mockResolvedValueOnce(null);

      const result = await controller.getDefaultGuild(userId);

      expect(result).toBeNull();
      expect(mockRedisClient.get).toHaveBeenCalledWith("user:user-789:defaultGuild");
    });

    it("should throw error when userId is empty", async () => {
      await expect(controller.getDefaultGuild("")).rejects.toThrow("userId cannot be empty");
    });

    it("should throw error when userId is whitespace only", async () => {
      await expect(controller.getDefaultGuild("   ")).rejects.toThrow("userId cannot be empty");
    });

    it("should trim userId before using it", async () => {
      const userId = "  user-trimmed  ";
      const expectedGuildId = "guild-trimmed";
      mockRedisClient.get.mockResolvedValueOnce(expectedGuildId);

      const result = await controller.getDefaultGuild(userId);

      expect(result).toBe(expectedGuildId);
      expect(mockRedisClient.get).toHaveBeenCalledWith("user:user-trimmed:defaultGuild");
    });
  });

  describe("setDefaultGuild", () => {
    it("should set default guild for user", async () => {
      const guildId = "guild-abc";
      const userId = "user-xyz";
      mockRedisClient.set.mockResolvedValueOnce("OK");

      await controller.setDefaultGuild(guildId, userId);

      expect(mockRedisClient.set).toHaveBeenCalledWith("user:user-xyz:defaultGuild", "guild-abc");
    });

    it("should throw error when guildId is empty", async () => {
      await expect(controller.setDefaultGuild("", "user-123")).rejects.toThrow(
        "guildId cannot be empty",
      );
    });

    it("should throw error when userId is empty", async () => {
      await expect(controller.setDefaultGuild("guild-123", "")).rejects.toThrow(
        "userId cannot be empty",
      );
    });

    it("should throw error when both guildId and userId are empty", async () => {
      await expect(controller.setDefaultGuild("", "")).rejects.toThrow("guildId cannot be empty");
    });

    it("should trim both guildId and userId before using them", async () => {
      const guildId = "  guild-trimmed  ";
      const userId = "  user-trimmed  ";
      mockRedisClient.set.mockResolvedValueOnce("OK");

      await controller.setDefaultGuild(guildId, userId);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "user:user-trimmed:defaultGuild",
        "guild-trimmed",
      );
    });

    it("should handle successful update without returning value", async () => {
      mockRedisClient.set.mockResolvedValueOnce("OK");

      const result = await controller.setDefaultGuild("guild-123", "user-123");

      expect(result).toBeUndefined();
    });
  });
});
