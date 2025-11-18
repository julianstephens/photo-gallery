import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GalleryRepo } from "./galleryRepo.ts";

// Mock redis
vi.mock("../redis.ts", () => ({
  default: {
    client: {
      get: vi.fn(),
      sAdd: vi.fn(),
      sRem: vi.fn(),
      multi: vi.fn(),
    },
  },
}));

describe("GalleryRepo", () => {
  let repo: GalleryRepo;
  let mockRedisClient: {
    get: ReturnType<typeof vi.fn>;
    sAdd: ReturnType<typeof vi.fn>;
    sRem: ReturnType<typeof vi.fn>;
    multi: ReturnType<typeof vi.fn>;
  };
  let mockMulti: {
    sRem: ReturnType<typeof vi.fn>;
    sAdd: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repo = new GalleryRepo();
    const redis = (await import("../redis.ts")).default;
    mockRedisClient = redis.client as typeof mockRedisClient;
    mockMulti = {
      sRem: vi.fn().mockReturnThis(),
      sAdd: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    };
    vi.clearAllMocks();
    mockRedisClient.multi.mockReturnValue(mockMulti);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("listGalleries", () => {
    it("should return galleries for a guild", async () => {
      const guildId = "guild-123";
      const expectedValue = "gallery1,gallery2";
      mockRedisClient.get.mockResolvedValueOnce(expectedValue);

      const result = await repo.listGalleries(guildId);

      expect(result).toBe(expectedValue);
      expect(mockRedisClient.get).toHaveBeenCalledWith("guild:guild-123:galleries");
    });

    it("should return null when no galleries exist", async () => {
      const guildId = "guild-empty";
      mockRedisClient.get.mockResolvedValueOnce(null);

      const result = await repo.listGalleries(guildId);

      expect(result).toBeNull();
      expect(mockRedisClient.get).toHaveBeenCalledWith("guild:guild-empty:galleries");
    });
  });

  describe("createGallery", () => {
    it("should add a gallery to guild's gallery set", async () => {
      const guildId = "guild-456";
      const galleryName = "my-gallery";
      mockRedisClient.sAdd.mockResolvedValueOnce(1);

      const result = await repo.createGallery(guildId, galleryName);

      expect(result).toBe(1);
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith("guild:guild-456:galleries", "my-gallery");
    });

    it("should return 0 if gallery already exists", async () => {
      const guildId = "guild-789";
      const galleryName = "existing-gallery";
      mockRedisClient.sAdd.mockResolvedValueOnce(0);

      const result = await repo.createGallery(guildId, galleryName);

      expect(result).toBe(0);
    });
  });

  describe("deleteGallery", () => {
    it("should remove a gallery from guild's gallery set", async () => {
      const guildId = "guild-abc";
      const galleryName = "gallery-to-delete";
      mockRedisClient.sRem.mockResolvedValueOnce(1);

      const result = await repo.deleteGallery(guildId, galleryName);

      expect(result).toBe(1);
      expect(mockRedisClient.sRem).toHaveBeenCalledWith(
        "guild:guild-abc:galleries",
        "gallery-to-delete",
      );
    });

    it("should return 0 if gallery does not exist", async () => {
      const guildId = "guild-xyz";
      const galleryName = "non-existent";
      mockRedisClient.sRem.mockResolvedValueOnce(0);

      const result = await repo.deleteGallery(guildId, galleryName);

      expect(result).toBe(0);
    });
  });

  describe("renameGallery", () => {
    it("should rename a gallery using multi transaction", async () => {
      const guildId = "guild-rename";
      const oldName = "old-name";
      const newName = "new-name";
      const mockExecResult = [1, 1];
      mockMulti.exec.mockResolvedValueOnce(mockExecResult);

      const result = await repo.renameGallery(guildId, oldName, newName);

      expect(result).toEqual(mockExecResult);
      expect(mockRedisClient.multi).toHaveBeenCalled();
      expect(mockMulti.sRem).toHaveBeenCalledWith("guild:guild-rename:galleries", "old-name");
      expect(mockMulti.sAdd).toHaveBeenCalledWith("guild:guild-rename:galleries", "new-name");
      expect(mockMulti.exec).toHaveBeenCalled();
    });

    it("should handle rename operation in correct order", async () => {
      const guildId = "guild-order-test";
      const oldName = "first";
      const newName = "second";
      mockMulti.exec.mockResolvedValueOnce([1, 1]);

      await repo.renameGallery(guildId, oldName, newName);

      // Verify the order of operations
      const multiCalls = mockMulti.sRem.mock.calls;
      expect(multiCalls[0][0]).toBe("guild:guild-order-test:galleries");
      expect(multiCalls[0][1]).toBe("first");

      const addCalls = mockMulti.sAdd.mock.calls;
      expect(addCalls[0][0]).toBe("guild:guild-order-test:galleries");
      expect(addCalls[0][1]).toBe("second");
    });
  });
});
