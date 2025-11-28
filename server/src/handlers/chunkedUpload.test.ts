import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEnv, mockRedisModule } from "../utils/test-mocks.ts";

// Mock environment variables before any imports
vi.mock("../schemas/env.ts", () => ({
  default: mockEnv,
  envSchema: {
    safeParse: vi.fn().mockReturnValue({
      success: true,
      data: mockEnv,
    }),
  },
  parsedCorsOrigins: vi.fn().mockReturnValue([mockEnv.CORS_ORIGINS]),
}));

// Mock Redis module to prevent actual connection attempts
vi.mock("../redis.ts", () => mockRedisModule());

const serviceMocks = vi.hoisted(() => ({
  initiateUpload: vi.fn(),
  saveChunk: vi.fn(),
  finalizeUpload: vi.fn(),
  cleanupUpload: vi.fn(),
  cleanupExpiredUploads: vi.fn(),
  getMetadata: vi.fn(),
  getProgress: vi.fn(),
  updateProgress: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  cleanupProgress: vi.fn(),
}));

vi.mock("../services/chunkedUpload.ts", () => ({
  ChunkedUploadService: vi.fn().mockImplementation(function MockService() {
    return serviceMocks;
  }),
}));

vi.mock("../services/bucket.ts", () => ({
  BucketService: vi.fn().mockImplementation(function MockBucketService() {
    return {
      uploadToBucket: vi.fn().mockResolvedValue(undefined),
      createPresignedUrl: vi.fn().mockResolvedValue("https://example.com/presigned"),
    };
  }),
}));

vi.mock("../services/upload.ts", () => ({
  UploadService: vi.fn().mockImplementation(function MockUploadService() {
    return {
      buildObjectName: vi.fn().mockImplementation((prefix, name) => `${prefix}/${name}`),
      sanitizeKeySegment: vi.fn().mockImplementation((name) => name),
    };
  }),
}));

vi.mock("../middleware/logger.ts", () => ({
  appLogger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const handlers = await import("./chunkedUpload.ts");
const {
  initiateUpload,
  uploadChunk,
  finalizeUpload,
  cancelUpload,
  cleanupExpiredUploads,
  getUploadProgress,
} = handlers;

const createRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res as Response;
};

const createReq = (overrides: Partial<Request> = {}) => {
  const req: Partial<Request> = {
    query: {},
    body: {},
    params: {},
    headers: {},
    ...overrides,
  };
  return req as Request;
};

const resetMocks = () => {
  Object.values(serviceMocks).forEach((mockFn) => mockFn.mockReset());
};

describe("chunked upload handlers", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("initiateUpload", () => {
    it("returns 201 with uploadId on success", async () => {
      const req = createReq({
        body: {
          fileName: "test.txt",
          fileType: "text/plain",
          totalSize: 123,
          galleryName: "test-gallery",
          guildId: "test-guild-id",
        },
      });
      const res = createRes();
      serviceMocks.initiateUpload.mockResolvedValue({ uploadId: "test-upload-id" });

      await initiateUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ uploadId: "test-upload-id" });
    });

    it("returns 400 for invalid request body", async () => {
      const req = createReq({ body: {} }); // Missing required fields
      const res = createRes();

      await initiateUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid request body" });
    });

    it("returns 500 on service error", async () => {
      const req = createReq({
        body: {
          fileName: "test.txt",
          fileType: "text/plain",
          totalSize: 123,
          galleryName: "test-gallery",
          guildId: "test-guild-id",
        },
      });
      const res = createRes();
      serviceMocks.initiateUpload.mockRejectedValue(new Error("Internal error"));

      await initiateUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to initiate upload" });
    });
  });

  describe("uploadChunk", () => {
    const createDataEventReq = (
      query: Record<string, string>,
      chunks: Buffer[],
      headers: Record<string, string> = {},
    ) => {
      const req = createReq({ query });
      req.headers = { ...req.headers, ...headers };

      // Mock EventEmitter behavior for req.on('data'), req.on('end'), req.on('error')
      const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      req.on = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(listener);
        return req;
      });

      // Simulate emitting data events
      setImmediate(() => {
        try {
          chunks.forEach((chunk) => {
            listeners["data"]?.forEach((listener) => listener(chunk));
          });
          listeners["end"]?.forEach((listener) => listener());
        } catch (error) {
          listeners["error"]?.forEach((listener) => listener(error));
        }
      });

      return req;
    };

    it("returns 200 on successful chunk upload", async () => {
      const chunkData = Buffer.from("test data");
      const req = createDataEventReq({ uploadId: "test-id", index: "0" }, [chunkData]);
      const res = createRes();
      serviceMocks.saveChunk.mockResolvedValue(undefined);

      await uploadChunk(req, res);

      expect(serviceMocks.saveChunk).toHaveBeenCalledWith("test-id", 0, expect.any(Buffer));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, index: 0 });
    });

    it("returns 400 for invalid query parameters", async () => {
      const req = createDataEventReq({}, []);
      const res = createRes();

      await uploadChunk(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 413 when content-length exceeds limit", async () => {
      const req = createDataEventReq({ uploadId: "test-id", index: "0" }, [Buffer.from("test")], {
        "content-length": String(15 * 1024 * 1024),
      });
      const res = createRes();

      await uploadChunk(req, res);

      expect(res.status).toHaveBeenCalledWith(413);
    });

    it("returns 413 when streamed chunk data exceeds limit", async () => {
      // Create multiple small chunks that together exceed MAX_CHUNK_SIZE (10MB)
      const chunkSize = 3 * 1024 * 1024; // 3MB each
      const smallChunks = [
        Buffer.alloc(chunkSize, "a"),
        Buffer.alloc(chunkSize, "b"),
        Buffer.alloc(chunkSize, "c"),
        Buffer.alloc(chunkSize, "d"), // Total: 12MB > 10MB limit
      ];
      const req = createDataEventReq({ uploadId: "test-id", index: "0" }, smallChunks);
      const res = createRes();

      await uploadChunk(req, res);

      expect(res.status).toHaveBeenCalledWith(413);
    });

    it("returns 400 for empty chunk data", async () => {
      const req = createDataEventReq({ uploadId: "test-id", index: "0" }, []);
      const res = createRes();

      await uploadChunk(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Empty chunk data" });
    });

    it("returns 404 for non-existent upload session", async () => {
      const chunkData = Buffer.from("test data");
      const req = createDataEventReq({ uploadId: "non-existent", index: "0" }, [chunkData]);
      const res = createRes();
      serviceMocks.saveChunk.mockRejectedValue(new Error("Upload session not found"));

      await uploadChunk(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Upload session not found" });
    });
  });

  describe("finalizeUpload", () => {
    it("returns 500 when finalization fails", async () => {
      const req = createReq({ body: { uploadId: "test-id" } });
      const res = createRes();
      // Simulate existing metadata so handler does not return 404
      serviceMocks.getMetadata.mockReturnValue({
        fileName: "test.txt",
        fileType: "text/plain",
        galleryName: "test-gallery",
      });
      // Make finalizeUpload reject to trigger error handling
      serviceMocks.finalizeUpload.mockRejectedValue(new Error("Finalization failed"));

      await finalizeUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to finalize upload" });
    });

    it("returns 400 for invalid request body", async () => {
      const req = createReq({ body: {} });
      const res = createRes();

      await finalizeUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid request body" });
    });

    it("returns 404 for non-existent upload session", async () => {
      const req = createReq({ body: { uploadId: "non-existent" } });
      const res = createRes();
      // Simulate missing metadata
      serviceMocks.getMetadata.mockReturnValue(undefined);

      await finalizeUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Upload session not found" });
    });
  });

  describe("cancelUpload", () => {
    it("returns 200 on successful cancel", async () => {
      const req = createReq({ params: { uploadId: "test-id" } });
      const res = createRes();
      serviceMocks.cleanupUpload.mockResolvedValue(undefined);

      await cancelUpload(req, res);

      expect(serviceMocks.cleanupUpload).toHaveBeenCalledWith("test-id");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("returns 400 when uploadId is missing", async () => {
      const req = createReq({ params: {} });
      const res = createRes();

      await cancelUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing uploadId parameter" });
    });

    it("returns 500 on error", async () => {
      const req = createReq({ params: { uploadId: "test-id" } });
      const res = createRes();
      serviceMocks.cleanupUpload.mockRejectedValue(new Error("Cleanup failed"));

      await cancelUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to cancel upload" });
    });
  });

  describe("cleanupExpiredUploads", () => {
    it("returns 200 with cleanup count", async () => {
      const req = createReq();
      const res = createRes();
      serviceMocks.cleanupExpiredUploads.mockResolvedValue(5);

      await cleanupExpiredUploads(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ cleaned: 5 });
    });

    it("returns 500 on error", async () => {
      const req = createReq();
      const res = createRes();
      serviceMocks.cleanupExpiredUploads.mockRejectedValue(new Error("Cleanup failed"));

      await cleanupExpiredUploads(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to cleanup expired uploads" });
    });
  });

  describe("getUploadProgress", () => {
    it("returns 200 with progress data", async () => {
      const req = createReq({ params: { uploadId: "test-id" } });
      const res = createRes();
      const mockProgress = {
        uploadId: "test-id",
        status: "uploading",
        phase: "client-upload",
        progress: {
          totalBytes: 1000,
          uploadedBytes: 500,
          totalFiles: null,
          processedFiles: null,
        },
        error: null,
      };
      serviceMocks.getProgress.mockReturnValue(mockProgress);

      await getUploadProgress(req, res);

      expect(serviceMocks.getProgress).toHaveBeenCalledWith("test-id");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockProgress);
    });

    it("returns 400 when uploadId is missing", async () => {
      const req = createReq({ params: {} });
      const res = createRes();

      await getUploadProgress(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing uploadId parameter" });
    });

    it("returns 404 when progress not found", async () => {
      const req = createReq({ params: { uploadId: "non-existent" } });
      const res = createRes();
      serviceMocks.getProgress.mockReturnValue(undefined);

      await getUploadProgress(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Upload session not found" });
    });
  });
});
