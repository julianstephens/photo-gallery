import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChunkedUploadService } from "./chunkedUpload.ts";

describe("ChunkedUploadService", () => {
  let service: ChunkedUploadService;

  beforeEach(() => {
    service = new ChunkedUploadService();
  });

  afterEach(async () => {
    // Cleanup any test uploads
    vi.restoreAllMocks();
  });

  describe("initiateUpload", () => {
    it("creates an upload session with a unique uploadId", async () => {
      const result = await service.initiateUpload({
        fileName: "test.txt",
        fileType: "text/plain",
      });

      expect(result.uploadId).toBeDefined();
      expect(typeof result.uploadId).toBe("string");
      expect(result.uploadId.length).toBeGreaterThan(0);

      // Cleanup
      await service.cleanupUpload(result.uploadId);
    });

    it("creates a temp directory for the upload", async () => {
      const result = await service.initiateUpload({
        fileName: "test.txt",
        fileType: "text/plain",
      });

      const metadata = service.getMetadata(result.uploadId);
      expect(metadata).toBeDefined();
      expect(metadata?.tempDir).toBeDefined();

      // Verify directory exists
      const stats = await fs.stat(metadata!.tempDir);
      expect(stats.isDirectory()).toBe(true);

      // Cleanup
      await service.cleanupUpload(result.uploadId);
    });

    it("stores file metadata", async () => {
      const result = await service.initiateUpload({
        fileName: "myfile.zip",
        fileType: "application/zip",
      });

      const metadata = service.getMetadata(result.uploadId);
      expect(metadata?.fileName).toBe("myfile.zip");
      expect(metadata?.fileType).toBe("application/zip");
      expect(metadata?.createdAt).toBeLessThanOrEqual(Date.now());

      // Cleanup
      await service.cleanupUpload(result.uploadId);
    });
  });

  describe("saveChunk", () => {
    it("saves a chunk to the temp directory", async () => {
      const { uploadId } = await service.initiateUpload({
        fileName: "test.txt",
        fileType: "text/plain",
      });

      const chunkData = Buffer.from("Hello, World!");
      await service.saveChunk(uploadId, 0, chunkData);

      const metadata = service.getMetadata(uploadId);
      const chunkPath = path.join(metadata!.tempDir, "chunk-0");
      const savedData = await fs.readFile(chunkPath);

      expect(savedData.toString()).toBe("Hello, World!");

      // Cleanup
      await service.cleanupUpload(uploadId);
    });

    it("saves multiple chunks with correct indices", async () => {
      const { uploadId } = await service.initiateUpload({
        fileName: "test.txt",
        fileType: "text/plain",
      });

      await service.saveChunk(uploadId, 0, Buffer.from("Chunk 0"));
      await service.saveChunk(uploadId, 1, Buffer.from("Chunk 1"));
      await service.saveChunk(uploadId, 2, Buffer.from("Chunk 2"));

      const metadata = service.getMetadata(uploadId);
      const files = await fs.readdir(metadata!.tempDir);

      expect(files).toHaveLength(3);
      expect(files.sort()).toEqual(["chunk-0", "chunk-1", "chunk-2"]);

      // Cleanup
      await service.cleanupUpload(uploadId);
    });

    it("throws error for invalid uploadId", async () => {
      await expect(service.saveChunk("invalid-id", 0, Buffer.from("data"))).rejects.toThrow(
        "Upload session not found",
      );
    });
  });

  describe("finalizeUpload", () => {
    it("assembles chunks in correct order", async () => {
      const { uploadId } = await service.initiateUpload({
        fileName: "test.txt",
        fileType: "text/plain",
      });

      // Save chunks out of order
      await service.saveChunk(uploadId, 2, Buffer.from("World!"));
      await service.saveChunk(uploadId, 0, Buffer.from("Hello, "));
      await service.saveChunk(uploadId, 1, Buffer.from("Beautiful "));

      const result = await service.finalizeUpload(uploadId);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();

      // Read the final file
      const finalContent = await fs.readFile(result.filePath);
      expect(finalContent.toString()).toBe("Hello, Beautiful World!");

      // Cleanup final file
      await fs.unlink(result.filePath);
    });

    it("cleans up temp directory after successful finalization", async () => {
      const { uploadId } = await service.initiateUpload({
        fileName: "test.txt",
        fileType: "text/plain",
      });

      const metadata = service.getMetadata(uploadId);
      const tempDir = metadata!.tempDir;

      await service.saveChunk(uploadId, 0, Buffer.from("data"));
      await service.finalizeUpload(uploadId);

      // Verify temp directory is removed
      await expect(fs.access(tempDir)).rejects.toThrow();

      // Cleanup final file
      const finalPath = path.join(os.tmpdir(), `${uploadId}-test.txt`);
      try {
        await fs.unlink(finalPath);
      } catch {
        // Ignore if already deleted
      }
    });

    it("throws error for invalid uploadId", async () => {
      await expect(service.finalizeUpload("invalid-id")).rejects.toThrow(
        "Upload session not found",
      );
    });

    it("throws error when no chunks exist", async () => {
      const { uploadId } = await service.initiateUpload({
        fileName: "test.txt",
        fileType: "text/plain",
      });

      await expect(service.finalizeUpload(uploadId)).rejects.toThrow("No chunks found");
    });
  });

  describe("cleanupUpload", () => {
    it("removes temp directory and metadata", async () => {
      const { uploadId } = await service.initiateUpload({
        fileName: "test.txt",
        fileType: "text/plain",
      });

      const metadata = service.getMetadata(uploadId);
      const tempDir = metadata!.tempDir;

      await service.cleanupUpload(uploadId);

      // Verify metadata is removed
      expect(service.getMetadata(uploadId)).toBeUndefined();

      // Verify temp directory is removed
      await expect(fs.access(tempDir)).rejects.toThrow();
    });

    it("handles non-existent uploads gracefully", async () => {
      await expect(service.cleanupUpload("non-existent")).resolves.not.toThrow();
    });
  });

  describe("cleanupExpiredUploads", () => {
    it("removes expired uploads", async () => {
      const { uploadId } = await service.initiateUpload({
        fileName: "test.txt",
        fileType: "text/plain",
      });

      // Mock the creation time to be old
      const metadata = service.getMetadata(uploadId);
      if (metadata) {
        (metadata as { createdAt: number }).createdAt = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      }

      const cleaned = await service.cleanupExpiredUploads();

      expect(cleaned).toBe(1);
      expect(service.getMetadata(uploadId)).toBeUndefined();
    });

    it("does not remove non-expired uploads", async () => {
      const { uploadId } = await service.initiateUpload({
        fileName: "test.txt",
        fileType: "text/plain",
      });

      const cleaned = await service.cleanupExpiredUploads();

      expect(cleaned).toBe(0);
      expect(service.getMetadata(uploadId)).toBeDefined();

      // Cleanup
      await service.cleanupUpload(uploadId);
    });
  });
});
