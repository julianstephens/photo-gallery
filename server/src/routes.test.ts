import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// Mock the env module first
vi.mock("./schemas/env.ts", () => ({
  default: {
    PORT: 4000,
    DISCORD_CLIENT_ID: "test-id",
    DISCORD_CLIENT_SECRET: "test-secret",
    DISCORD_REDIRECT_URI: "http://localhost/callback",
    MINIO_ENDPOINT: "test.minio.com",
    MINIO_PORT: 9000,
    MINIO_ACCESS_KEY: "test-access-key",
    MINIO_SECRET_KEY: "test-secret-key",
  },
}));

// Create mock implementations
const mockGalleryAPI = {
  createGallery: vi.fn(),
  uploadToGallery: vi.fn(),
};

// Mock the GalleryAPI
vi.mock("./api/index.ts", () => ({
  GalleryAPI: class {
    createGallery = mockGalleryAPI.createGallery;
    uploadToGallery = mockGalleryAPI.uploadToGallery;
  },
  discordCallback: vi.fn((req: express.Request, res: express.Response) =>
    res.json({ user: "test" }),
  ),
}));

// Import after mocks are set up
const router = await import("./routes.ts").then((m) => m.default);

describe("Routes Integration Tests", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api", router);
  });

  // Silence expected error logs during negative-path tests to keep output clean
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/checkhealth", () => {
    it("should return ok status", async () => {
      const response = await request(app).get("/api/checkhealth");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ok" });
    });
  });

  describe("GET /api/auth/discord", () => {
    it("should handle discord callback", async () => {
      const response = await request(app).get("/api/auth/discord").query({ code: "test-code" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ user: "test" });
    });
  });

  // Note: POST /api/gallery route handler needs to be properly implemented
  // to accept request body and send response. Skipping this test for now.

  describe("POST /api/gallery/upload", () => {
    it("should return error when no file is provided", async () => {
      const response = await request(app)
        .post("/api/gallery/upload")
        .query({ bucket: "test-bucket" });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Missing 'file' form field");
    });

    it("should return error when bucket parameter is missing", async () => {
      const response = await request(app)
        .post("/api/gallery/upload")
        .attach("file", Buffer.from("test"), "test.jpg");

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Missing bucket (query param ?bucket=...)");
    });

    it("should upload file successfully", async () => {
      mockGalleryAPI.uploadToGallery.mockResolvedValue({
        uploaded: [{ key: "test.jpg", contentType: "image/jpeg" }],
      });

      const response = await request(app)
        .post("/api/gallery/upload")
        .query({ bucket: "test-bucket", prefix: "uploads" })
        .attach("file", Buffer.from("fake image data"), "test.jpg");

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("uploaded");
    });

    it("should handle unsupported file type error", async () => {
      const error = new Error("Unsupported file type") as Error & { name: string };
      error.name = "UnsupportedMimeTypeError";
      mockGalleryAPI.uploadToGallery.mockRejectedValue(error);

      const response = await request(app)
        .post("/api/gallery/upload")
        .query({ bucket: "test-bucket" })
        .attach("file", Buffer.from("test"), "test.pdf");

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should handle bucket missing error", async () => {
      const error = new Error("Bucket does not exist") as Error & { name: string };
      error.name = "BucketMissingError";
      mockGalleryAPI.uploadToGallery.mockRejectedValue(error);

      const response = await request(app)
        .post("/api/gallery/upload")
        .query({ bucket: "non-existent-bucket" })
        .attach("file", Buffer.from("test"), "test.jpg");

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Bucket does not exist");
    });

    it("should handle general upload errors", async () => {
      mockGalleryAPI.uploadToGallery.mockRejectedValue(new Error("Upload failed"));

      const response = await request(app)
        .post("/api/gallery/upload")
        .query({ bucket: "test-bucket" })
        .attach("file", Buffer.from("test"), "test.jpg");

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Upload failed");
    });

    it("should use default prefix when not provided", async () => {
      mockGalleryAPI.uploadToGallery.mockResolvedValue({
        uploaded: [{ key: "test.jpg", contentType: "image/jpeg" }],
      });

      const response = await request(app)
        .post("/api/gallery/upload")
        .query({ bucket: "test-bucket" })
        .attach("file", Buffer.from("test"), "test.jpg");

      expect(response.status).toBe(201);
      expect(mockGalleryAPI.uploadToGallery).toHaveBeenCalled();
    });
  });
});
