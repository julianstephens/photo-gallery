import { randomUUID } from "crypto";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import type { InitiateUploadRequest, InitiateUploadResponse, FinalizeUploadResponse } from "utils";

const CHUNK_DIR_PREFIX = "chunked-upload-";
const CHUNK_FILE_PREFIX = "chunk-";
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ChunkedUploadMetadata {
  uploadId: string;
  fileName: string;
  fileType: string;
  tempDir: string;
  createdAt: number;
}

// In-memory store for upload metadata
// In production, this should be stored in Redis for persistence across restarts
const uploadMetadata = new Map<string, ChunkedUploadMetadata>();

export class ChunkedUploadService {
  /**
   * Initiate a new chunked upload session
   */
  async initiateUpload(request: InitiateUploadRequest): Promise<InitiateUploadResponse> {
    const uploadId = randomUUID();
    const tempDir = path.join(os.tmpdir(), `${CHUNK_DIR_PREFIX}${uploadId}`);

    await fs.mkdir(tempDir, { recursive: true });

    const metadata: ChunkedUploadMetadata = {
      uploadId,
      fileName: request.fileName,
      fileType: request.fileType,
      tempDir,
      createdAt: Date.now(),
    };

    uploadMetadata.set(uploadId, metadata);

    return { uploadId };
  }

  /**
   * Save a chunk to the temporary directory
   */
  async saveChunk(uploadId: string, chunkIndex: number, chunkBuffer: Buffer): Promise<void> {
    const metadata = uploadMetadata.get(uploadId);
    if (!metadata) {
      throw new Error(`Upload session not found: ${uploadId}`);
    }

    // Ensure temp directory still exists
    try {
      await fs.access(metadata.tempDir);
    } catch {
      throw new Error(`Upload session expired or temp directory missing: ${uploadId}`);
    }

    const chunkPath = path.join(metadata.tempDir, `${CHUNK_FILE_PREFIX}${chunkIndex}`);
    await fs.writeFile(chunkPath, chunkBuffer);
  }

  /**
   * Finalize the upload by reassembling all chunks
   */
  async finalizeUpload(uploadId: string): Promise<FinalizeUploadResponse> {
    const metadata = uploadMetadata.get(uploadId);
    if (!metadata) {
      throw new Error(`Upload session not found: ${uploadId}`);
    }

    try {
      // Read all chunk files and sort them numerically
      const files = await fs.readdir(metadata.tempDir);
      const chunkFiles = files
        .filter((f) => f.startsWith(CHUNK_FILE_PREFIX))
        .sort((a, b) => {
          const indexA = parseInt(a.replace(CHUNK_FILE_PREFIX, ""), 10);
          const indexB = parseInt(b.replace(CHUNK_FILE_PREFIX, ""), 10);
          return indexA - indexB;
        });

      if (chunkFiles.length === 0) {
        throw new Error(`No chunks found for upload: ${uploadId}`);
      }

      // Create final file path
      const finalPath = path.join(os.tmpdir(), `${uploadId}-${metadata.fileName}`);

      // Create writable stream for final file
      const writeStream = createWriteStream(finalPath);

      // Pipe each chunk in order to the final file
      for (const chunkFile of chunkFiles) {
        const chunkPath = path.join(metadata.tempDir, chunkFile);
        const readStream = createReadStream(chunkPath);
        await pipeline(readStream, writeStream, { end: false });
      }

      // Close the write stream
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      // Cleanup: remove temp directory
      await this.cleanupUpload(uploadId);

      return {
        success: true,
        filePath: finalPath,
      };
    } catch (error) {
      // Cleanup on error
      await this.cleanupUpload(uploadId);
      throw error;
    }
  }

  /**
   * Clean up a specific upload session
   */
  async cleanupUpload(uploadId: string): Promise<void> {
    const metadata = uploadMetadata.get(uploadId);
    if (!metadata) {
      return;
    }

    try {
      await fs.rm(metadata.tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors during cleanup
    }

    uploadMetadata.delete(uploadId);
  }

  /**
   * Clean up all expired upload sessions
   */
  async cleanupExpiredUploads(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [uploadId, metadata] of uploadMetadata.entries()) {
      if (now - metadata.createdAt > UPLOAD_TTL_MS) {
        await this.cleanupUpload(uploadId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get upload metadata (for testing/debugging)
   */
  getMetadata(uploadId: string): ChunkedUploadMetadata | undefined {
    return uploadMetadata.get(uploadId);
  }
}
