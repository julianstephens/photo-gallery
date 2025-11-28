import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Create mock instances
const bucketServiceMock = {
  getObject: vi.fn(),
};

const galleryControllerMock = {
  listGalleries: vi.fn(),
  getGalleryFolderName: vi.fn(),
};

vi.mock("../services/bucket.ts", () => ({
  BucketService: class {
    static async create() {
      const instance = new this();
      return instance;
    }

    getObject = bucketServiceMock.getObject;
  },
}));

vi.mock("../controllers/gallery.ts", () => ({
  GalleryController: class {
    async listGalleries(guildId: string) {
      return galleryControllerMock.listGalleries(guildId);
    }

    async getGalleryFolderName(guildId: string, galleryName: string) {
      return galleryControllerMock.getGalleryFolderName(guildId, galleryName);
    }
  },
}));

vi.mock("../middleware/logger.ts", () => ({
  appLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../utils.ts", () => ({
  normalizeGalleryFolderName: vi.fn((name: string) => name.toLowerCase().replace(/\s+/g, "-")),
}));

const handlers = await import("./media.ts");
const { streamMedia } = handlers;

const createRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  res.send = vi.fn().mockReturnThis();
  res.setHeader = vi.fn().mockReturnThis();
  return res as Response;
};

const createReq = (overrides: Partial<Request> = {}) => {
  const req: Partial<Request> = {
    query: {},
    params: {},
    path: "/test/path",
    originalUrl: "/test/path",
    ...overrides,
  };
  return req as Request;
};

describe("media handlers", () => {
  beforeEach(() => {
    // Reset mocks before each test
    bucketServiceMock.getObject.mockReset();
    galleryControllerMock.listGalleries.mockReset();
    galleryControllerMock.getGalleryFolderName.mockReset();
  });

  describe("streamMedia", () => {
    it("returns 400 when galleryName is missing", async () => {
      const req = createReq({
        params: { year: "2024", month: "01", day: "15", splat: "photo.jpg" } as Request["params"],
        query: { guildId: "guild-1" } as Request["query"],
      });
      const res = createRes();

      await streamMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing galleryName parameter" });
    });

    it("returns 400 when guildId is missing", async () => {
      const req = createReq({
        params: {
          galleryName: "summer",
          year: "2024",
          month: "01",
          day: "15",
          splat: "photo.jpg",
        } as Request["params"],
        query: {} as Request["query"],
      });
      const res = createRes();

      await streamMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId parameter" });
    });

    it("returns 404 when gallery is not found", async () => {
      const req = createReq({
        params: {
          galleryName: "nonexistent",
          year: "2024",
          month: "01",
          day: "15",
          splat: "photo.jpg",
        } as Request["params"],
        query: { guildId: "guild-1" } as Request["query"],
      });
      const res = createRes();
      galleryControllerMock.listGalleries.mockResolvedValue([
        { name: "summer", meta: {} },
        { name: "winter", meta: {} },
      ]);

      await streamMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Gallery not found" });
    });

    it("returns 400 for InvalidInputError exceptions", async () => {
      const req = createReq({
        params: {
          galleryName: "summer",
          year: "2024",
          month: "01",
          day: "15",
          splat: "photo.jpg",
        } as Request["params"],
        query: { guildId: "guild-1" } as Request["query"],
      });
      const res = createRes();

      galleryControllerMock.listGalleries.mockRejectedValue(
        Object.assign(new Error("Invalid input"), { name: "InvalidInputError" }),
      );

      await streamMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid input" });
    });

    it("returns 500 for unexpected errors", async () => {
      const req = createReq({
        params: {
          galleryName: "summer",
          year: "2024",
          month: "01",
          day: "15",
          splat: "photo.jpg",
        } as Request["params"],
        query: { guildId: "guild-1" } as Request["query"],
      });
      const res = createRes();

      galleryControllerMock.listGalleries.mockRejectedValue(
        new Error("Database connection failed"),
      );

      await streamMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to retrieve media" });
    });

    it("returns 404 when image is not found", async () => {
      const req = createReq({
        params: {
          galleryName: "summer",
          year: "2024",
          month: "01",
          day: "15",
          splat: "photo.jpg",
        } as Request["params"],
        query: { guildId: "guild-1" } as Request["query"],
      });
      const res = createRes();

      // The normalizeGalleryFolderName mock returns lowercase with spaces replaced by dashes
      // So "summer" stays "summer" and "Summer" becomes "summer"
      galleryControllerMock.listGalleries.mockResolvedValue([{ name: "summer", meta: {} }]);
      galleryControllerMock.getGalleryFolderName.mockResolvedValue("summer");

      const noSuchKeyError = new Error("NoSuchKey");
      noSuchKeyError.name = "NoSuchKey";
      bucketServiceMock.getObject.mockRejectedValue(noSuchKeyError);

      await streamMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Image not found" });
    });

    it("successfully retrieves and streams media", async () => {
      const req = createReq({
        params: {
          galleryName: "summer",
          year: "2024",
          month: "01",
          day: "15",
          splat: "photo.jpg",
        } as Request["params"],
        query: { guildId: "guild-1" } as Request["query"],
      });
      const res = createRes();
      const imageBuffer = Buffer.from("image data");

      // The normalizeGalleryFolderName mock returns lowercase with spaces replaced by dashes
      // So "summer" stays "summer" and "Summer" becomes "summer"
      galleryControllerMock.listGalleries.mockResolvedValue([{ name: "summer", meta: {} }]);
      galleryControllerMock.getGalleryFolderName.mockResolvedValue("summer");
      bucketServiceMock.getObject.mockResolvedValue({
        data: imageBuffer,
        contentType: "image/jpeg",
      });

      await streamMedia(req, res);

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
      expect(res.send).toHaveBeenCalledWith(imageBuffer);
    });
  });
});
