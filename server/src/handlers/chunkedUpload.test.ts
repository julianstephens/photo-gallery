import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  initiateUpload: vi.fn(),
  saveChunk: vi.fn(),
  finalizeUpload: vi.fn(),
  cleanupUpload: vi.fn(),
  cleanupExpiredUploads: vi.fn(),
}));

vi.mock("../services/chunkedUpload.ts", () => ({
  ChunkedUploadService: vi.fn().mockImplementation(function MockService() {
    return serviceMocks;
  }),
}));

vi.mock("../middleware/logger.ts", () => ({
  appLogger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const handlers = await import("./chunkedUpload.ts");
const { initiateUpload, uploadChunk, finalizeUpload, cancelUpload, cleanupExpiredUploads } =
  handlers;

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
      const req = createReq({ body: { fileName: "test.txt", fileType: "text/plain" } });
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
      const req = createReq({ body: { fileName: "test.txt", fileType: "text/plain" } });
      const res = createRes();
      serviceMocks.initiateUpload.mockRejectedValue(new Error("Internal error"));

      await initiateUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to initiate upload" });
    });
  });

  describe("uploadChunk", () => {
    const createAsyncIterableReq = (
      query: Record<string, string>,
      chunks: Buffer[],
      headers: Record<string, string> = {},
    ) => {
      const req = createReq({ query });
      req.headers = { ...req.headers, ...headers };
      // Create a proper async iterable
      const iterator = {
        current: 0,
        chunks,
        async next() {
          if (this.current < this.chunks.length) {
            return { value: this.chunks[this.current++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
      Object.assign(req, {
        [Symbol.asyncIterator]: () => iterator,
      });
      return req;
    };

    it("returns 200 on successful chunk upload", async () => {
      const chunkData = Buffer.from("test data");
      const req = createAsyncIterableReq({ uploadId: "test-id", index: "0" }, [chunkData]);
      const res = createRes();
      serviceMocks.saveChunk.mockResolvedValue(undefined);

      await uploadChunk(req, res);

      expect(serviceMocks.saveChunk).toHaveBeenCalledWith("test-id", 0, expect.any(Buffer));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, index: 0 });
    });

    it("returns 400 for invalid query parameters", async () => {
      const req = createAsyncIterableReq({}, []);
      const res = createRes();

      await uploadChunk(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 413 when content-length exceeds limit", async () => {
      const req = createAsyncIterableReq(
        { uploadId: "test-id", index: "0" },
        [Buffer.from("test")],
        { "content-length": String(15 * 1024 * 1024) },
      );
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
      const req = createAsyncIterableReq({ uploadId: "test-id", index: "0" }, smallChunks);
      const res = createRes();

      await uploadChunk(req, res);

      expect(res.status).toHaveBeenCalledWith(413);
    });

    it("returns 400 for empty chunk data", async () => {
      const req = createAsyncIterableReq({ uploadId: "test-id", index: "0" }, []);
      const res = createRes();

      await uploadChunk(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Empty chunk data" });
    });

    it("returns 404 for non-existent upload session", async () => {
      const chunkData = Buffer.from("test data");
      const req = createAsyncIterableReq({ uploadId: "non-existent", index: "0" }, [chunkData]);
      const res = createRes();
      serviceMocks.saveChunk.mockRejectedValue(new Error("Upload session not found"));

      await uploadChunk(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Upload session not found" });
    });
  });

  describe("finalizeUpload", () => {
    it("returns 200 with file path on success", async () => {
      const req = createReq({ body: { uploadId: "test-id" } });
      const res = createRes();
      serviceMocks.finalizeUpload.mockResolvedValue({
        success: true,
        filePath: "/tmp/final-file.txt",
      });

      await finalizeUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        filePath: "/tmp/final-file.txt",
      });
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
      serviceMocks.finalizeUpload.mockRejectedValue(new Error("Upload session not found"));

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
});
