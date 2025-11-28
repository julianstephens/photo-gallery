import { randomUUID } from "crypto";
import { createWriteStream, promises as fs } from "fs";
import os from "os";
import path from "path";
import type {
  FinalizeUploadResponse,
  InitiateUploadRequest,
  InitiateUploadResponse,
  UploadProgress,
  UploadProgressPhase,
  UploadProgressStatus,
} from "utils";
import { appLogger } from "../middleware/logger.ts";

const CHUNK_DIR_PREFIX = "chunked-upload-";
const CHUNK_FILE_PREFIX = "chunk-";
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PROGRESS_TTL_MS = 5 * 60 * 1000; // 5 minutes for completed/failed progress states

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
  galleryName: string;
  guildId: string;
  tempDir: string;
  createdAt: number;
  totalSize: number;
}

// In-memory store for upload metadata
// Note: This will lose sessions on restart, leaving orphaned temp files.
// In production, consider using Redis for persistence, or add a startup
// cleanup routine that scans os.tmpdir() for stale "chunked-upload-*" directories.
const uploadMetadata = new Map<string, ChunkedUploadMetadata>();

// In-memory store for upload progress state
// Tracks completedAt timestamp for TTL-based cleanup
interface ProgressStateEntry {
  progress: UploadProgress;
  completedAt: number | null;
}
const uploadProgressState = new Map<string, ProgressStateEntry>();

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
      galleryName: request.galleryName,
      guildId: request.guildId,
      tempDir,
      createdAt: Date.now(),
      totalSize: request.totalSize,
    };

    uploadMetadata.set(uploadId, metadata);

    // Initialize progress state
    const progressData: UploadProgress = {
      uploadId,
      status: "pending",
      phase: "client-upload",
      progress: {
        totalBytes: request.totalSize,
        uploadedBytes: 0,
        totalFiles: null,
        processedFiles: null,
      },
      error: null,
    };
    uploadProgressState.set(uploadId, { progress: progressData, completedAt: null });

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

    // Update progress state
    const entry = uploadProgressState.get(uploadId);
    if (entry) {
      entry.progress.status = "uploading";
      entry.progress.phase = "client-upload";
      entry.progress.progress.uploadedBytes =
        (entry.progress.progress.uploadedBytes ?? 0) + chunkBuffer.length;
    }
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

    // Update progress to processing/assembling phase
    this.updateProgress(uploadId, "processing", "server-assemble");

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

      // Track stream errors - use a single handler for the entire operation
      let streamError: Error | null = null;
      const handleStreamError = (error: Error) => {
        streamError = error;
      };
      writeStream.on("error", handleStreamError);

      // Write each chunk in order to the final file
      let totalBytesWritten = 0;
      for (const chunkFile of chunkFiles) {
        // Check if a stream error occurred in a previous iteration
        if (streamError) {
          throw streamError;
        }

        const chunkPath = path.join(metadata.tempDir, chunkFile);
        const chunkData = await fs.readFile(chunkPath);
        totalBytesWritten += chunkData.length;

        await new Promise<void>((resolve, _reject) => {
          // Use a single-use handler for this write operation
          const drainHandler = () => {
            resolve();
          };

          const canContinue = writeStream!.write(chunkData);
          if (canContinue) {
            // Data was written to the buffer immediately, resolve asynchronously
            // to ensure proper event ordering and prevent synchronous resolution
            setImmediate(resolve);
          } else {
            // Stream buffer full, wait for drain event before continuing
            writeStream!.once("drain", drainHandler);
          }
        });
      }

      // Close the write stream and ensure all data is flushed to disk
      await new Promise<void>((resolve, _reject) => {
        writeStream!.once("finish", () => {
          appLogger.debug({ uploadId, totalBytesWritten }, "[finalizeUpload] Stream finished");
          resolve();
        });
        // Error handler already registered above, so just end the stream
        writeStream!.end();
      });

      // Validate that the assembled file size matches the expected total size
      const stats = await fs.stat(finalPath);
      if (stats.size !== metadata.totalSize) {
        throw new Error(
          `Assembled file size (${stats.size} bytes) does not match expected total size (${metadata.totalSize} bytes). Upload may be incomplete or corrupted.`,
        );
      }

      // For zip files, validate the file signature
      if (metadata.fileName.toLowerCase().endsWith(".zip")) {
        const buffer = Buffer.alloc(4);
        const fd = await fs.open(finalPath, "r");
        try {
          await fd.read(buffer, 0, 4, 0);
          // ZIP files start with PK\x03\x04 or PK\x05\x06 or PK\x07\x08
          if (
            buffer[0] !== 0x50 ||
            buffer[1] !== 0x4b ||
            (buffer[2] !== 0x03 && buffer[2] !== 0x05 && buffer[2] !== 0x07) ||
            (buffer[3] !== 0x04 && buffer[3] !== 0x06 && buffer[3] !== 0x08)
          ) {
            throw new Error(
              "File does not appear to be a valid ZIP archive. The file signature is invalid.",
            );
          }
        } finally {
          await fd.close();
        }
      }

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
    // Note: We don't delete progress state here - it's cleaned up separately
    // so clients can poll for completion status after finalization
  }

  /**
   * Clean up all expired upload sessions.
   * Also cleans up completed/failed progress states that have exceeded their TTL.
   * @returns The number of sessions that were cleaned up.
   */
  async cleanupExpiredUploads(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [uploadId, metadata] of uploadMetadata.entries()) {
      if (now - metadata.createdAt > UPLOAD_TTL_MS) {
        await this.cleanupUpload(uploadId);
        // Also remove progress state for expired uploads
        uploadProgressState.delete(uploadId);
        cleanedCount++;
      }
    }

    // Clean up completed/failed progress states that have exceeded their TTL
    for (const [uploadId, entry] of uploadProgressState.entries()) {
      if (entry.completedAt && now - entry.completedAt > PROGRESS_TTL_MS) {
        uploadProgressState.delete(uploadId);
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

  /**
   * Get the current progress state for an upload.
   * @param uploadId - The unique upload session identifier.
   * @returns The current progress state, or undefined if not found.
   */
  getProgress(uploadId: string): UploadProgress | undefined {
    const entry = uploadProgressState.get(uploadId);
    return entry?.progress;
  }

  /**
   * Update the progress state for an upload.
   * @param uploadId - The unique upload session identifier.
   * @param status - The new status.
   * @param phase - The new phase.
   * @param progressUpdate - Optional partial progress updates.
   */
  updateProgress(
    uploadId: string,
    status: UploadProgressStatus,
    phase: UploadProgressPhase,
    progressUpdate?: Partial<UploadProgress["progress"]>,
  ): void {
    const entry = uploadProgressState.get(uploadId);
    if (entry) {
      entry.progress.status = status;
      entry.progress.phase = phase;
      if (progressUpdate) {
        Object.assign(entry.progress.progress, progressUpdate);
      }
      // Set completedAt timestamp when status becomes completed or failed
      if ((status === "completed" || status === "failed") && !entry.completedAt) {
        entry.completedAt = Date.now();
      }
    }
  }

  /**
   * Mark an upload as completed.
   * @param uploadId - The unique upload session identifier.
   */
  markCompleted(uploadId: string): void {
    const entry = uploadProgressState.get(uploadId);
    if (entry) {
      entry.progress.status = "completed";
      if (!entry.completedAt) {
        entry.completedAt = Date.now();
      }
    }
  }

  /**
   * Mark an upload as failed with an error message.
   * @param uploadId - The unique upload session identifier.
   * @param error - The error message.
   */
  markFailed(uploadId: string, error: string): void {
    const entry = uploadProgressState.get(uploadId);
    if (entry) {
      entry.progress.status = "failed";
      entry.progress.error = error;
      if (!entry.completedAt) {
        entry.completedAt = Date.now();
      }
    }
  }

  /**
   * Clean up progress state for a specific upload.
   * Called after the client has retrieved the final status or after a timeout.
   * @param uploadId - The unique upload session identifier.
   */
  cleanupProgress(uploadId: string): void {
    uploadProgressState.delete(uploadId);
  }
}
