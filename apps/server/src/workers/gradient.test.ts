import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEnvModule, mockLoggerModule, mockRedisClient } from "../utils/test-mocks.ts";

const envEnabledModule = () => mockEnvModule({ GRADIENT_WORKER_ENABLED: true });
const envDisabledModule = () => mockEnvModule({ GRADIENT_WORKER_ENABLED: false });

vi.mock("../middleware/logger.ts", () => mockLoggerModule());
vi.mock("../redis.ts", () => ({
  default: {
    client: mockRedisClient,
  },
}));

describe("GradientWorker Enqueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRedisClient.lPush.mockResolvedValue(1);
  });

  describe("enqueueGradientJob", () => {
    it("should return null when worker is disabled", async () => {
      vi.doMock("../schemas/env.ts", () => envDisabledModule());

      const { enqueueGradientJob } = await import("./index.ts");

      const result = await enqueueGradientJob({
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      });

      expect(result).toBeNull();
      expect(mockRedisClient.lPush).not.toHaveBeenCalled();
    });

    it("should enqueue a job and generate a jobId", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());

      const { enqueueGradientJob } = await import("./index.ts");
      const jobData = {
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      };

      const result = await enqueueGradientJob(jobData);

      expect(result).toEqual(expect.any(String));
      expect(mockRedisClient.lPush).toHaveBeenCalledWith(
        "gradient:queue",
        JSON.stringify({ ...jobData, jobId: result }),
      );
    });

    it("should return null and log an error if enqueueing fails", async () => {
      vi.doMock("../schemas/env.ts", () => envEnabledModule());
      mockRedisClient.lPush.mockRejectedValue(new Error("Redis error"));

      const { enqueueGradientJob } = await import("./index.ts");
      const jobData = {
        guildId: "guild123",
        galleryName: "test-gallery",
        storageKey: "test/image.jpg",
        itemId: "test-image-jpg",
      };

      const result = await enqueueGradientJob(jobData);

      expect(result).toBeNull();
      expect(mockRedisClient.lPush).toHaveBeenCalled();
    });
  });
});
