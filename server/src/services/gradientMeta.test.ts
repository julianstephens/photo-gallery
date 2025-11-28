import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEnvModule, mockRedisModule } from "../utils/test-mocks.ts";

// Mock dependencies before imports
vi.mock("../schemas/env.ts", () => mockEnvModule());
vi.mock("../redis.ts", () => mockRedisModule());

// Import after mocks
import redis from "../redis.ts";
import { GradientMetaService } from "./gradientMeta.ts";

describe("GradientMetaService", () => {
  let service: GradientMetaService;

  beforeEach(() => {
    service = new GradientMetaService();
    vi.clearAllMocks();
  });

  describe("getGradient", () => {
    it("should return null when gradient not found", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

      const result = await service.getGradient("test/image.jpg");

      expect(result).toBeNull();
      expect(redis.client.get).toHaveBeenCalledWith("gradient:test/image.jpg");
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
      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(storedData));

      const result = await service.getGradient("test/image.jpg");

      expect(result).toBeTruthy();
      expect(result?.status).toBe("completed");
      expect(result?.gradient?.primary).toBe("#FF0000");
    });

    it("should return null for invalid JSON", async () => {
      vi.mocked(redis.client.get).mockResolvedValue("invalid json");

      const result = await service.getGradient("test/image.jpg");

      expect(result).toBeNull();
    });
  });

  describe("getGradients", () => {
    it("should return empty array for empty input", async () => {
      const results = await service.getGradients([]);

      expect(results).toEqual([]);
      expect(redis.client.mGet).not.toHaveBeenCalled();
    });

    it("should return multiple gradient data using mGet", async () => {
      const storedData1 = {
        status: "completed",
        gradient: { primary: "#FF0000" },
        attempts: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const storedData2 = {
        status: "failed",
        attempts: 3,
        lastError: "Error",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(storedData1),
        null,
        JSON.stringify(storedData2),
      ]);

      const results = await service.getGradients(["key1", "key2", "key3"]);

      expect(results).toHaveLength(3);
      expect(results[0]?.status).toBe("completed");
      expect(results[1]).toBeNull();
      expect(results[2]?.status).toBe("failed");
      expect(redis.client.mGet).toHaveBeenCalledWith([
        "gradient:key1",
        "gradient:key2",
        "gradient:key3",
      ]);
    });

    it("should return null for invalid JSON entries", async () => {
      vi.mocked(redis.client.mGet).mockResolvedValue(["invalid json", null]);

      const results = await service.getGradients(["key1", "key2"]);

      expect(results).toHaveLength(2);
      expect(results[0]).toBeNull();
      expect(results[1]).toBeNull();
    });
  });

  describe("markPending", () => {
    it("should mark gradient as pending", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

      await service.markPending("test/image.jpg");

      expect(redis.client.set).toHaveBeenCalled();
      expect(redis.client.expire).toHaveBeenCalled();

      const callArgs = vi.mocked(redis.client.set).mock.calls[0];
      const savedData = JSON.parse(callArgs[1] as string);
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
      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(completedData));

      await service.markPending("test/image.jpg");

      expect(redis.client.set).not.toHaveBeenCalled();
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
      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(pendingData));

      await service.markProcessing("test/image.jpg");

      expect(redis.client.set).toHaveBeenCalled();
      const callArgs = vi.mocked(redis.client.set).mock.calls[0];
      const savedData = JSON.parse(callArgs[1] as string);
      expect(savedData.status).toBe("processing");
    });

    it("should do nothing if gradient not found", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

      await service.markProcessing("test/image.jpg");

      expect(redis.client.set).not.toHaveBeenCalled();
    });
  });

  describe("markCompleted", () => {
    it("should mark gradient as completed with gradient data", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

      const gradient = {
        primary: "#FF0000",
        secondary: "#00FF00",
        foreground: "#FFFFFF",
        css: "linear-gradient(135deg, #FF0000 0%, #00FF00 100%)",
      };

      await service.markCompleted("test/image.jpg", gradient);

      expect(redis.client.set).toHaveBeenCalled();
      expect(redis.client.expire).toHaveBeenCalled();

      const callArgs = vi.mocked(redis.client.set).mock.calls[0];
      const savedData = JSON.parse(callArgs[1] as string);
      expect(savedData.status).toBe("completed");
      expect(savedData.gradient).toEqual(gradient);
    });
  });

  describe("markFailed", () => {
    it("should mark gradient as failed with error message", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

      await service.markFailed("test/image.jpg", "Download failed");

      expect(redis.client.set).toHaveBeenCalled();
      expect(redis.client.expire).toHaveBeenCalled();

      const callArgs = vi.mocked(redis.client.set).mock.calls[0];
      const savedData = JSON.parse(callArgs[1] as string);
      expect(savedData.status).toBe("failed");
      expect(savedData.lastError).toBe("Download failed");
    });
  });

  describe("deleteGradient", () => {
    it("should delete gradient metadata", async () => {
      await service.deleteGradient("test/image.jpg");

      expect(redis.client.del).toHaveBeenCalledWith("gradient:test/image.jpg");
    });
  });
});
