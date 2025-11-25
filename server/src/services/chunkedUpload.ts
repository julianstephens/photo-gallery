import { randomUUID } from "crypto";
import { createWriteStream, promises as fs } from "fs";
import os from "os";
import path from "path";
import type { InitiateUploadRequest, InitiateUploadResponse, FinalizeUploadResponse } from "utils";

const CHUNK_DIR_PREFIX = "chunked-upload-";
const CHUNK_FILE_PREFIX = "chunk-";
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Sanitize a filename to prevent path traversal attacks.
 * Removes directory separators and keeps only the base name.
 * Returns a safe fallback if the sanitized name is empty or invalid.
 */
function sanitizeFileName(fileName: string): string {
  // Get only the base name, removing any directory components
  const baseName = path.basename(fileName);
  // Replace any remaining potentially dangerous characters (excluding control chars to satisfy linter)
  const sanitized = baseName.replace(/[<>:"|?*]/g, "_");
  // If the sanitized name is empty, ".", or "..", use a safe fallback
  if (!sanitized || sanitized === "." || sanitized === "..") {
    return `upload-${randomUUID()}`;
  }
  return sanitized;
}

export interface ChunkedUploadMetadata {
  uploadId: string;
  fileName: string;
  fileType: string;
  tempDir: string;
  createdAt: number;
}

// In-memory store for upload metadata
// Note: This will lose sessions on restart, leaving orphaned temp files.
// In production, consider using Redis for persistence, or add a startup
// cleanup routine that scans os.tmpdir() for stale "chunked-upload-*" directories.
const uploadMetadata = new Map<string, ChunkedUploadMetadata>();

export class ChunkedUploadService {
  /**
   * Initiate a new chunked upload session.
   * @param request - The upload initiation request containing fileName and fileType.
   * @returns The upload session response containing the unique uploadId.
   */
  async initiateUpload(request: InitiateUploadRequest): Promise<InitiateUploadResponse> {
    const uploadId = randomUUID();
    const tempDir = path.join(os.tmpdir(), `${CHUNK_DIR_PREFIX}${uploadId}`);

    await fs.mkdir(tempDir, { recursive: true });

    // Sanitize the file name to prevent path traversal attacks
    const safeFileName = sanitizeFileName(request.fileName);

    const metadata: ChunkedUploadMetadata = {
      uploadId,
      fileName: safeFileName,
      fileType: request.fileType,
      tempDir,
      createdAt: Date.now(),
    };

    uploadMetadata.set(uploadId, metadata);

    return { uploadId };
  }

  /**
   * Save a chunk to the temporary directory.
   * @param uploadId - The unique upload session identifier.
   * @param chunkIndex - The zero-based index of this chunk.
   * @param chunkBuffer - The chunk data as a Buffer.
   * @throws Error if the upload session is not found or has expired.
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
   * Finalize the upload by reassembling all chunks into a single file.
   *
   * **Note:** The returned `filePath` points to a file in `os.tmpdir()`. The caller
   * is responsible for moving this file to a permanent location or cleaning it up
   * after processing to prevent disk space issues.
   *
   * @param uploadId - The unique upload session identifier.
   * @returns The finalization result containing success status and file path.
   * @throws Error if the upload session is not found, no chunks exist, or chunks are not contiguous.
   */
  async finalizeUpload(uploadId: string): Promise<FinalizeUploadResponse> {
    const metadata = uploadMetadata.get(uploadId);
    if (!metadata) {
      throw new Error(`Upload session not found: ${uploadId}`);
    }

    let writeStream: ReturnType<typeof createWriteStream> | null = null;

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

      // Validate that chunk indices are contiguous (0, 1, 2, ..., N-1)
      for (let i = 0; i < chunkFiles.length; i++) {
        const expectedIndex = i;
        const actualIndex = parseInt(chunkFiles[i].replace(CHUNK_FILE_PREFIX, ""), 10);
        if (actualIndex !== expectedIndex) {
          throw new Error(
            `Missing or out-of-order chunk: expected index ${expectedIndex}, found ${actualIndex}`,
          );
        }
      }

      // Create final file path (fileName is already sanitized during initiation)
      const finalPath = path.join(os.tmpdir(), `${uploadId}-${metadata.fileName}`);

      // Create writable stream for final file
      writeStream = createWriteStream(finalPath);

      // Write each chunk in order to the final file
      for (const chunkFile of chunkFiles) {
        const chunkPath = path.join(metadata.tempDir, chunkFile);
        const chunkData = await fs.readFile(chunkPath);
        await new Promise<void>((resolve, reject) => {
          writeStream!.write(chunkData, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Close the write stream
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream!.on("finish", resolve);
        writeStream!.on("error", reject);
      });

      return {
        success: true,
        filePath: finalPath,
      };
    } catch (error) {
      // Destroy stream on error to prevent resource leaks
      if (writeStream) {
        writeStream.destroy();
      }
      throw error;
    } finally {
      // Always cleanup the upload session
      await this.cleanupUpload(uploadId);
    }
  }

  /**
   * Clean up a specific upload session and its temporary files.
   * @param uploadId - The unique upload session identifier.
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
   * Clean up all expired upload sessions.
   * @returns The number of sessions that were cleaned up.
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
   * Get upload metadata (for testing/debugging).
   * @param uploadId - The unique upload session identifier.
   * @returns The metadata for the upload session, or undefined if not found.
   */
  getMetadata(uploadId: string): ChunkedUploadMetadata | undefined {
    return uploadMetadata.get(uploadId);
  }
}
