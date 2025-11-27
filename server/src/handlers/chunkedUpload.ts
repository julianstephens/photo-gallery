import type { Request, Response } from "express";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";
import unzipper from "unzipper";
import {
  finalizeUploadRequestSchema,
  initiateUploadRequestSchema,
  uploadChunkQuerySchema,
} from "utils";
import { ZodError } from "zod";
import { appLogger } from "../middleware/logger.ts";
import { BucketService } from "../services/bucket.ts";
import { ChunkedUploadService } from "../services/chunkedUpload.ts";
import { UploadService } from "../services/upload.ts";

const chunkedUploadService = new ChunkedUploadService();
const bucketService = new BucketService();
const uploadService = new UploadService();

// Maximum allowed chunk size (10MB) to prevent memory exhaustion
const MAX_CHUNK_SIZE = 10 * 1024 * 1024;
const CHUNK_SIZE_ERROR = `Chunk size exceeds maximum allowed (${MAX_CHUNK_SIZE / (1024 * 1024)}MB)`;

export const initiateUpload = async (req: Request, res: Response) => {
  try {
    const body = initiateUploadRequestSchema.parse(req.body);
    const result = await chunkedUploadService.initiateUpload(body);
    res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid request body" });
    }
    appLogger.error({ err }, "[initiateUpload] error");
    res.status(500).json({ error: "Failed to initiate upload" });
  }
};

export const uploadChunk = async (req: Request, res: Response) => {
  try {
    const query = uploadChunkQuerySchema.parse(req.query);
    const { uploadId, index } = query;

    // Validate Content-Length header if present
    const contentLength = req.headers["content-length"];
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (length > MAX_CHUNK_SIZE) {
        return res.status(413).json({ error: CHUNK_SIZE_ERROR });
      }
    }

    // Get the chunk data from request body (raw buffer) with size limit
    const chunks: Buffer[] = [];
    let totalSize = 0;
    for await (const chunk of req) {
      totalSize += chunk.length;
      if (totalSize > MAX_CHUNK_SIZE) {
        return res.status(413).json({ error: CHUNK_SIZE_ERROR });
      }
      chunks.push(chunk);
    }
    const chunkBuffer = Buffer.concat(chunks);

    if (chunkBuffer.length === 0) {
      return res.status(400).json({ error: "Empty chunk data" });
    }

    await chunkedUploadService.saveChunk(uploadId, index, chunkBuffer);
    res.status(200).json({ success: true, index });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid query parameters" });
    }
    if ((err as Error)?.message?.includes("not found")) {
      return res.status(404).json({ error: "Upload session not found" });
    }
    appLogger.error({ err }, "[uploadChunk] error");
    res.status(500).json({ error: "Failed to upload chunk" });
  }
};

export const finalizeUpload = async (req: Request, res: Response) => {
  try {
    const body = finalizeUploadRequestSchema.parse(req.body);
    const { uploadId } = body;
    const metadata = chunkedUploadService.getMetadata(uploadId);
    if (!metadata) {
      return res.status(404).json({ error: "Upload session not found" });
    }

    const result = await chunkedUploadService.finalizeUpload(uploadId);
    const finalizedPath = result.filePath;
    const uploadDatePrefix = `uploads/${new Date().toISOString().split("T")[0]}`;

    // If this looks like a zip upload, extract and upload individual files instead of the archive
    const ext = extname(metadata.fileName || "").toLowerCase();
    const looksLikeZipByExt = ext === ".zip";
    const shouldTreatAsZip = looksLikeZipByExt;

    if (!shouldTreatAsZip) {
      // Update progress for single file upload
      chunkedUploadService.updateProgress(uploadId, "processing", "server-upload", {
        totalFiles: 1,
        processedFiles: 0,
      });

      const objectName = uploadService.buildObjectName(uploadDatePrefix, metadata.fileName);
      await bucketService.uploadToBucket(metadata.galleryName, objectName, finalizedPath);
      await rm(finalizedPath, { force: true }).catch(() => {});

      // Mark upload as completed
      chunkedUploadService.updateProgress(uploadId, "completed", "server-upload", {
        processedFiles: 1,
      });
      return res.status(200).json(result);
    }

    // Zip handling path: extract to a temp directory and upload contained image files
    const tempRoot = tmpdir();
    const extractDir = join(tempRoot, `gallery-upload-${uploadId}-${Date.now()}`);

    // Update progress for zip extraction phase
    chunkedUploadService.updateProgress(uploadId, "processing", "server-zip-extract");

    try {
      // Track discovered files during extraction
      const discoveredFiles: string[] = [];

      await new Promise<void>((resolve, reject) => {
        const sourceStream = createReadStream(finalizedPath);
        sourceStream.on("error", (e) => reject(e));
        const stream = sourceStream
          .pipe(unzipper.Parse())
          .on("entry", async (entry) => {
            const fileName = entry.path || "";
            const type = entry.type; // "File" or "Directory"

            if (type === "Directory") {
              entry.autodrain();
              return;
            }

            const safeName = uploadService.sanitizeKeySegment(fileName);
            if (!safeName) {
              entry.autodrain();
              return;
            }

            // Skip macOS resource fork files like ._IMG_XXXX.JPG
            if (safeName.startsWith("._")) {
              entry.autodrain();
              return;
            }

            discoveredFiles.push(safeName);

            const destPath = join(extractDir, safeName);
            const lastSlash = destPath.lastIndexOf("/");
            const destDir = lastSlash === -1 ? extractDir : destPath.slice(0, lastSlash);

            // Ensure parent directory exists before writing the file
            await mkdir(destDir, { recursive: true }).catch(() => {});

            const writeStream = createWriteStream(destPath);
            entry.pipe(writeStream);
          })
          .on("close", () => resolve())
          .on("error", (e) => reject(e));

        stream.on("error", (e) => reject(e));
      });

      // Update progress with total files discovered
      chunkedUploadService.updateProgress(uploadId, "processing", "server-upload", {
        totalFiles: discoveredFiles.length,
        processedFiles: 0,
      });

      // Now walk the extracted directory and upload files
      // Lazy import to avoid top-level dependency for recursion
      const { readdir, stat } = await import("fs/promises");

      let processedCount = 0;

      const walkAndUpload = async (dir: string) => {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walkAndUpload(fullPath);
            continue;
          }

          const fileStat = await stat(fullPath);
          if (!fileStat.isFile()) continue;

          const relPath = fullPath.replace(extractDir + "/", "");
          const objectName = uploadService.buildObjectName(uploadDatePrefix, relPath);
          await bucketService.uploadToBucket(metadata.galleryName, objectName, fullPath);

          // Update progress after each file upload
          processedCount++;
          chunkedUploadService.updateProgress(uploadId, "processing", "server-upload", {
            processedFiles: processedCount,
          });
        }
      };

      await walkAndUpload(extractDir);

      // Mark upload as completed
      chunkedUploadService.markCompleted(uploadId);
    } catch (zipErr) {
      appLogger.error({ err: zipErr }, "[finalizeUpload] error while processing zip upload");
      chunkedUploadService.markFailed(uploadId, "Failed to process zip upload");
      return res.status(500).json({ error: "Failed to process zip upload" });
    } finally {
      await rm(finalizedPath, { force: true }).catch(() => {});
      await rm(extractDir, { recursive: true, force: true }).catch(() => {});
    }

    return res.status(200).json({ ...result, zipped: true });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid request body" });
    }
    if ((err as Error)?.message?.includes("not found")) {
      return res.status(404).json({ error: "Upload session not found" });
    }
    appLogger.error({ err }, "[finalizeUpload] error");
    res.status(500).json({ error: "Failed to finalize upload" });
  }
};

// Get upload progress
export const getUploadProgress = async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;
    if (!uploadId) {
      return res.status(400).json({ error: "Missing uploadId parameter" });
    }

    const progress = chunkedUploadService.getProgress(uploadId);
    if (!progress) {
      return res.status(404).json({ error: "Upload session not found" });
    }

    res.status(200).json(progress);
  } catch (err: unknown) {
    appLogger.error({ err }, "[getUploadProgress] error");
    res.status(500).json({ error: "Failed to get upload progress" });
  }
};

// Cancel and cleanup a specific upload session
export const cancelUpload = async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;
    if (!uploadId) {
      return res.status(400).json({ error: "Missing uploadId parameter" });
    }
    await chunkedUploadService.cleanupUpload(uploadId);
    chunkedUploadService.cleanupProgress(uploadId);
    res.status(200).json({ success: true });
  } catch (err: unknown) {
    appLogger.error({ err }, "[cancelUpload] error");
    res.status(500).json({ error: "Failed to cancel upload" });
  }
};

// Cleanup endpoint (could be called by a cron job or manually)
export const cleanupExpiredUploads = async (_req: Request, res: Response) => {
  try {
    const cleaned = await chunkedUploadService.cleanupExpiredUploads();
    res.status(200).json({ cleaned });
  } catch (err: unknown) {
    appLogger.error({ err }, "[cleanupExpiredUploads] error");
    res.status(500).json({ error: "Failed to cleanup expired uploads" });
  }
};
