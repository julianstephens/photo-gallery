import { readFileSync, rmSync, statSync } from "fs";
import unzipper from "unzipper";
import { describe, expect, it, vi } from "vitest";
import { mockEnvModule } from "../utils/test-mocks.ts";

// Mock env to prevent dotenv loading
vi.mock("../schemas/env.ts", () => mockEnvModule());

import { ChunkedUploadService } from "./chunkedUpload.ts";

describe("ChunkedUploadService", () => {
  // Integration test for large ZIP files - requires test data
  // Skipped in CI/CD via .skip() pattern if needed
  it("should properly assemble and validate a 107MB ZIP file", { timeout: 60000 }, async () => {
    const service = new ChunkedUploadService();
    const testZipPath = "/home/julian/workspace/photo-gallery/data/Saved Pictures.zip";

    // Read the real ZIP file
    const fileData = readFileSync(testZipPath);
    const fileSize = fileData.length;
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks

    // Initiate upload
    const initResult = await service.initiateUpload({
      fileName: "Saved Pictures.zip",
      fileType: "application/x-zip-compressed",
      galleryName: "test-gallery",
      totalSize: fileSize,
    });

    const uploadId = initResult.uploadId;
    expect(uploadId).toBeDefined();

    // Upload all chunks
    let uploadedBytes = 0;
    for (let i = 0; i < fileSize; i += chunkSize) {
      const chunk = fileData.slice(i, Math.min(i + chunkSize, fileSize));
      const chunkIndex = Math.floor(i / chunkSize);

      await service.saveChunk(uploadId, chunkIndex, chunk);
      uploadedBytes += chunk.length;
    }

    expect(uploadedBytes).toBe(fileSize);

    // Finalize upload
    const finalResult = await service.finalizeUpload(uploadId);

    expect(finalResult.success).toBe(true);
    expect(finalResult.filePath).toBeDefined();

    // Verify assembled file size matches original
    const stats = statSync(finalResult.filePath);
    expect(stats.size).toBe(fileSize);

    // Verify ZIP structure is intact
    const zipFile = await unzipper.Open.file(finalResult.filePath);
    const fileCount = Object.keys(zipFile.files).length;
    expect(fileCount).toBeGreaterThan(0);

    // Cleanup
    rmSync(finalResult.filePath, { force: true });
  });
});
